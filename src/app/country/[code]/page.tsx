import { ArrowUpRight, GlobeHemisphereWest, ShieldCheck } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";

import { StatusMark } from "@/components/kit/status-mark";
import { Breadcrumbs } from "@/components/pages/breadcrumbs";
import { DayBars } from "@/components/pages/day-bars";
import { DotMap } from "@/components/pages/dot-map";
import { IncidentList } from "@/components/pages/incident-list";
import { JsonLd, breadcrumbList } from "@/components/pages/json-ld";
import { PageFallback } from "@/components/pages/page-fallback";
import { PageShell } from "@/components/pages/page-shell";
import { PageSection } from "@/components/pages/section";
import { PRIMARY, ROW, SECONDARY } from "@/components/pages/styles";
import { Eyebrow, RankBars, Tile, TileHead } from "@/components/pages/tile";
import { countryName } from "@/lib/countries";
import { capitalise, countryLabel, countryPhrase, countryPoint, longDate, plural, utcTime } from "@/lib/og/copy";
import { packMarkers, viewAround, worldView } from "@/lib/og/map";
import { countriesWithIncidents, countryIncidents } from "@/lib/og/select";
import { SITE_URL } from "@/lib/site";
import { getSnapshot } from "@/lib/snapshot";
import { countryParams } from "@/lib/static-params";
import type { Incident, IncidentStatus } from "@/lib/types";
import { cn, decodeParam } from "@/lib/utils";

export async function generateStaticParams() {
  return countryParams();
}

interface Props {
  params: Promise<{ code: string }>;
}

function isoFor(raw: string): string | null {
  const iso = raw.toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) return null;
  return countryName(iso) !== iso ? iso : null;
}

function tally(incidents: Incident[]) {
  const count = (statuses: IncidentStatus[]) => incidents.filter((incident) => statuses.includes(incident.status)).length;
  return { confirmed: count(["confirmed"]), reported: count(["reported", "precautionary", "disputed"]), claimed: count(["claimed"]) };
}

/** The most frequent values of a field, for the ranked bars. */
function ranked(values: (string | undefined)[], limit: number): { name: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, n]) => ({ name, n }));
}

const STATUS_CELLS = [
  { status: "confirmed", label: "Confirmed", note: "By the victim or a regulator" },
  { status: "reported", label: "Reported", note: "By the press" },
  { status: "claimed", label: "Claimed", note: "Only by ransomware gangs" },
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const iso = isoFor(decodeParam((await params).code));
  if (!iso) return { title: "Country not found", robots: { index: false } };
  return metadataFor(iso);
}

async function metadataFor(iso: string): Promise<Metadata> {
  "use cache";
  cacheLife("feed");
  const snapshot = await getSnapshot();
  const incidents = countryIncidents(snapshot, iso);
  const { confirmed, reported, claimed } = tally(incidents);
  const title = `Cyber incidents in ${countryPhrase(iso)}, last 30 days`;
  const description = incidents.length
    ? `${plural(incidents.length, "organisation")} hit in ${countryPhrase(iso)} in the last 30 days: ${confirmed} confirmed, ${reported} reported by the press, ${claimed} only claimed by ransomware gangs. Every one sourced, on a live map.`
    : `No cyber incidents reported in ${countryPhrase(iso)} in the last 30 days. See the live map for everything else.`;
  const url = `/country/${iso}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: incidents.length ? undefined : { index: false },
    openGraph: { type: "website", siteName: "Global Hack Map", title, description, url },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** The shell renders at once; the country streams in, and is cached per URL after its first visit. */
export default function CountryPage({ params }: Props) {
  return (
    <Suspense fallback={<PageFallback label="Loading the country" />}>
      <CountryRoute params={params} />
    </Suspense>
  );
}

async function CountryRoute({ params }: Props) {
  const raw = decodeParam((await params).code);
  if (raw.toUpperCase() === "UK") permanentRedirect("/country/GB");
  const iso = isoFor(raw);
  if (!iso) notFound();
  if (raw !== iso) permanentRedirect(`/country/${iso}`);
  return <CountryView iso={iso} />;
}

/** The country page, cached as rendered HTML so dates and copy are computed once per refresh. */
async function CountryView({ iso }: { iso: string }) {
  "use cache";
  cacheLife("feed");
  const snapshot = await getSnapshot();
  const incidents = countryIncidents(snapshot, iso);
  const outages = snapshot.outages.filter((outage) => outage.country === iso);
  const { confirmed, reported, claimed } = tally(incidents);
  const name = countryLabel(iso);
  const phrase = countryPhrase(iso);
  const url = `${SITE_URL}/country/${iso}`;
  const actors = ranked(
    incidents.map((incident) => incident.actor),
    4,
  );
  const sectors = ranked(
    incidents.map((incident) => incident.sector && capitalise(incident.sector)),
    4,
  );
  const counts = { confirmed, reported, claimed };
  const latest = incidents[0];

  const others = countriesWithIncidents(snapshot)
    .filter((other) => other !== iso)
    .map((other) => ({ iso: other, n: snapshot.incidents.filter((incident) => incident.country === other).length }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 16);

  const point = countryPoint(iso);
  const view = point
    ? viewAround(point[1], point[0], { width: 640, height: 480, scale: 5.2, x: 320, y: 240 })
    : worldView({ width: 640, height: 480, scale: 1.7, top: 60 });
  const markers = packMarkers(
    view,
    incidents.map((incident) => ({ lat: incident.lat, lon: incident.lon, kind: incident.status, r: 5.5 })),
    5.5 * 2.3,
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: `Cyber incidents in ${phrase}, last 30 days`,
        inLanguage: "en",
        dateModified: snapshot.generatedAt,
        isPartOf: { "@type": "WebSite", name: "Global Hack Map", url: SITE_URL },
        about: { "@type": "Country", name },
        mainEntity: { "@id": `${url}#incidents` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      {
        "@type": "ItemList",
        "@id": `${url}#incidents`,
        name: `Organisations hit in ${phrase}`,
        numberOfItems: incidents.length,
        itemListElement: incidents.slice(0, 50).map((incident, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: incident.victim,
          url: `${SITE_URL}/incident/${incident.id}`,
        })),
      },
      breadcrumbList(`${url}#breadcrumb`, [
        { name: "Live map", url: SITE_URL },
        { name, url },
      ]),
    ],
  };

  const maxOther = Math.max(1, ...others.map((other) => other.n));

  return (
    <PageShell>
      <JsonLd data={jsonLd} />
      <Breadcrumbs items={[{ label: "Live map", href: "/" }, { label: name }]} />

      <header className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Eyebrow as="p">
            Updated {longDate(snapshot.generatedAt)}, {utcTime(snapshot.generatedAt)}
          </Eyebrow>
          <h1 className="mt-3 font-semicondensed text-[clamp(34px,4.6vw,56px)] font-bold leading-[1] tracking-[-0.02em] text-ink text-balance">
            Cyber incidents in {phrase}
          </h1>
          <p className="mt-3 max-w-[62ch] text-[15.5px] leading-relaxed text-ink-3 text-pretty">
            {incidents.length
              ? "Every incident reported here in the last 30 days, newest first, each linked to its sources."
              : "Nothing has been reported here in the last 30 days. That can mean a quiet month or thin reporting in local languages, not that nothing happened."}
          </p>
        </div>
        <div className="grid shrink-0 gap-2 sm:flex">
          <Link href={latest ? `/?i=${encodeURIComponent(latest.id)}` : "/"} className={PRIMARY}>
            <GlobeHemisphereWest className="size-3.5" /> See it on the live map
          </Link>
          <Link href="/check" className={SECONDARY}>
            <ShieldCheck className="size-3.5" /> Am I affected?
          </Link>
        </div>
      </header>

      <div className="mt-8 grid gap-3 lg:grid-cols-[minmax(0,1fr)_460px]">
        <Tile>
          <TileHead aside={<Eyebrow>Last 30 days</Eyebrow>}>
            <Eyebrow>Organisations hit</Eyebrow>
          </TileHead>
          <div className="flex items-end justify-between gap-5 px-4 pb-4 pt-1.5 sm:px-5">
            <span className="font-condensed text-[68px] font-bold leading-[0.86] tracking-[-0.035em] text-ink">{incidents.length}</span>
            <DayBars dates={incidents.map((incident) => incident.date)} until={snapshot.generatedAt} days={30} className="w-[190px] sm:w-[280px]" />
          </div>
          <dl className="grid grid-cols-3 border-t border-white/[0.06]">
            {STATUS_CELLS.map((cell, index) => (
              <div key={cell.status} className={cn("min-w-0 px-4 py-3 sm:px-5", index > 0 && "border-l border-white/[0.06]")}>
                <dt className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                  <StatusMark status={cell.status} size={8} />
                  {cell.label}
                </dt>
                <dd className="mt-1 text-[18px] font-semibold leading-none tracking-[-0.01em] text-ink tabular">{counts[cell.status]}</dd>
                <dd className="mt-1.5 text-[11.5px] leading-snug text-ink-4">{cell.note}</dd>
              </div>
            ))}
          </dl>
          {sectors.length || actors.length ? (
            <div className="grid gap-x-8 gap-y-5 border-t border-white/[0.06] px-4 py-4 sm:grid-cols-2 sm:px-5">
              {sectors.length ? (
                <div>
                  <Eyebrow as="h2">Most hit sectors</Eyebrow>
                  <div className="mt-3">
                    <RankBars items={sectors} label={`Most hit sectors in ${phrase}`} />
                  </div>
                </div>
              ) : null}
              {actors.length ? (
                <div>
                  <Eyebrow as="h2">Groups named</Eyebrow>
                  <div className="mt-3">
                    <RankBars items={actors} label={`Groups named in ${phrase}`} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </Tile>

        <Tile className="relative aspect-[4/3] lg:aspect-auto lg:min-h-[340px]">
          <DotMap view={view} markers={markers} label={`Map of ${plural(incidents.length, "incident")} in ${phrase}`} className="absolute inset-0" />
        </Tile>
      </div>

      <div className="grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {incidents.length ? (
            <PageSection title={`Incidents in ${phrase}`} id="incidents" aside="Newest first">
              <IncidentList incidents={incidents} place="city" group />
            </PageSection>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-3 pt-12" aria-label="More">
          {outages.length ? (
            <Tile as="section" aria-labelledby="outages-title" className="px-2 pb-2">
              <TileHead className="px-2 sm:px-2" aside={<Eyebrow>{outages.length}</Eyebrow>}>
                <Eyebrow as="h2" id="outages-title">
                  Connectivity drops
                </Eyebrow>
              </TileHead>
              <p className="px-2 pb-1 pt-2 text-[12px] leading-relaxed text-ink-4">
                Drops in internet connectivity measured by IODA at Georgia Tech. The cause is not known unless a source says so.
              </p>
              <ul>
                {outages.map((outage) => (
                  <li key={outage.id}>
                    <a href={outage.url} target="_blank" rel="noreferrer" className={cn(ROW, "group items-start py-2.5")}>
                      <span aria-hidden className="mt-[5px] size-2 shrink-0 rounded-full ring-[1.5px] ring-outage" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-ink">{outage.title}</span>
                        <span className="mt-0.5 block text-[11.5px] text-ink-4">
                          {outage.end ? "Recovered" : <span className="text-outage">Ongoing</span>} · from {longDate(outage.start)}, {utcTime(outage.start)}
                        </span>
                      </span>
                      <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-ink-4 transition-colors group-hover:text-ink-2" />
                    </a>
                  </li>
                ))}
              </ul>
            </Tile>
          ) : null}

          {others.length ? (
            <Tile as="section" aria-labelledby="elsewhere-title" className="px-2 pb-2 lg:sticky lg:top-6">
              <TileHead className="px-2 sm:px-2" aside={<Eyebrow>This month</Eyebrow>}>
                <Eyebrow as="h2" id="elsewhere-title">
                  Elsewhere
                </Eyebrow>
              </TileHead>
              <ul className="mt-1.5">
                {others.map((other) => (
                  <li key={other.iso}>
                    <Link href={`/country/${other.iso}`} className={cn(ROW, "group gap-2.5 py-1.5")}>
                      <span className="w-6 shrink-0 font-mono text-[10.5px] text-ink-4">{other.iso}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2 group-hover:text-ink">{countryLabel(other.iso)}</span>
                      <span aria-hidden className="h-[3px] w-14 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
                        <span className="block h-full rounded-full bg-white/40" style={{ width: `${(other.n / maxOther) * 100}%` }} />
                      </span>
                      <span className="w-6 shrink-0 text-right font-mono text-[10.5px] tabular text-ink-3">{other.n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Tile>
          ) : null}
        </aside>
      </div>
    </PageShell>
  );
}
