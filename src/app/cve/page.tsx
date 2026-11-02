import { ArrowRight } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";

import { OrgLogo } from "@/components/kit/org-logo";
import { Breadcrumbs } from "@/components/pages/breadcrumbs";
import { JsonLd, breadcrumbList } from "@/components/pages/json-ld";
import { PageShell } from "@/components/pages/page-shell";
import { PRIMARY, SECONDARY } from "@/components/pages/styles";
import { Eyebrow, Tile, TileHead } from "@/components/pages/tile";
import { epssPercent, relativeTime } from "@/lib/format";
import { longDate, plural, productLabel, utcTime } from "@/lib/og/copy";
import { SITE_URL } from "@/lib/site";
import { getSnapshot } from "@/lib/snapshot";
import type { Vuln } from "@/lib/types";
import { vendorDomain } from "@/lib/vendors";

const WEEK = 7 * 86_400_000;

export const metadata: Metadata = {
  title: "New CVEs today: critical flaws and the ones being exploited",
  description:
    "Critical CVEs published in the last 72 hours, flaws CISA confirmed exploited this week, and the vulnerabilities in the news. Each one says who is affected and how to fix it.",
  alternates: { canonical: "/cve" },
  openGraph: { type: "website", siteName: "Global Hack Map", url: "/cve" },
};

function listedThisWeek(vuln: Vuln, now: number): boolean {
  return Boolean(vuln.kevAdded) && now - Date.parse(`${vuln.kevAdded}T00:00:00Z`) < WEEK;
}

function Status({ vuln, now }: { vuln: Vuln; now: number }) {
  if (vuln.kev) {
    return (
      <span className="text-confirmed">
        {vuln.ransomware ? "Used by ransomware" : "Exploited in the wild"}
        {listedThisWeek(vuln, now) ? <span className="text-ink-4"> · listed {relativeTime(`${vuln.kevAdded}T00:00:00Z`, now)}</span> : null}
      </span>
    );
  }
  if (vuln.newsCount) return <span className="text-reported">In the news</span>;
  return (
    <span className="tabular text-reported">
      Critical{vuln.cvss ? ` ${vuln.cvss.toFixed(1)}` : ""}
      {vuln.published ? <span className="text-ink-4"> · published {relativeTime(vuln.published, now)}</span> : null}
    </span>
  );
}

function Row({ vuln, now }: { vuln: Vuln; now: number }) {
  const product = productLabel(vuln);
  const summary = vuln.name && vuln.name !== vuln.cve ? vuln.name : vuln.description.split(/(?<=\.)\s/)[0];
  return (
    <li className="border-t border-white/[0.06] first:border-t-0">
      <Link href={`/cve/${vuln.cve}`} className="group flex items-start gap-3.5 px-4 py-3.5 transition-colors hover:bg-white/[0.03] sm:px-5">
        <OrgLogo name={vuln.vendor || vuln.cve.slice(4)} domain={vendorDomain(vuln.vendor)} size={34} className="mt-0.5 rounded-[9px]" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="text-[15px] font-medium tracking-[-0.005em] text-ink">{product || vuln.cve}</span>
            <span className="font-mono text-[11.5px] text-ink-4">{vuln.cve}</span>
          </span>
          <span className="mt-1 block text-[13px]">
            <Status vuln={vuln} now={now} />
          </span>
          {summary ? <span className="mt-1 line-clamp-2 block max-w-[78ch] text-[13.5px] leading-relaxed text-ink-3">{summary}</span> : null}
        </span>
        <span className="hidden shrink-0 flex-col items-end gap-1 pt-0.5 text-right sm:flex">
          {vuln.epss !== undefined && !vuln.kev ? <span className="tabular text-[12px] text-ink-3">{epssPercent(vuln.epss)} exploit odds</span> : null}
          <ArrowRight className="size-3.5 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-2" aria-hidden />
        </span>
      </Link>
    </li>
  );
}

function Section({ id, title, note, items, now }: { id: string; title: string; note: string; items: Vuln[]; now: number }) {
  if (!items.length) return null;
  return (
    <Tile as="section" aria-labelledby={id}>
      <TileHead aside={<span className="font-mono text-[11px] text-ink-4">{items.length}</span>}>
        <Eyebrow as="h2" id={id}>
          {title}
        </Eyebrow>
      </TileHead>
      <p className="px-4 pb-2 pt-1.5 text-[13px] leading-relaxed text-ink-3 sm:px-5">{note}</p>
      <ul>
        {items.map((vuln) => (
          <Row key={vuln.cve} vuln={vuln} now={now} />
        ))}
      </ul>
    </Tile>
  );
}

/** The CVE index: what is new and what is being exploited, so the ticker and search have somewhere to land. */
export default async function CveIndex() {
  "use cache";
  cacheLife("feed");
  const snapshot = await getSnapshot();
  const now = Date.parse(snapshot.generatedAt);
  const exploited = snapshot.kev.filter((vuln) => listedThisWeek(vuln, now));
  const shown = new Set(exploited.map((vuln) => vuln.cve));
  const fresh = snapshot.fresh.filter((vuln) => !vuln.kev && !shown.has(vuln.cve));
  for (const vuln of fresh) shown.add(vuln.cve);
  const news = snapshot.trending.filter((vuln) => (vuln.kev || vuln.newsCount) && !shown.has(vuln.cve)).slice(0, 20);

  return (
    <PageShell>
      <JsonLd
        data={breadcrumbList(`${SITE_URL}/cve`, [
          { name: "Live map", url: SITE_URL },
          { name: "CVEs", url: `${SITE_URL}/cve` },
        ])}
      />
      <Breadcrumbs items={[{ label: "Live map", href: "/" }, { label: "CVEs" }]} />
      <header className="max-w-[760px] pb-8 pt-8 sm:pt-12">
        <Eyebrow as="p">
          {longDate(snapshot.generatedAt)} · updated {utcTime(snapshot.generatedAt)}
        </Eyebrow>
        <h1 className="mt-3 font-condensed text-[clamp(36px,5.4vw,58px)] font-[760] leading-[0.98] tracking-[-0.015em] text-ink text-balance">
          New CVEs, and the ones attackers are using
        </h1>
        <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-ink-2 text-pretty">
          {plural(exploited.length, "flaw")} confirmed exploited this week and {plural(fresh.length, "critical CVE")} published in the last 72 hours, from CISA,
          CVE.org, NVD and GitHub. Open any of them for who is affected, how to fix it, and one-click prompts for Claude Code, Codex and Cursor.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/check" className={PRIMARY}>
            Check what you use
          </Link>
          <Link href="/" className={SECONDARY}>
            Open the live map
          </Link>
        </div>
      </header>

      <div className="grid gap-4">
        <Section
          id="exploited"
          title="Exploited this week"
          note="CISA has evidence attackers are using these. Patch them first, whatever their score."
          items={exploited}
          now={now}
        />
        <Section
          id="new"
          title="New critical, last 72 hours"
          note="Scored 9 or more out of 10 by the vendor, the CVE assigner or NVD. Not known to be exploited yet. If you run one, patch it this week."
          items={fresh}
          now={now}
        />
        <Section
          id="news"
          title="In the news"
          note="Named in security reporting or already exploited, ranked by coverage and exploit odds."
          items={news}
          now={now}
        />
      </div>
    </PageShell>
  );
}
