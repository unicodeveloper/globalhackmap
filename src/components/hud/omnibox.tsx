"use client";

import { ArrowElbowDownLeft, MagnifyingGlass, Plus, ShieldWarning, Sparkle } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { OrgLogo } from "@/components/kit/org-logo";
import { StatusMark } from "@/components/kit/status-mark";
import { allCountries, countryName } from "@/lib/countries";
import { STATUS_LABEL, relativeTime } from "@/lib/format";
import type { Incident, Vuln } from "@/lib/types";
import { plural, productLabel } from "@/lib/og/copy";
import { cn } from "@/lib/utils";
import { useAccess } from "@/stores/access";
import { useSituation } from "@/stores/situation";

const PROMPTS = ["Was my bank hacked?", "Search a company, app or vendor", "Fortinet", "What is being exploited this week?"];

type Row =
  | { kind: "verdict"; key: string; found: number; flaws: number; exploited: number; mentions: number; query: string }
  | { kind: "check"; key: string; query: string }
  | { kind: "incident"; key: string; incident: Incident }
  | { kind: "vuln"; key: string; vuln: Vuln }
  | { kind: "country"; key: string; iso: string; name: string; count: number }
  | { kind: "ask"; key: string; query: string };

function norm(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export interface OmniboxHandle {
  focus: () => void;
}

interface OmniboxProps {
  incidents: Incident[];
  vulns: Vuln[];
  onAsk: (question: string) => void;
  /** Lets the phone layout raise its sheet so the results are not below the fold. */
  onFocusChange?: (focused: boolean) => void;
  size?: "lg" | "md";
}

/** Works for a company, a product or a flaw's nickname, so the answer never assumes which one it is. */
function lookupQuestion(query: string): string {
  return `What is the latest on ${query} in cybersecurity: any breach, attack or exploited vulnerability in the last 30 days? Who is affected, and what should they do?`;
}

export const Omnibox = forwardRef<OmniboxHandle, OmniboxProps>(function Omnibox({ incidents, vulns, onAsk, onFocusChange, size = "lg" }, ref) {
  // Asking runs a cited answer on Valyu, which needs an account; searching the live lists does not.
  const ask = (question: string) => {
    if (useAccess.getState().requireAccount("answers")) onAsk(question);
  };
  const router = useRouter();
  const select = useSituation((s) => s.select);
  const selectCve = useSituation((s) => s.selectCve);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [prompt, setPrompt] = useState(0);
  const [typed, setTyped] = useState("");

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  // A live example: the most urgent flaw in the snapshot, so the suggestion always has an answer.
  const prompts = useMemo(() => {
    const lead = vulns.find((vuln) => vuln.kev && vuln.vendor);
    return lead ? [...PROMPTS.slice(0, 2), `Am I affected by ${lead.cve}?`, ...PROMPTS.slice(2)] : PROMPTS;
  }, [vulns]);

  // Typewriter placeholder that cycles through real things people ask.
  useEffect(() => {
    if (value) return;
    const target = prompts[prompt % prompts.length];
    let i = 0;
    let timer = window.setInterval(() => {
      i += 1;
      setTyped(target.slice(0, i));
      if (i >= target.length) {
        window.clearInterval(timer);
        timer = window.setTimeout(() => setPrompt((p) => (p + 1) % prompts.length), 2200);
      }
    }, 45);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(timer);
    };
  }, [prompt, prompts, value]);

  const rows = useMemo<Row[]>(() => {
    const q = value.trim();
    if (!q) return [];
    const nq = norm(q);
    const cveMatch = /CVE-\d{4}-\d{3,7}/i.exec(q)?.[0]?.toUpperCase();
    const scoredIncidents = incidents
      .map((incident) => {
        const name = norm(incident.victim);
        let score = 0;
        if (name === nq) score = 100;
        else if (name.startsWith(nq)) score = 80;
        else if (name.includes(nq)) score = 60;
        else if (incident.domain && norm(incident.domain).includes(nq)) score = 55;
        else if (incident.actor && norm(incident.actor).includes(nq)) score = 40;
        else if (norm(incident.title).includes(nq)) score = 30;
        else if (incident.cves.some((cve) => norm(cve).includes(nq))) score = 30;
        return { incident, score };
      })
      .filter((hit) => hit.score > 0 && nq.length >= 2)
      .sort((a, b) => b.score - a.score || b.incident.date.localeCompare(a.incident.date));
    // Named matches (the organisation or its domain) answer "was X hit"; a title that only mentions X does not.
    const named = scoredIncidents.filter((hit) => hit.score >= 55).length;
    const incidentHits = scoredIncidents.slice(0, 6).map(({ incident }) => ({ kind: "incident" as const, key: `i-${incident.id}`, incident }));
    const matchedVulns = vulns
      .filter((vuln) => {
        if (cveMatch) return vuln.cve === cveMatch;
        return nq.length >= 3 && (norm(vuln.cve).includes(nq) || norm(`${vuln.vendor} ${vuln.product}`).includes(nq) || norm(vuln.name).includes(nq));
      })
      // Exploited first: they are the ones to act on.
      .sort((a, b) => Number(b.kev) - Number(a.kev) || (b.cvss ?? 0) - (a.cvss ?? 0));
    const vulnHits = matchedVulns.slice(0, 4).map((vuln) => ({ kind: "vuln" as const, key: `v-${vuln.cve}`, vuln }));
    const countryHits =
      nq.length >= 3
        ? allCountries()
            .filter((c) => norm(c.name).startsWith(nq))
            .slice(0, 2)
            .map((c) => ({
              kind: "country" as const,
              key: `c-${c.iso}`,
              iso: c.iso,
              name: c.name,
              count: incidents.filter((incident) => incident.country === c.iso).length,
            }))
        : [];
    const out: Row[] = [];
    const looksLikeName = !cveMatch && q.split(/\s+/).length <= 4 && !/[?]$/.test(q);
    if (looksLikeName && q.length >= 2)
      out.push({
        kind: "verdict",
        key: "verdict",
        found: named,
        flaws: matchedVulns.length,
        exploited: matchedVulns.filter((vuln) => vuln.kev).length,
        mentions: scoredIncidents.length - named,
        query: q,
      });
    out.push(...incidentHits, ...vulnHits, ...countryHits);
    // Products and vendors: the live lists hold the newest flaws; the check covers every exploited one.
    if (looksLikeName && q.length >= 3) out.push({ kind: "check", key: "check", query: q });
    if (cveMatch && !vulnHits.length)
      out.push({
        kind: "vuln",
        key: `v-${cveMatch}`,
        vuln: { cve: cveMatch, vendor: "", product: "", name: "Look up this CVE", description: "", kev: false, ransomware: false, references: [] },
      });
    out.push({ kind: "ask", key: "ask", query: q });
    return out;
  }, [value, incidents, vulns]);

  const run = (row: Row) => {
    setOpen(false);
    switch (row.kind) {
      case "incident":
        select(row.incident.id);
        break;
      case "vuln":
        selectCve(row.vuln.cve);
        break;
      case "country":
        useSituation.getState().setCountry(row.iso);
        break;
      case "ask":
        ask(row.query);
        break;
      case "verdict": {
        // Open the named incident, else the most urgent matching flaw; with neither, search the news.
        const target = row.found ? "incident" : "vuln";
        const first = row.found || row.flaws ? rows.find((r) => r.kind === target) : undefined;
        if (first?.kind === "incident") select(first.incident.id);
        else if (first?.kind === "vuln") selectCve(first.vuln.cve);
        else ask(lookupQuestion(row.query));
        break;
      }
      case "check":
        router.push(`/check?add=${encodeURIComponent(row.query)}`);
        break;
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(rows.length - 1, a + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const row = rows[active];
      if (row) run(row);
    } else if (event.key === "Escape") {
      // First Escape closes the results; the next one leaves the box and closes any open dossier.
      if (open && rows.length) {
        setOpen(false);
        return;
      }
      inputRef.current?.blur();
      select(null);
      selectCve(null);
    }
  };

  const large = size === "lg";

  return (
    <div className="relative">
      <div
        className={cn(
          "group relative flex items-start gap-3 rounded-[16px] bg-space px-4 ring-1 ring-inset ring-input transition-[box-shadow,background-color] duration-200 focus-within:ring-2 focus-within:ring-ink",
          large ? "py-[15px]" : "py-3",
        )}
      >
        <MagnifyingGlass className={cn("mt-[3px] shrink-0 text-ink-3", large ? "size-[18px]" : "size-4")} />
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            onFocusChange?.(true);
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 160);
            onFocusChange?.(false);
          }}
          onKeyDown={onKeyDown}
          aria-label="Search incidents, companies and vulnerabilities, or ask a question"
          aria-expanded={open && rows.length > 0}
          aria-controls="omnibox-results"
          role="combobox"
          spellCheck={false}
          className={cn(
            "max-h-28 min-h-[24px] w-full resize-none bg-transparent leading-6 text-ink outline-none placeholder:text-transparent",
            large ? "text-[16.5px]" : "text-[15px]",
          )}
          placeholder="Search or ask"
        />
        {!value ? (
          <span
            className={cn(
              "caret pointer-events-none absolute leading-6 text-ink-4",
              large ? "left-[46px] top-[15px] text-[16.5px]" : "left-11 top-3 text-[15px]",
            )}
            aria-hidden
          >
            {typed}
          </span>
        ) : null}
        <kbd className="mt-[2px] hidden shrink-0 rounded-[6px] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10.5px] text-ink-4 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] sm:block">
          ⌘K
        </kbd>
      </div>

      {open && rows.length > 0 ? (
        <div
          id="omnibox-results"
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+8px)] z-50 max-h-[min(460px,60vh)] overflow-y-auto rounded-[14px] bg-surface p-1.5 ring-1 ring-hairline-2 elevated scrollbar-thin animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {rows.map((row, index) => (
            <button
              key={row.key}
              type="button"
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => run(row)}
              className={cn(
                "flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors",
                index === active ? "bg-surface-3" : "hover:bg-surface-2",
              )}
            >
              <RowBody row={row} />
              {index === active ? <ArrowElbowDownLeft className="ml-auto size-3.5 shrink-0 text-ink-4" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

/** "Microsoft Windows · Command Injection Vulnerability", without repeating the product the name starts with. */
function vulnLine(vuln: Vuln): string {
  const label = productLabel(vuln);
  if (!label) return vuln.name;
  const rest = vuln.name.startsWith(label) ? vuln.name.slice(label.length).replace(/^[\s:,-]+/, "") : vuln.name;
  // "PHP has a flaw…" stays whole rather than becoming "PHP · has a flaw…".
  if (rest !== vuln.name && !/^[A-Z0-9]/.test(rest)) return vuln.name;
  return rest ? `${label} · ${rest}` : label;
}

function RowBody({ row }: { row: Row }) {
  switch (row.kind) {
    case "verdict": {
      const hit = row.found > 0 || row.exploited > 0;
      const parts = [
        row.found ? `${plural(row.found, "incident")} at “${row.query}”` : null,
        row.exploited ? plural(row.exploited, "exploited flaw") : null,
        row.flaws - row.exploited > 0 ? `${row.flaws - row.exploited} new or in the news` : null,
      ].filter(Boolean);
      return hit || row.flaws ? (
        <>
          <span
            className={cn("flex size-7 items-center justify-center rounded-[8px]", hit ? "bg-confirmed/15 text-confirmed" : "bg-reported/15 text-reported")}
          >
            <ShieldWarning className="size-4" weight="fill" />
          </span>
          <span className="text-[14px] text-ink">
            <span className="font-semibold">{parts.join(", ")}</span> <span className="text-ink-3">in the last 30 days</span>
          </span>
        </>
      ) : (
        <>
          <span className="flex size-7 items-center justify-center rounded-[8px] bg-surface-3 text-ink-2 ring-1 ring-inset ring-white/[0.06]">
            <MagnifyingGlass className="size-3.5" />
          </span>
          <span className="text-[14px] text-ink">
            Nothing on the map named <span className="font-semibold">“{row.query}”</span>
            {row.mentions ? `, though ${row.mentions === 1 ? "1 incident mentions it" : `${row.mentions} incidents mention it`}` : ""}.
            <span className="block text-[12px] text-ink-3">That is not an all-clear. Press enter to search the latest news.</span>
          </span>
        </>
      );
    }
    case "check":
      return (
        <>
          <span className="flex size-7 items-center justify-center rounded-[8px] bg-surface-3 text-ink-2 ring-1 ring-inset ring-white/[0.06]">
            <Plus className="size-3.5" weight="bold" />
          </span>
          <span className="text-[14px] text-ink">
            Add “{row.query}” to what you use
            <span className="block text-[12px] text-ink-3">See every exploited flaw and breach that touches it</span>
          </span>
        </>
      );
    case "incident":
      return (
        <>
          <OrgLogo name={row.incident.victim} domain={row.incident.domain} size={28} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-[14px] text-ink">
              <span className="truncate font-medium">{row.incident.victim}</span>
              <StatusMark status={row.incident.status} size={8} />
              <span className="shrink-0 text-[12px] text-ink-3">{STATUS_LABEL[row.incident.status]}</span>
            </span>
            <span className="block truncate text-[12.5px] text-ink-3">
              {row.incident.title} · {relativeTime(row.incident.date)}
            </span>
          </span>
        </>
      );
    case "vuln":
      return (
        <>
          <span className="flex size-7 items-center justify-center rounded-[8px] bg-surface-3 font-mono text-[9px] text-ink-2 ring-1 ring-inset ring-white/[0.06]">
            CVE
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-[14px] text-ink">
              <span className="font-mono text-[13px]">{row.vuln.cve}</span>
              {row.vuln.kev ? <span className="text-[12px] text-confirmed">Exploited</span> : null}
            </span>
            <span className="block truncate text-[12.5px] text-ink-3">{vulnLine(row.vuln)}</span>
          </span>
        </>
      );
    case "country":
      return (
        <>
          <span className="flex size-7 items-center justify-center rounded-[8px] bg-surface-3 font-mono text-[11px] text-ink-2 ring-1 ring-inset ring-white/[0.06]">
            {row.iso}
          </span>
          <span className="text-[14px] text-ink">
            {row.name} <span className="text-ink-3">· {row.count} incidents in 30 days</span>
          </span>
        </>
      );
    case "ask":
      return (
        <>
          <span className="flex size-7 items-center justify-center rounded-[8px] bg-ink text-space">
            <Sparkle className="size-3.5" />
          </span>
          <span className="min-w-0 text-[14px] text-ink">
            Ask: <span className="text-ink-2">&ldquo;{row.query.slice(0, 80)}&rdquo;</span>
            <span className="block text-[12px] text-ink-3">Cited answer from live news and advisories, about 10 seconds</span>
          </span>
        </>
      );
  }
}

export { countryName };
