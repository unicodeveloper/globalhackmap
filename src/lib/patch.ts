import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { beforeDeadline } from "@/lib/fetched";
import { reserveSharedWork } from "@/lib/http/paid-budget";
import { findVuln } from "@/lib/lookup";
import { productLabel } from "@/lib/og/copy";
import { getSnapshot } from "@/lib/snapshot";
import type { Explainer, PatchItem, Vuln } from "@/lib/types";
import { valyuServer } from "@/lib/valyu/server";
import { tidyVendor as tidy, vendorDomain } from "@/lib/vendors";

const EXPLAINER_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "What attackers can do, in plain English, 4 to 9 words. Start with the product name. No CVE ID." },
    who: { type: "string", description: "Who is affected, plain English, 6 to 16 words, e.g. 'Anyone running a self-hosted GitLab server'." },
    fix: { type: "string", description: "The fix in 6 to 16 words, naming the fixed version or the vendor mitigation." },
  },
  required: ["title", "who", "fix"],
};

const clean = (text: string) =>
  text
    .replace(/\s*\u2014\s*/g, ", ")
    .replace(/\s*\(Sources? [^)]*\)/g, "")
    .trim();

/** Well inside the time a cache fill may take while prerendering; past it the build fails outright. */
const EXPLAIN_TIMEOUT_MS = 30_000;

/**
 * A researched plain-English explainer for one CVE, from Valyu's answer API with live search. Keyed by
 * the CVE alone (the record is looked up inside), so every surface shows the same answer and each CVE is
 * paid for once a week (about $0.03) across all instances. A failure or a slow answer is kept for
 * minutes, not a week.
 */
export async function explainCve(cve: string): Promise<Explainer | null> {
  "use cache: remote";
  const explainer = await beforeDeadline(requestExplainer(cve), EXPLAIN_TIMEOUT_MS, null).catch(() => null);
  if (explainer) cacheLife("paid");
  else cacheLife("minutes");
  return explainer;
}

async function requestExplainer(cve: string): Promise<Explainer> {
  const vuln = await findVuln(cve);
  if (!vuln?.vendor) throw new Error(`no vendor record for ${cve}`);
  const valyu = valyuServer();
  if (!valyu) throw new Error("no Valyu key");
  await reserveSharedWork("answer");
  const res = await valyu.answer(
    `${vuln.cve} (${tidy(vuln.vendor)} ${tidy(vuln.product)}): ${vuln.name.trim()}. In plain English for a non-specialist: what can an attacker do, who is affected, and what is the fix (fixed version or mitigation)? Use the vendor advisory.`,
    {
      structuredOutput: EXPLAINER_SCHEMA,
      systemInstructions:
        "You write terse, accurate security explainers for the public. Each field is one short sentence fragment that obeys its word limit. No source citations, no lists, no markdown. Never exaggerate. No em dashes.",
      searchType: "all",
      fastMode: true,
    },
  );
  if (Symbol.asyncIterator in Object(res)) throw new Error("unexpected stream");
  const answer = res as { success: boolean; error?: string; contents?: unknown };
  if (!answer.success || !answer.contents) throw new Error(answer.error ?? "empty answer");
  // Structured answers arrive as a JSON string.
  const out = (typeof answer.contents === "string" ? JSON.parse(answer.contents) : answer.contents) as Partial<Explainer>;
  if (!out.title || !out.who || !out.fix) throw new Error("incomplete answer");
  return { title: clean(out.title), who: clean(out.who), fix: clean(out.fix) };
}

function leadOf(list: Vuln[]): Vuln {
  return [...list].sort((a, b) => (b.newsCount ?? 0) - (a.newsCount ?? 0) || (b.kevAdded ?? "").localeCompare(a.kevAdded ?? ""))[0];
}

/** One card per product line: "Connect Secure, Policy Secure..." and "Connect Secure and Policy Secure" are the same thing to patch. */
function groupKey(vuln: Vuln): string {
  const product = tidy(vuln.product)
    .toLowerCase()
    .split(/[,(]| and /)[0]
    .trim();
  return `${tidy(vuln.vendor).toLowerCase()}|${product}`;
}

function urgency(list: Vuln[]): number {
  const news = Math.max(...list.map((vuln) => vuln.newsCount ?? 0));
  const kevRecent = Math.max(0, ...list.map((vuln) => (vuln.kevAdded ? 30 - (Date.now() - Date.parse(vuln.kevAdded)) / 86_400_000 : 0)));
  const epss = Math.max(0, ...list.map((vuln) => vuln.epss ?? 0));
  return news * 3 + kevRecent + epss * 10 + (list.some((vuln) => vuln.ransomware) ? 5 : 0);
}

const EXPLAIN_BUDGET_MS = 25_000;

/** What to patch right now: one entry per product, most urgent first, with plain-English explainers. */
export async function getPatchList(): Promise<PatchItem[]> {
  "use cache: remote";
  cacheLife("feed");
  cacheTag("snapshot");
  const snapshot = await getSnapshot();
  const groups = new Map<string, Vuln[]>();
  for (const vuln of [...snapshot.trending, ...snapshot.kev]) {
    if (!vuln.vendor || !vuln.product || !(vuln.kev || vuln.newsCount)) continue;
    const key = groupKey(vuln);
    const list = groups.get(key) ?? [];
    if (!list.some((other) => other.cve === vuln.cve)) list.push(vuln);
    groups.set(key, list);
  }
  const ranked = [...groups.entries()]
    .sort((a, b) => urgency(b[1]) - urgency(a[1]))
    .slice(0, 14)
    .map(([key, list]) => ({ key, list, lead: leadOf(list) }));

  // A few at a time (the answer API rate-limits bursts), within a budget so a cold start still answers.
  const deadline = Date.now() + EXPLAIN_BUDGET_MS;
  const explainers: (Explainer | null)[] = [];
  for (let i = 0; i < ranked.length; i += 5) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    const batch = ranked.slice(i, i + 5).map(({ lead }) =>
      beforeDeadline(
        explainCve(lead.cve).catch((err) => {
          console.warn(`[patch] explainer ${lead.cve}:`, err instanceof Error ? err.message : err);
          return null;
        }),
        left,
        null,
      ),
    );
    explainers.push(...(await Promise.all(batch)));
  }

  return ranked.map(({ key, list, lead }, index): PatchItem => {
    const vendor = tidy(lead.vendor);
    const product = tidy(lead.product);
    const explainer = explainers[index];
    return {
      key,
      vendor,
      product,
      domain: vendorDomain(lead.vendor),
      cves: [lead.cve, ...list.filter((vuln) => vuln !== lead).map((vuln) => vuln.cve)].slice(0, 4),
      // The badges describe the CVE the card opens, so the card and its panel never disagree. An older,
      // exploited CVE for the same product still raises the card's rank through urgency().
      exploited: lead.kev,
      ransomware: lead.kev && lead.ransomware,
      newsCount: Math.max(...list.map((vuln) => vuln.newsCount ?? 0)),
      kevAdded: list
        .map((vuln) => vuln.kevAdded)
        .filter(Boolean)
        .sort()
        .at(-1),
      epss: Math.max(...list.map((vuln) => vuln.epss ?? 0)) || undefined,
      cvss: Math.max(...list.map((vuln) => vuln.cvss ?? 0)) || undefined,
      title: explainer?.title ?? lead.name.trim(),
      who: explainer?.who ?? `Anyone running ${productLabel({ vendor, product })}`,
      fix: explainer?.fix ?? "Apply the vendor's security update.",
      explained: Boolean(explainer),
    };
  });
}
