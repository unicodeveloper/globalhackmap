import { ArrowDown, ArrowUpRight, GlobeHemisphereWest, ShieldCheck } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AiBrief } from "@/components/hud/ai-brief";
import { DeepResearch } from "@/components/hud/deep-research";
import { IncidentAgentButtons } from "@/components/hud/fix-buttons";
import { OrgLogo } from "@/components/kit/org-logo";
import { StatusMark } from "@/components/kit/status-mark";
import { Breadcrumbs } from "@/components/pages/breadcrumbs";
import { DotMap } from "@/components/pages/dot-map";
import { Guidance } from "@/components/pages/guidance";
import { IncidentList } from "@/components/pages/incident-list";
import { JsonLd, breadcrumbList } from "@/components/pages/json-ld";
import { PageFallback } from "@/components/pages/page-fallback";
import { PageShell } from "@/components/pages/page-shell";
import { PageSection } from "@/components/pages/section";
import { ShareRow } from "@/components/pages/share-row";
import { CHIP, PRIMARY, ROW, SECONDARY } from "@/components/pages/styles";
import { Eyebrow, Stat, Tile, statCell, statGrid } from "@/components/pages/tile";
import { incidentPrompt } from "@/lib/deeplinks";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/format";
import { guidanceFor } from "@/lib/guidance";
import {
  capitalise,
  clean,
  countryLabel,
  hostOf,
  incidentDescription,
  incidentTitle,
  longDate,
  placeText,
  recordsText,
  statusLine,
  statusSentence,
} from "@/lib/og/copy";
import { project, viewAround } from "@/lib/og/map";
import { relatedIncidents } from "@/lib/og/select";
import { REPO_URL, SITE_URL } from "@/lib/site";
import { getSnapshot } from "@/lib/snapshot";
import { incidentParams } from "@/lib/static-params";
import type { Incident } from "@/lib/types";
import { cn, decodeParam } from "@/lib/utils";

export async function generateStaticParams() {
  return incidentParams();
}

interface Props {
  params: Promise<{ id: string }>;
}

async function load(id: string): Promise<Incident | undefined> {
  "use cache";
  cacheLife("feed");
  const snapshot = await getSnapshot();
  return snapshot.incidents.find((incident) => incident.id === id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadataFor(decodeParam((await params).id));
}

async function metadataFor(id: string): Promise<Metadata> {
  "use cache";
  cacheLife("feed");
  const incident = await load(id);
  if (!incident) return { title: "Incident no longer on the map", robots: { index: false } };
  const title = incidentTitle(incident);
  const description = incidentDescription(incident);
  const url = `/incident/${incident.id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", siteName: "Global Hack Map", title, description, url, modifiedTime: incident.updated },
    // Declaring twitter here drops the home card inherited from the root, so X falls back to this page's card.
    twitter: { card: "summary_large_image", title, description },
  };
}

const GEO_BASIS: Record<Incident["geoBasis"], string> = {
  stated: "the city named in reporting",
  hq: "the organisation's headquarters city",
  tld: "the country of its web domain",
  country: "country level",
};

function sourceKind(kind?: string): string | null {
  if (!kind || kind === "news") return null;
  const labels: Record<string, string> = { filing: "Filing", regulator: "Regulator", victim: "The organisation", leaksite: "Leak site", research: "Research" };
  return labels[kind] ?? capitalise(kind);
}

/** Some sources arrive titled with just their host; show the link itself instead of repeating it. */
function sourceTitle(source: Incident["sources"][number]): string {
  const host = hostOf(source.url);
  if (source.title && source.title !== host && source.title !== source.publisher) return source.title;
  return source.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

/** The shell renders at once; the incident streams in, and is cached per URL after its first visit. */
export default function IncidentPage({ params }: Props) {
  return (
    <Suspense fallback={<PageFallback label="Loading the incident" />}>
      <IncidentRoute params={params} />
    </Suspense>
  );
}

async function IncidentRoute({ params }: Props) {
  const id = decodeParam((await params).id);
  if (!(await load(id))) notFound();
  return <IncidentView id={id} />;
}

/** The whole dossier, cached as rendered HTML so dates and copy are computed once per refresh. */
async function IncidentView({ id }: { id: string }) {
  "use cache";
  cacheLife("feed");
  const snapshot = await getSnapshot();
  const incident = snapshot.incidents.find((item) => item.id === id);
  if (!incident) return null;

  const related = relatedIncidents(snapshot, incident).slice(0, 8);
  const guidance = guidanceFor(incident);
  const url = `${SITE_URL}/incident/${incident.id}`;
  const place = placeText(incident);
  const country = countryLabel(incident.country);
  const title = incidentTitle(incident);
  const summary = incident.summary ? clean(incident.summary) : "";
  const primary = incident.sources[0]?.url ?? url;
  const view = viewAround(incident.lat, incident.lon, { width: 640, height: 400, scale: 4.6, x: 320, y: 190 });
  const [mx, my] = project(view, incident.lon, incident.lat);

  const facts: [string, string][] = [
    ["Type", TYPE_LABEL[incident.type]],
    ...(incident.sector ? ([["Sector", capitalise(incident.sector)]] as [string, string][]) : []),
    ...(recordsText(incident) ? ([["Records", capitalise(recordsText(incident)!)]] as [string, string][]) : []),
    ...(incident.actor ? ([[incident.status === "claimed" ? "Claimed by" : "Attributed to", incident.actor]] as [string, string][]) : []),
    ["First reported", longDate(incident.date)],
    ["Latest source", longDate(incident.updated)],
  ];

  const factCols = facts.length === 4 ? 2 : 3;

  const crumbs = [{ label: "Live map", href: "/" }, { label: country, href: `/country/${incident.country}` }, { label: incident.victim }];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: title,
        description: incidentDescription(incident),
        inLanguage: "en",
        dateModified: incident.updated,
        isPartOf: { "@type": "WebSite", name: "Global Hack Map", url: SITE_URL },
        about: [{ "@id": `${url}#incident` }, { "@id": `${url}#organisation` }],
        mainEntity: { "@id": `${url}#incident` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        primaryImageOfPage: `${url}/opengraph-image`,
      },
      {
        "@type": "Thing",
        "@id": `${url}#incident`,
        name: clean(incident.title),
        description: `${statusLine(incident)}. ${summary}`.trim(),
        url,
        identifier: incident.id,
        subjectOf: incident.sources.map((source) => ({
          "@type": "CreativeWork",
          name: source.title,
          url: source.url,
          ...(source.publisher ? { publisher: { "@type": "Organization", name: source.publisher } } : {}),
          ...(source.date ? { datePublished: source.date } : {}),
        })),
      },
      {
        "@type": "Organization",
        "@id": `${url}#organisation`,
        name: incident.victim,
        ...(incident.domain ? { url: `https://${incident.domain.replace(/^https?:\/\//, "")}` } : {}),
        address: { "@type": "PostalAddress", addressCountry: incident.country, ...(incident.city ? { addressLocality: incident.city } : {}) },
      },
      breadcrumbList(`${url}#breadcrumb`, [
        { name: "Live map", url: SITE_URL },
        { name: country, url: `${SITE_URL}/country/${incident.country}` },
        { name: incident.victim, url },
      ]),
    ],
  };

  return (
    <PageShell>
      <JsonLd data={jsonLd} />
      <Breadcrumbs items={crumbs} />

      <div className="mt-6 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <header>
            <div className="flex items-center gap-4">
              <OrgLogo name={incident.victim} domain={incident.domain} size={56} className="rounded-[15px]" />
              <div className="min-w-0">
                <h1 className="font-semicondensed text-[clamp(30px,4.2vw,48px)] font-bold leading-[1.02] tracking-[-0.02em] text-ink text-balance">
                  {incident.victim}
                </h1>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[14px] text-ink-3">
                  {place}
                  <span aria-hidden className="text-ink-4">
                    ·
                  </span>
                  <a href="#sources" className="inline-flex items-center gap-1 transition-colors hover:text-ink">
                    {incident.sources.length} {incident.sources.length === 1 ? "source" : "sources"} <ArrowDown className="size-3" />
                  </a>
                </p>
              </div>
            </div>

            <p className="mt-6 flex max-w-[66ch] items-start gap-2.5 text-[15.5px] leading-snug text-ink-2 text-pretty">
              <StatusMark status={incident.status} size={10} className="mt-[5px]" />
              <span className="sr-only">{STATUS_LABEL[incident.status]}:</span>
              <span>{statusSentence(incident)}</span>
            </p>

            <h2 className="mt-5 max-w-[44ch] text-[clamp(19px,1.9vw,22px)] font-medium leading-snug tracking-[-0.01em] text-ink text-pretty">
              {clean(incident.title)}
            </h2>
            {summary ? <p className="mt-3 max-w-[68ch] text-[15.5px] leading-relaxed text-ink-2 text-pretty">{summary}</p> : null}
          </header>

          <Tile className="mt-6">
            <dl className={statGrid(factCols)}>
              {facts.map(([label, value], index) => (
                <Stat
                  key={label}
                  label={label}
                  value={<span className="text-[15px] font-medium">{value}</span>}
                  className={statCell(index, facts.length, factCols)}
                />
              ))}
            </dl>
          </Tile>

          <div className="mt-3">
            <Guidance people={guidance.people} teams={guidance.teams}>
              <p className="mb-3 text-[12.5px] text-ink-3">Not sure? Ask an assistant with the sources attached, or have a coding agent check your systems.</p>
              <div className="max-w-[720px]">
                <IncidentAgentButtons victim={incident.victim} url={primary} prompt={incidentPrompt(incident.victim, primary)} />
              </div>
            </Guidance>
          </div>

          <div className="mt-3">
            <AiBrief kind="incident" id={incident.id} label={`Brief me on ${incident.victim}`} />
            <div className="mt-3">
              <DeepResearch
                kind="incident"
                id={incident.id}
                subject={incident.victim}
                title={`Get a full research report on ${incident.victim}`}
                blurb="How the attackers got in, what was taken, the group behind it and what customers and suppliers should do. Cited, with a PDF, in about five minutes."
              />
            </div>
          </div>
        </div>

        <aside className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-label="On the map">
          <div className="space-y-3 lg:sticky lg:top-6">
            <Tile>
              <DotMap
                view={view}
                markers={[{ lat: incident.lat, lon: incident.lon, kind: incident.status, r: 9, ring: true }]}
                focus={{ x: mx, y: my, radius: 220 }}
                label={`Map showing ${incident.victim} in ${place}`}
                className="aspect-[16/10] border-b border-white/[0.06]"
              />
              <div className="p-4 pb-0">
                <p className="text-[12.5px] leading-snug text-ink-3">
                  {place}. Placed at {GEO_BASIS[incident.geoBasis]}.
                </p>
                <div className="mt-3.5 grid gap-2">
                  <Link href={`/?i=${encodeURIComponent(incident.id)}`} className={`${PRIMARY} w-full`}>
                    <GlobeHemisphereWest className="size-3.5" /> See it on the live map
                  </Link>
                  <Link href="/check" className={`${SECONDARY} w-full`}>
                    <ShieldCheck className="size-3.5" /> Am I affected?
                  </Link>
                </div>
              </div>
              <div className="mt-4 border-t border-white/[0.06] p-2">
                <Link href={`/country/${incident.country}`} className={cn(ROW, "text-[13px] text-ink-2 hover:text-ink")}>
                  <span className="flex-1">Everything in {country} this month</span>
                  <ArrowUpRight className="size-3.5 text-ink-4" />
                </Link>
              </div>
            </Tile>
            <Tile className="p-4">
              <Eyebrow as="h2">Share</Eyebrow>
              <ShareRow
                grid
                className="mt-3"
                url={url}
                title={title}
                text={`${incident.victim}: ${statusLine(incident).toLowerCase()}. What happened and what to do:`}
              />
            </Tile>
          </div>
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          {incident.cves.length ? (
            <PageSection title="Linked vulnerabilities" id="cves" className="pt-2" aside={incident.cves.length}>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {incident.cves.map((cve) => (
                  <Link key={cve} href={`/cve/${cve}`} className={`${CHIP} font-mono text-[12px] text-ink`}>
                    {cve} <ArrowUpRight className="size-3 text-ink-4" />
                  </Link>
                ))}
              </div>
            </PageSection>
          ) : null}

          {related.length ? (
            <PageSection
              title={incident.actor ? `${incident.actor} has also hit` : "Related incidents"}
              id="related"
              className={incident.cves.length ? undefined : "pt-2"}
            >
              <IncidentList incidents={related} />
            </PageSection>
          ) : null}

          <PageSection title="Sources" id="sources" aside={incident.sources.length} className={incident.cves.length || related.length ? undefined : "pt-2"}>
            <ul>
              {incident.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer nofollow" className={cn(ROW, "group -mx-3 items-start py-2.5")}>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2 font-mono text-[10.5px] text-ink-4">
                        <span>{source.publisher ?? hostOf(source.url)}</span>
                        {sourceKind(source.kind) ? <span className="text-ink-3">{sourceKind(source.kind)}</span> : null}
                        {source.date ? <span className="tabular">{longDate(source.date)}</span> : null}
                      </span>
                      <span className="mt-1 line-clamp-2 break-words text-[14px] leading-snug text-ink-2 group-hover:text-ink">{sourceTitle(source)}</span>
                    </span>
                    <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-ink-4 transition-colors group-hover:text-ink-2" />
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-5 max-w-[68ch] text-[12.5px] leading-relaxed text-ink-4">
              Confidence {Math.round(incident.confidence * 100)}% that this is real and correctly placed. Locations are city centroids at best. Spotted an
              error?{" "}
              <a
                href={`${REPO_URL}/issues/new?title=${encodeURIComponent(`Correction: ${incident.victim}`)}&body=${encodeURIComponent(`${url}\n\nWhat is wrong, and a source for the correction:\n`)}`}
                className="text-ink-3 underline decoration-white/20 underline-offset-[3px] hover:text-ink-2"
                target="_blank"
                rel="noreferrer"
              >
                Report a correction
              </a>
              .
            </p>
          </PageSection>
        </div>
      </div>
    </PageShell>
  );
}
