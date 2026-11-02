"use client";

import { ArrowUpRight, LinkSimple, ShieldCheck, Target, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { AiBrief } from "@/components/hud/ai-brief";
import { DeepResearch } from "@/components/hud/deep-research";
import { FixButtons, IncidentAgentButtons } from "@/components/hud/fix-buttons";
import { VulnTags } from "@/components/hud/story";
import { OrgLogo } from "@/components/kit/org-logo";
import { Segmented } from "@/components/kit/segmented";
import { useExplainer } from "@/hooks/use-patch";
import { StatusMark } from "@/components/kit/status-mark";
import { countryName } from "@/lib/countries";
import { incidentPrompt } from "@/lib/deeplinks";
import { STATUS_LABEL, TYPE_LABEL, epssPercent, placeLabel, recordsLabel, shortDate } from "@/lib/format";
import { guidanceFor } from "@/lib/guidance";
import { SITE_URL } from "@/lib/site";
import type { Incident, IncidentStatus, Vuln } from "@/lib/types";
import { productLabel } from "@/lib/og/copy";
import { cn } from "@/lib/utils";
import { tidyVendor, vendorDomain } from "@/lib/vendors";
import { useSituation } from "@/stores/situation";

function statusSentence(incident: Incident): string {
  const when = shortDate(incident.date);
  const map: Record<IncidentStatus, string> = {
    confirmed: `Confirmed by the organisation or a regulator. First reported ${when}.`,
    reported: `Reported by the press on ${when}. The organisation has not confirmed it yet.`,
    claimed: `${incident.actor ? `${incident.actor} claimed it` : "Claimed"} on a ransomware leak site on ${when}. Not confirmed by the organisation.`,
    precautionary: `Systems taken offline as a precaution on ${when}. No compromise has been stated.`,
    disputed: `Reported on ${when}, and disputed by the organisation.`,
  };
  return map[incident.status];
}

function Shell({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  return (
    <aside
      aria-label={label}
      className="drawer-surface pointer-events-auto absolute inset-x-0 bottom-0 top-[22vh] z-30 flex flex-col overflow-hidden rounded-t-[24px] animate-in fade-in slide-in-from-bottom-6 duration-300 md:inset-x-auto md:bottom-4 md:right-4 md:top-[76px] md:w-[440px] md:rounded-[22px] md:slide-in-from-bottom-0 md:slide-in-from-right-6"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3.5 top-3.5 z-10 flex size-8 items-center justify-center rounded-full bg-white/[0.06] text-ink-2 ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.12] hover:text-ink"
        aria-label="Close"
      >
        <X className="size-4" />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">{children}</div>
    </aside>
  );
}

function Section({ title, aside, children, className }: { title?: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-t border-white/[0.06] px-6 py-5", className)}>
      {title ? (
        <div className="mb-3.5 flex min-h-7 items-center justify-between gap-3">
          <h3 className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">{title}</h3>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const STATUS_CHIP: Record<IncidentStatus, string> = {
  confirmed: "bg-confirmed/[0.12] text-confirmed",
  reported: "bg-reported/[0.12] text-reported",
  claimed: "bg-white/[0.06] text-claimed",
  precautionary: "bg-reported/[0.1] text-reported",
  disputed: "bg-white/[0.06] text-ink-3",
};

function StatusChip({ status }: { status: IncidentStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium", STATUS_CHIP[status])}>
      <StatusMark status={status} size={8} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const CHIP = "inline-flex h-7 items-center rounded-full bg-white/[0.04] px-2.5 text-[12px] text-ink-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]";

function ShareRow({ url, text }: { url: string; text: string }) {
  const enc = encodeURIComponent;
  const cls =
    "press flex h-8 items-center gap-1.5 rounded-full bg-white/[0.035] px-3 text-[12.5px] text-ink-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] transition-colors hover:bg-white/[0.06] hover:text-ink";
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={cls}
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          toast("Link copied");
        }}
      >
        <LinkSimple className="size-3.5" /> Copy link
      </button>
      <a href={`https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`} target="_blank" rel="noreferrer" className={cls}>
        Post on X
      </a>
      <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`} target="_blank" rel="noreferrer" className={cls}>
        LinkedIn
      </a>
    </div>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <ol className="overflow-hidden rounded-[16px] bg-surface-2">
      {items.map((line, index) => (
        <li key={line} className={cn("flex gap-3.5 px-4 py-3 text-[13.5px] leading-snug text-ink-2", index && "border-t border-white/[0.05]")}>
          <span className="mt-px shrink-0 font-mono text-[11px] tabular text-ink-4">{String(index + 1).padStart(2, "0")}</span>
          {line}
        </li>
      ))}
    </ol>
  );
}

export function IncidentPanel({ incident, related }: { incident: Incident; related: Incident[] }) {
  const select = useSituation((s) => s.select);
  const selectCve = useSituation((s) => s.selectCve);
  const [audience, setAudience] = useState<"people" | "teams">("people");
  const guidance = guidanceFor(incident);
  const url = `${SITE_URL}/incident/${incident.id}`;
  const primary = incident.sources[0]?.url ?? url;
  const facts = [
    recordsLabel(incident),
    TYPE_LABEL[incident.type],
    incident.sector ? incident.sector.replace(/\b\w/g, (c) => c.toUpperCase()) : null,
    incident.actor && incident.status !== "claimed" ? incident.actor : null,
  ].filter(Boolean) as string[];

  return (
    <Shell onClose={() => select(null)} label={`${incident.victim} incident`}>
      <div className="px-6 pb-6 pt-6">
        <div className="flex items-center gap-3.5 pr-10">
          <OrgLogo name={incident.victim} domain={incident.domain} size={48} className="rounded-[12px]" />
          <div className="min-w-0">
            <h2 className="font-semicondensed text-[26px] font-bold leading-[1.05] tracking-[-0.01em] text-ink">{incident.victim}</h2>
            <p className="mt-1 truncate text-[13px] text-ink-3">{placeLabel(incident, countryName)}</p>
          </div>
        </div>

        <div className="mt-5">
          <StatusChip status={incident.status} />
          <p className="mt-2 text-[13px] leading-snug text-ink-3">{statusSentence(incident)}</p>
        </div>

        <p className="mt-5 text-[17px] font-medium leading-snug tracking-[-0.005em] text-ink">{incident.title}</p>
        {incident.summary ? <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{incident.summary}</p> : null}

        {facts.length ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {facts.map((fact) => (
              <span key={fact} className={CHIP}>
                {fact}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-5 space-y-2">
          <AiBrief kind="incident" id={incident.id} label={`Brief me on ${incident.victim}`} />
          <DeepResearch kind="incident" id={incident.id} subject={incident.victim} />
        </div>
      </div>

      <Section
        title="What to do"
        aside={
          <Segmented<"people" | "teams">
            label="Who is asking"
            value={audience}
            onChange={setAudience}
            options={[
              { value: "people", label: "I'm a customer" },
              { value: "teams", label: "They're my supplier" },
            ]}
          />
        }
      >
        <Checklist items={audience === "people" ? guidance.people : guidance.teams} />
        <div className="mt-5">
          <p className="mb-3 text-[12.5px] text-ink-3">Not sure? Ask an assistant with the sources attached, or have a coding agent check your systems.</p>
          <IncidentAgentButtons victim={incident.victim} url={primary} prompt={incidentPrompt(incident.victim, primary)} />
        </div>
      </Section>

      {incident.cves.length ? (
        <Section title="Linked vulnerabilities">
          <div className="flex flex-wrap gap-2">
            {incident.cves.map((cve) => (
              <button
                key={cve}
                type="button"
                onClick={() => selectCve(cve)}
                className={cn(CHIP, "press font-mono text-ink transition-colors hover:bg-white/[0.07]")}
              >
                {cve}
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      {related.length ? (
        <Section title={incident.actor ? `${incident.actor} has also hit` : "Related"}>
          <ul className="-mx-2">
            {related.slice(0, 6).map((other) => (
              <li key={other.id}>
                <button
                  type="button"
                  onClick={() => select(other.id)}
                  className="flex w-full items-center gap-3 rounded-[14px] px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <OrgLogo name={other.victim} domain={other.domain} size={28} className="rounded-[8px]" />
                  <span className="truncate text-[13.5px] text-ink">{other.victim}</span>
                  <StatusMark status={other.status} size={8} />
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-4">{other.country}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={`Sources (${incident.sources.length})`}>
        <ul className="space-y-3">
          {incident.sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer nofollow" className="group block">
                <span className="text-[12px] text-ink-4">
                  {source.publisher}
                  {source.kind && source.kind !== "news" ? <span className="text-ink-3"> · {source.kind}</span> : null}
                  {source.date ? <span> · {shortDate(source.date)}</span> : null}
                </span>
                <span className="mt-0.5 flex items-start gap-1 text-[13.5px] leading-snug text-ink-2 group-hover:text-ink">
                  <span className="line-clamp-2">{source.title}</span>
                  <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-ink-4" />
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12px] leading-relaxed text-ink-4">
          Placed at{" "}
          {incident.geoBasis === "stated"
            ? "the city named in reporting"
            : incident.geoBasis === "hq"
              ? "the organisation's headquarters city"
              : "country level"}
          . Confidence {Math.round(incident.confidence * 100)}%. Spotted an error?{" "}
          <a
            href={`https://github.com/yorkeccak/globalhackmap/issues/new?title=${encodeURIComponent(`Correction: ${incident.victim}`)}`}
            className="underline underline-offset-2 hover:text-ink-2"
            target="_blank"
            rel="noreferrer"
          >
            Report it
          </a>
          .
        </p>
      </Section>

      <Section title="Share">
        <ShareRow url={url} text={`${incident.title}. Every cyber incident, live:`} />
        <Link href={`/incident/${incident.id}`} className="mt-4 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
          Open the incident page <ArrowUpRight className="size-3.5" />
        </Link>
      </Section>
    </Shell>
  );
}

/** Who is exposed and what fixes it, in plain English, researched from the vendor advisory. */
function Affected({ cve }: { cve: string }) {
  const explainer = useExplainer(cve);
  if (explainer === null) return null;
  const rows = [
    { icon: <Target className="size-4" />, label: "You are affected if", text: explainer?.who },
    { icon: <ShieldCheck className="size-4" />, label: "The fix", text: explainer?.fix },
  ];
  return (
    <div className="mt-5 overflow-hidden rounded-[16px] bg-surface-2">
      {rows.map((row, index) => (
        <div key={row.label} className={cn("flex gap-3 px-4 py-3.5", index && "border-t border-white/[0.06]")}>
          <span className="mt-0.5 text-ink-3">{row.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-ink-4">{row.label}</p>
            {row.text ? (
              <p className="mt-0.5 text-[14px] leading-snug text-ink">{row.text}</p>
            ) : (
              <span className="mt-1.5 block space-y-1.5">
                <span className="skeleton block h-3.5 w-full rounded" />
                <span className="skeleton block h-3.5 w-3/5 rounded" />
              </span>
            )}
          </div>
        </div>
      ))}
      <Link
        href="/check"
        className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3 text-[13px] text-ink-2 transition-colors hover:bg-white/[0.04] hover:text-ink"
      >
        Not sure? Check your software or code against every live flaw
        <ArrowUpRight className="size-3.5 shrink-0 text-ink-4" />
      </Link>
    </div>
  );
}

export function CvePanel({ vuln }: { vuln: Vuln }) {
  const selectCve = useSituation((s) => s.selectCve);
  const explainer = useExplainer(vuln.cve);
  const url = `${SITE_URL}/cve/${vuln.cve}`;
  const vendor = tidyVendor(vuln.vendor);
  const productName = tidyVendor(vuln.product);
  const product = productLabel({ vendor, product: productName });
  return (
    <Shell onClose={() => selectCve(null)} label={`${vuln.cve} details`}>
      <div className="px-6 pb-6 pt-6">
        <div className="flex items-center gap-2.5 pr-10">
          {vendor ? <OrgLogo name={vendor} domain={vendorDomain(vuln.vendor)} size={22} className="rounded-[6px]" /> : null}
          <p className="truncate text-[13px] text-ink-3">{product || "Vulnerability"}</p>
        </div>
        <h2 className="mt-2.5 font-mono text-[26px] font-medium tracking-[-0.03em] text-ink">{vuln.cve}</h2>
        <p className="mt-3 text-[17px] font-medium leading-snug tracking-[-0.005em] text-ink">{explainer?.title ?? vuln.name.trim()}</p>
        <div className="mt-3">
          <VulnTags vuln={vuln} />
        </div>
        <Affected cve={vuln.cve} />

        <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded-[16px] bg-surface-2 text-[13px] [&>div:nth-child(even)]:border-l [&>div:nth-child(n+3)]:border-t [&>div]:border-white/[0.05] [&>div]:px-4 [&>div]:py-3">
          <Fact
            label="Exploited in the wild"
            value={vuln.kev ? `Yes, CISA listed it ${shortDate(`${vuln.kevAdded}T00:00:00Z`)}` : "Not confirmed yet"}
            hot={vuln.kev}
          />
          <Fact label="US federal deadline" value={vuln.kevDue ? shortDate(`${vuln.kevDue}T00:00:00Z`) : "None set"} />
          <Fact
            label="Chance of exploit in 30 days"
            value={vuln.kev ? "Already exploited" : vuln.epss !== undefined ? `${epssPercent(vuln.epss)} (EPSS)` : "Not scored yet"}
          />
          <Fact
            label="Severity"
            value={vuln.cvss ? `${vuln.cvss.toFixed(1)} of 10` : "See NVD score"}
            href={vuln.cvss ? undefined : `https://nvd.nist.gov/vuln/detail/${vuln.cve}`}
          />
        </dl>
        {vuln.description ? <p className="mt-5 text-[14px] leading-relaxed text-ink-2">{vuln.description}</p> : null}
      </div>

      <Section title="Fix it in one click">
        <FixButtons cve={vuln.cve} />
      </Section>

      <Section>
        <div className="space-y-2">
          <AiBrief kind="cve" id={vuln.cve} label="What should I do about this?" />
          <DeepResearch kind="cve" id={vuln.cve} subject={vuln.cve} />
        </div>
      </Section>

      {vuln.references.length ? (
        <Section title="Advisories and references">
          <ul className="space-y-2">
            {vuln.references.map((ref) => (
              <li key={ref}>
                <a href={ref} target="_blank" rel="noreferrer nofollow" className="flex items-start gap-1 break-all text-[13px] text-ink-2 hover:text-ink">
                  {ref.replace(/^https?:\/\/(www\.)?/, "").slice(0, 80)}
                  <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-ink-4" />
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Share">
        <ShareRow
          url={url}
          text={`${vuln.cve}${product ? ` (${product})` : ""}${vuln.kev ? " is being exploited in the wild." : "."} Check if you're affected:`}
        />
        <Link href={`/cve/${vuln.cve}`} className="mt-4 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
          Open the CVE page <ArrowUpRight className="size-3.5" />
        </Link>
      </Section>
    </Shell>
  );
}

function Fact({ label, value, hot = false, href }: { label: string; value: string; hot?: boolean; href?: string }) {
  return (
    <div>
      <dt className="text-[11.5px] text-ink-4">{label}</dt>
      <dd className={cn("mt-0.5", hot ? "text-confirmed" : "text-ink")}>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-2 hover:text-ink">
            {value} <ArrowUpRight className="size-3.5 text-ink-4" />
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
