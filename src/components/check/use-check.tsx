"use client";

import { ArrowRight, Check, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { type CheckIncident, matchIncidents } from "@/components/check/match";
import { BUTTON_TERTIARY, DIVIDER, EYEBROW, TILE, TILE_FOCUS } from "@/components/check/styles";
import { DeepResearch } from "@/components/hud/deep-research";
import { AuditButtons } from "@/components/hud/fix-buttons";
import { ValyuMark } from "@/components/icons/agents";
import { OrgLogo } from "@/components/kit/org-logo";
import { StatusMark } from "@/components/kit/status-mark";
import { useAuth } from "@/lib/auth/client";
import { STATUS_LABEL, relativeTime } from "@/lib/format";
import { ACCOUNTS } from "@/lib/mode";
import { plural } from "@/lib/og/copy";
import { GROUPS, POPULAR, checkTerms, popularPick } from "@/lib/stack/popular";
import type { ProductFinding, ProductMatch, StackReport } from "@/lib/stack/types";
import { cn } from "@/lib/utils";
import { vendorDomain } from "@/lib/vendors";
import { useAccess } from "@/stores/access";
import { useStack } from "@/stores/stack";

const DAY = 86_400_000;
/** "Act now" means CISA listed it, or the company confirmed a breach, in the last month. */
const RECENT = 30 * DAY;
/** Older than this, an exploited flaw is history that staying up to date already covers. */
const WATCH = 90 * DAY;

export interface Suggestion {
  name: string;
  domain?: string;
}

type Level = "act" | "watch" | "quiet";

interface Verdict {
  name: string;
  domain?: string;
  level: Level;
  flaws: ProductMatch[];
  olderFlaws: number;
  incidents: CheckIncident[];
}

const LEVEL: Record<Level, { label: string; className: string }> = {
  act: { label: "Act now", className: "bg-confirmed/[0.12] text-confirmed shadow-[inset_0_0_0_1px_rgb(255_74_61/0.25)]" },
  watch: { label: "Worth a look", className: "bg-reported/[0.1] text-reported shadow-[inset_0_0_0_1px_rgb(255_181_71/0.22)]" },
  quiet: { label: "Nothing new", className: "bg-white/[0.05] text-ink-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]" },
};

const CHIP =
  "press flex h-8 items-center gap-2 rounded-full pl-1.5 pr-3 text-[13px] transition-[background-color,box-shadow,color] duration-150 bg-white/[0.035] text-ink-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] hover:bg-white/[0.07] hover:text-ink";

/** The popular picks, one shelf per group. */
const SHELVES: { label: string; picks: Suggestion[] }[] = GROUPS.map((group) => ({
  label: group.label,
  picks: POPULAR.filter((pick) => pick.group === group.id),
}));

const CHECK_FAILED = "The check failed. Try again in a minute.";

function domainOf(name: string, suggestions: Suggestion[]): string | undefined {
  return popularPick(name)?.domain ?? suggestions.find((item) => item.name.toLowerCase() === name.toLowerCase())?.domain ?? vendorDomain(name);
}

/** One verdict per thing the visitor uses: flaws from the product check, breaches from this month's incidents. */
function judge(name: string, report: StackReport | null, incidents: CheckIncident[], suggestions: Suggestion[], now: number): Verdict {
  const terms = new Set(checkTerms(name).map((term) => term.toLowerCase()));
  const findings: ProductFinding[] = report?.products.filter((product) => terms.has(product.name.toLowerCase())) ?? [];
  const age = (match: ProductMatch) => (match.added ? now - Date.parse(`${match.added}T00:00:00Z`) : Infinity);
  // Aliases can return the same CVE twice ("Google Chrome" and "Google Chromium").
  const all = [...new Map(findings.flatMap((finding) => [...finding.matches, ...finding.news]).map((match) => [match.cve, match])).values()];
  const flaws = all.filter((match) => !match.kev || age(match) < WATCH).sort((a, b) => age(a) - age(b));
  const kevTotal = findings.reduce((sum, finding) => sum + finding.kevTotal, 0);
  const hits = matchIncidents(name, incidents).slice(0, 3);
  const urgent =
    flaws.some((match) => match.kev && age(match) < RECENT) ||
    hits.some((incident) => incident.status === "confirmed" && now - Date.parse(incident.date) < RECENT);
  let level: Level = "quiet";
  if (urgent) level = "act";
  else if (flaws.length || hits.length) level = "watch";
  return {
    name,
    domain: domainOf(name, suggestions),
    level,
    flaws: flaws.slice(0, 4),
    olderFlaws: Math.max(0, kevTotal - flaws.filter((match) => match.kev).length),
    incidents: hits,
  };
}

/** "Fortinet FortiOS Path Traversal Vulnerability" reads "FortiOS Path Traversal" under Fortinet. */
function flawName(match: ProductMatch, item: string): string {
  const repeated = new Set(item.toLowerCase().split(/\s+/));
  const words = match.name.replace(/\s+Vulnerability$/i, "").split(/\s+/);
  let start = 0;
  while (start < 2 && start < words.length - 1 && repeated.has(words[start].toLowerCase())) start += 1;
  return words.slice(start).join(" ");
}

/** The card's closing line: why a quiet card is not an all-clear, and the older flaws its list leaves out. */
function footnote({ level, olderFlaws }: Verdict): string | null {
  const quiet = level === "quiet";
  if (olderFlaws) {
    const lead = quiet ? "No new exploited flaws in the last 90 days. " : "";
    return `${lead}CISA lists ${plural(olderFlaws, "older exploited flaw")}; keeping it on the latest version covers them.`;
  }
  if (quiet) return "Nothing exploited or breached on record in the last month. That is not an all-clear; the researched brief below checks further.";
  return null;
}

function headline(verdicts: Verdict[], report: StackReport | null, error: string | null): string {
  if (!report) return error ? "The check did not finish" : "Checking what you use…";
  const act = verdicts.filter((verdict) => verdict.level === "act").length;
  if (act) return `${plural(act, "thing")} you use ${act === 1 ? "needs" : "need"} action now`;
  const watch = verdicts.filter((verdict) => verdict.level === "watch").length;
  if (watch) return `Nothing urgent. ${plural(watch, "thing")} worth a look`;
  return "Nothing new on record for what you use";
}

function Picker({ suggestions, incidents }: { suggestions: Suggestion[]; incidents: CheckIncident[] }) {
  const items = useStack((s) => s.items);
  const add = useStack((s) => s.add);
  const remove = useStack((s) => s.remove);
  const toggle = useStack((s) => s.toggle);
  const [draft, setDraft] = useState("");
  const query = draft.trim();
  const [open, setOpen] = useState(false);
  // Once something is listed the picks fold away, so the answer sits right under the list.
  const [browsing, setBrowsing] = useState(false);
  const showPicks = !items.length || browsing;
  const chosen = useMemo(() => new Set(items.map((item) => item.toLowerCase())), [items]);
  const shelves = suggestions.length ? [...SHELVES, { label: "Companies in this month's breach news", picks: suggestions.slice(0, 8) }] : SHELVES;

  // Typed text matches the popular picks and this month's breached organisations; anything else adds as typed.
  const matches = useMemo(() => {
    const q = query.toLowerCase();
    if (q.length < 2) return [];
    const names = [...POPULAR.map((pick) => pick.name), ...suggestions.map((item) => item.name), ...incidents.map((incident) => incident.victim)];
    return [...new Set(names)].filter((name) => name.toLowerCase().includes(q) && !chosen.has(name.toLowerCase())).slice(0, 6);
  }, [query, suggestions, incidents, chosen]);

  const commit = (name: string) => {
    add(name);
    setDraft("");
  };

  return (
    <div className={cn(TILE, TILE_FOCUS)}>
      <form
        className="relative flex items-center gap-3 px-4 py-3.5 sm:px-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.length >= 2) commit(matches.find((name) => name.toLowerCase() === query.toLowerCase()) ?? draft);
        }}
      >
        <MagnifyingGlass className="size-[18px] shrink-0 text-ink-3" aria-hidden />
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder="Add an app, product or company"
          aria-label="Add an app, product, vendor or company you use"
          autoComplete="off"
          className="h-8 min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-4"
        />
        <button
          type="submit"
          disabled={query.length < 2}
          className="press flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-[13px] font-medium text-space hover:bg-white disabled:bg-white/[0.06] disabled:text-ink-4"
        >
          <Plus className="size-3.5" weight="bold" /> Add
        </button>
        {open && matches.length ? (
          <ul className="absolute inset-x-3 top-[calc(100%-4px)] z-20 rounded-[14px] bg-surface p-1.5 ring-1 ring-hairline-2 elevated" role="listbox">
            {matches.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commit(name)}
                  className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[14px] text-ink hover:bg-surface-2"
                >
                  <OrgLogo name={name} domain={domainOf(name, suggestions)} size={22} className="rounded-[6px]" />
                  {name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      {items.length ? (
        <>
          <div className={cn("flex flex-wrap items-center gap-1.5 border-t px-4 py-3 sm:px-5", DIVIDER)}>
            {items.map((item) => (
              <span key={item} className="flex h-8 items-center gap-2 rounded-full bg-ink pl-1.5 pr-1 text-[13px] font-medium text-space">
                <OrgLogo name={item} domain={domainOf(item, suggestions)} size={20} className="rounded-full" />
                {item}
                <button type="button" onClick={() => remove(item)} className="rounded-full p-1 hover:bg-black/10" aria-label={`Remove ${item}`}>
                  <X className="size-3" weight="bold" />
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setBrowsing(!browsing);
              // Done adding: the picks fold away, so bring the results up.
              if (browsing) window.requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
            }}
            aria-expanded={browsing}
            className={cn(
              "flex w-full items-center gap-2 border-t px-4 py-2.5 text-left text-[13px] text-ink-3 transition-colors hover:text-ink sm:px-5",
              DIVIDER,
            )}
          >
            <Plus className={cn("size-3.5 transition-transform duration-200", browsing && "rotate-45")} weight="bold" />
            {browsing ? "Done adding" : "Add more from popular apps and products"}
          </button>
        </>
      ) : null}

      <div className={cn("grid gap-3.5 border-t px-4 py-4 sm:px-5", DIVIDER, !showPicks && "hidden")}>
        {shelves.map((shelf) => (
          <div key={shelf.label}>
            <p className={cn(EYEBROW, "mb-2")}>{shelf.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {shelf.picks.map((pick) => {
                const on = chosen.has(pick.name.toLowerCase());
                return (
                  <button
                    key={pick.name}
                    type="button"
                    onClick={() => {
                      // Keep the picks open while choosing; they fold when the visitor says they are done.
                      setBrowsing(true);
                      toggle(pick.name);
                    }}
                    aria-pressed={on}
                    className={cn(CHIP, on && "bg-white/[0.12] text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)]")}
                  >
                    <OrgLogo name={pick.name} domain={pick.domain} size={20} className="rounded-full" />
                    {pick.name}
                    {on ? <Check className="size-3.5" weight="bold" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "2 exploited flaws, 1 breach": what a locked card still tells you. */
function teaser(verdict: Verdict): string {
  const exploited = verdict.flaws.filter((match) => match.kev).length;
  const fresh = verdict.flaws.length - exploited;
  return [
    exploited ? plural(exploited, "exploited flaw") : null,
    fresh ? plural(fresh, "new flaw") : null,
    verdict.incidents.length ? plural(verdict.incidents.length, "breach", "breaches") : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Signed out: the verdict and the counts are free; the flaws and their fixes need a Valyu account. */
function LockedDetails({ verdict }: { verdict: Verdict }) {
  const titles = [...verdict.incidents.map((incident) => incident.title), ...verdict.flaws.map((match) => flawName(match, verdict.name))].slice(0, 2);
  return (
    <div className={cn("relative border-t", DIVIDER)}>
      <ul aria-hidden className="pointer-events-none select-none px-4 py-2 blur-[6px] sm:px-5">
        {/* Flaw names repeat across CVEs, so they cannot be keys. */}
        {titles.map((title, index) => (
          <li key={index} className="py-1.5 text-[14px] text-ink-2">
            {title}
          </li>
        ))}
      </ul>
      <div className="absolute inset-0 flex items-center justify-between gap-3 bg-surface px-4 sm:px-5">
        <span className="text-[13.5px] text-ink-2">{teaser(verdict)}</span>
        <button
          type="button"
          onClick={() => useAccess.getState().requireAccount("check")}
          className="press flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] font-medium text-space hover:bg-white"
        >
          <ValyuMark className="size-3" /> See them
        </button>
      </div>
    </div>
  );
}

function ItemCard({ verdict, now, locked }: { verdict: Verdict; now: number; locked: boolean }) {
  const level = LEVEL[verdict.level];
  const note = footnote(verdict);
  const details = verdict.flaws.length + verdict.incidents.length > 0;
  return (
    <li className={cn(TILE, "overflow-hidden")}>
      <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
        <OrgLogo name={verdict.name} domain={verdict.domain} size={32} className="rounded-[9px]" />
        <h3 className="min-w-0 flex-1 truncate text-[16px] font-medium tracking-[-0.005em] text-ink">{verdict.name}</h3>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium", level.className)}>{level.label}</span>
      </div>
      {details && locked ? <LockedDetails verdict={verdict} /> : null}
      {details && !locked ? (
        <ul className={cn("border-t", DIVIDER)}>
          {verdict.incidents.map((incident) => (
            <li key={incident.id} className={cn("border-b last:border-b-0", DIVIDER)}>
              <Link href={`/incident/${incident.id}`} className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03] sm:px-5">
                <StatusMark status={incident.status} size={9} className="mt-[5px]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] leading-snug text-ink">{incident.title}</span>
                  <span className="mt-0.5 block text-[12.5px] text-ink-3">
                    {STATUS_LABEL[incident.status]} · {relativeTime(incident.date, now)}
                  </span>
                </span>
                <ArrowRight className="mt-1 size-3.5 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
          {verdict.flaws.map((match) => (
            <li key={match.cve} className={cn("border-b last:border-b-0", DIVIDER)}>
              <Link href={`/cve/${match.cve}`} className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03] sm:px-5">
                <span className={cn("mt-[6px] size-[7px] shrink-0 rounded-full", match.kev ? "bg-confirmed" : "bg-reported")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-[14px] leading-snug text-ink">{flawName(match, verdict.name)}</span>
                  <span className="mt-0.5 block text-[12.5px]">
                    <span className={match.kev ? "text-confirmed" : "text-reported"}>
                      {match.kev ? (match.ransomware ? "Exploited, used by ransomware" : "Exploited") : "New, in the news"}
                    </span>
                    <span className="text-ink-3">
                      {match.added ? ` · listed ${relativeTime(`${match.added}T00:00:00Z`, now)}` : ""} ·{" "}
                      <span className="font-mono text-[11.5px]">{match.cve}</span>
                    </span>
                  </span>
                </span>
                <span className="mt-0.5 shrink-0 text-[12.5px] text-ink-3 transition-colors group-hover:text-ink">How to fix</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className={cn("border-t px-4 py-3 text-[13px] leading-relaxed text-ink-3 sm:px-5", DIVIDER)}>{note}</p> : null}
    </li>
  );
}

/**
 * "Are you affected?" for anyone: pick the apps, products and companies you use, see what attackers are
 * exploiting in them and which have been breached, then get a researched brief. Nothing to upload; the
 * list lives in this browser and only the names are looked up.
 */
export function UseCheck({
  incidents,
  suggestions,
  generatedAt,
  initialAdd,
}: {
  incidents: CheckIncident[];
  suggestions: Suggestion[];
  generatedAt: string;
  initialAdd?: string;
}) {
  const items = useStack((s) => s.items);
  // Locked only once we know they are signed out, so a signed-in visitor never sees the lock flash.
  const locked = useAuth((s) => ACCOUNTS && s.loaded && !s.user);
  const [report, setReport] = useState<StackReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = Date.parse(generatedAt);

  // The list is kept in localStorage; load it after hydration, then apply ?add= from search.
  useEffect(() => {
    void Promise.resolve(useStack.persist.rehydrate()).then(() => {
      if (initialAdd) useStack.getState().add(initialAdd);
    });
  }, [initialAdd]);

  useEffect(() => {
    // With nothing listed the results are not shown, so a stale report is harmless.
    if (!items.length) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: [...new Set(items.flatMap(checkTerms))].join("\n") }),
          signal: controller.signal,
        });
        const json = (await res.json()) as StackReport & { error?: string };
        if (!res.ok) throw new Error(json.error ?? CHECK_FAILED);
        setReport(json);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : CHECK_FAILED);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [items]);

  const verdicts = useMemo(() => {
    const rank: Record<Level, number> = { act: 0, watch: 1, quiet: 2 };
    return items.map((item) => judge(item, report, incidents, suggestions, now)).sort((a, b) => rank[a.level] - rank[b.level]);
  }, [items, report, incidents, suggestions, now]);

  return (
    <div className="grid gap-4">
      <Picker suggestions={suggestions} incidents={incidents} />

      {items.length ? (
        <section aria-labelledby="results" aria-busy={loading} className="mt-4 grid gap-3">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 id="results" className="font-semicondensed text-[clamp(22px,3vw,28px)] font-bold leading-tight tracking-[-0.02em] text-ink">
              {headline(verdicts, report, error)}
            </h2>
            {loading && report ? <span className={EYEBROW}>Updating</span> : null}
          </div>
          {error ? <p className="rounded-[14px] bg-confirmed/[0.08] px-4 py-3 text-[13.5px] text-ink-2">{error}</p> : null}
          {report ? (
            <ul className="grid gap-3">
              {/* The most urgent card is free to read in full; the rest unlock with a Valyu sign-in. */}
              {verdicts.map((verdict, index) => (
                <ItemCard key={verdict.name} verdict={verdict} now={now} locked={locked && index > 0} />
              ))}
            </ul>
          ) : error ? null : (
            <ul className="grid gap-3" aria-hidden>
              {items.slice(0, 4).map((item) => (
                <li key={item} className={cn(TILE, "flex items-center gap-3 px-4 py-3.5 sm:px-5")}>
                  <span className="skeleton size-8 rounded-[9px]" />
                  <span className="skeleton h-3.5 w-40 rounded-full" />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <p className="px-1 text-[13.5px] leading-relaxed text-ink-3">
          Pick a few things above. Results appear here as you go, and your list stays in this browser.
        </p>
      )}

      <section aria-labelledby="brief" className={cn(TILE, "mt-4 overflow-hidden")}>
        <div className="px-4 pb-1 pt-4 sm:px-5">
          <p className={EYEBROW}>DeepResearch</p>
          <h2 id="brief" className="mt-2 font-semicondensed text-[22px] font-bold leading-tight tracking-[-0.015em] text-ink">
            A researched security brief on everything you use
          </h2>
          <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-ink-3">
            Valyu reads vendor advisories, CISA and the news for each item: what is exploited, which versions are affected, any breach at the vendor, and a
            checklist in order of urgency. Cited, with a PDF.
          </p>
        </div>
        <div className="px-4 pb-4 pt-3 sm:px-5">
          {items.length ? (
            <DeepResearch
              kind="stack"
              id={items.map((item) => item.toLowerCase()).join("|")}
              items={items}
              subject="what you use"
              title={`Research ${items.length === 1 ? items[0] : plural(items.length, "thing")} in depth`}
              blurb="About five minutes."
            />
          ) : (
            <p className="text-[13px] text-ink-4">Add what you use above to start one.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="developers" className={cn(TILE, "overflow-hidden")}>
        <div className="px-4 pb-1 pt-4 sm:px-5">
          <p className={EYEBROW}>For developers</p>
          <h2 id="developers" className="mt-2 font-semicondensed text-[22px] font-bold leading-tight tracking-[-0.015em] text-ink">
            Check a codebase without sharing it
          </h2>
          <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-ink-3">
            Your coding agent audits the repository on your machine against the vulnerabilities attackers are exploiting, fixes what it finds and opens a pull
            request. Nothing is uploaded to Global Hack Map.
          </p>
        </div>
        <div className="px-4 pb-4 pt-3 sm:px-5">
          <AuditButtons />
        </div>
      </section>

      <p className="flex flex-wrap items-center gap-x-1 px-1 text-[12.5px] text-ink-4">
        Want the full picture first?
        <Link href="/cve" className={BUTTON_TERTIARY}>
          Browse new and exploited CVEs <ArrowRight className="size-3" />
        </Link>
      </p>
    </div>
  );
}
