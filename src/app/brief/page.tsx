import { ArrowUpRight, GlobeHemisphereWest, Rss, SlackLogo } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";

import { StatusMark } from "@/components/kit/status-mark";
import { Breadcrumbs } from "@/components/pages/breadcrumbs";
import { CopyThread } from "@/components/pages/copy-thread";
import { DotMap } from "@/components/pages/dot-map";
import { JsonLd, breadcrumbList } from "@/components/pages/json-ld";
import { PageShell } from "@/components/pages/page-shell";
import { ShareRow } from "@/components/pages/share-row";
import { CHIP, PRIMARY, SECONDARY, TERTIARY } from "@/components/pages/styles";
import { Eyebrow, Tile, TileHead } from "@/components/pages/tile";
import { STATUS_LABEL } from "@/lib/format";
import { fullDate, longDate, plural, truncate, utcTime } from "@/lib/og/copy";
import { kevIndex } from "@/lib/og/kev";
import { packMarkers, worldView } from "@/lib/og/map";
import { type DigestItem, buildDigest } from "@/lib/og/digest";
import { SITE_URL } from "@/lib/site";
import { getSnapshot } from "@/lib/snapshot";
import type { IncidentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const SLACK_URL = "https://slack.valyu.ai";

export async function generateMetadata(): Promise<Metadata> {
  "use cache";
  cacheLife("feed");
  const [snapshot, kev] = await Promise.all([getSnapshot(), kevIndex()]);
  const digest = buildDigest(snapshot, kev);
  const title = `Daily brief, ${longDate(digest.date)}: everything that broke in the last 48 hours`;
  const description = truncate(digest.summary, 200);
  return {
    title,
    description,
    alternates: { canonical: "/brief", types: { "application/rss+xml": "/feed.xml" } },
    openGraph: { type: "article", siteName: "Global Hack Map", title, description, url: "/brief" },
    twitter: { card: "summary_large_image", title, description },
  };
}

function Item({ item }: { item: DigestItem }) {
  const isIncident = item.mark && item.mark !== "outage";
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 border-t border-white/[0.06] py-6 first:border-t-0 first:pt-3 sm:grid-cols-[36px_minmax(0,1fr)]">
      <span aria-hidden className="pt-[3px] font-mono text-[11px] text-ink-4 tabular">
        {String(item.n).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <h3 className="flex items-start gap-2.5 text-[16.5px] font-medium leading-snug tracking-[-0.005em] text-ink text-pretty">
          {isIncident ? (
            <>
              <StatusMark status={item.mark as IncidentStatus} size={9} className="mt-[6px]" />
              <span className="sr-only">{STATUS_LABEL[item.mark as IncidentStatus]}:</span>
            </>
          ) : null}
          {item.mark === "outage" ? <span aria-hidden className="mt-[6px] size-[9px] shrink-0 rounded-full ring-[1.5px] ring-outage" /> : null}
          <span>{item.headline}</span>
        </h3>
        <p className="mt-1.5 max-w-[68ch] text-[14.5px] leading-relaxed text-ink-2 text-pretty">{item.detail}</p>
        {item.action ? (
          <div className="mt-3.5 max-w-[68ch] rounded-[14px] bg-white/[0.028] px-3.5 py-2.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
            <Eyebrow as="p">What to do</Eyebrow>
            <p className="mt-1 text-[14px] leading-relaxed text-ink text-pretty">{item.action}</p>
          </div>
        ) : null}
        {item.source || item.links.length ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            {item.links.map((link) => (
              <Link key={link.href} href={link.href} className={cn(CHIP, link.mono && "font-mono text-[11.5px] text-ink")}>
                {link.label}
              </Link>
            ))}
            {item.source ? (
              <a href={item.source.url} target="_blank" rel="noreferrer nofollow" className={TERTIARY}>
                {item.source.label} <ArrowUpRight className="size-3" />
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export default async function BriefPage() {
  "use cache";
  cacheLife("feed");
  const [snapshot, kev] = await Promise.all([getSnapshot(), kevIndex()]);
  const digest = buildDigest(snapshot, kev);
  const url = `${SITE_URL}/brief`;
  const day = fullDate(digest.date, false);
  const view = worldView({ width: 1200, height: 520, scale: 3.3, top: 18 });
  const markers = packMarkers(
    view,
    digest.incidents.map((incident) => ({ lat: incident.lat, lon: incident.lon, kind: incident.status, r: 6 })),
    6 * 2.35,
  );
  const items = digest.groups.flatMap((group) => group.items);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: `Everything that broke in the last 48 hours, ${longDate(digest.date)}`,
        description: digest.summary,
        inLanguage: "en",
        dateModified: digest.compiledAt,
        isPartOf: { "@type": "WebSite", name: "Global Hack Map", url: SITE_URL },
        mainEntity: { "@id": `${url}#items` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        primaryImageOfPage: `${url}/opengraph-image`,
      },
      {
        "@type": "ItemList",
        "@id": `${url}#items`,
        numberOfItems: items.length,
        itemListElement: items.map((item) => ({
          "@type": "ListItem",
          position: item.n,
          name: item.headline,
          ...(item.links[0] ? { url: `${SITE_URL}${item.links[0].href}` } : item.source ? { url: item.source.url } : {}),
        })),
      },
      breadcrumbList(`${url}#breadcrumb`, [
        { name: "Live map", url: SITE_URL },
        { name: "Daily brief", url },
      ]),
    ],
  };

  const { counts } = digest;
  const more: { label: string; value: number | null }[] = [
    { label: "Added to CISA's exploited list", value: counts.kevAdded },
    { label: "Other flaws in the news", value: counts.newsVulns },
    { label: "Malicious packages published", value: counts.malware },
    { label: "Connectivity drops in progress", value: counts.outages },
  ];

  return (
    <PageShell>
      <JsonLd data={jsonLd} />
      <Breadcrumbs items={[{ label: "Live map", href: "/" }, { label: "Daily brief" }]} />

      <div className="mt-6 grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_340px]">
        <header className="min-w-0 lg:col-start-1 lg:row-start-1">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Eyebrow>Daily brief</Eyebrow>
            <span aria-hidden className="size-[3px] rounded-full bg-ink-4" />
            <Eyebrow className="text-ink-3">{day}</Eyebrow>
          </p>
          <h1 className="mt-3 max-w-[18ch] font-semicondensed text-[clamp(34px,4.6vw,56px)] font-bold leading-[1] tracking-[-0.02em] text-ink text-balance">
            Everything that broke in the last 48 hours
          </h1>
          <p className="mt-4 text-[12.5px] leading-relaxed text-ink-4">
            {digest.mode === "brief" ? (
              <>
                Researched by Valyu DeepResearch from {plural(digest.sources ?? 0, "source")}, {longDate(digest.compiledAt)} at {utcTime(digest.compiledAt)}.
                Counts are live.
              </>
            ) : (
              <>
                Built from the live feeds at {utcTime(digest.compiledAt)}, {longDate(digest.compiledAt)}.
              </>
            )}
          </p>
          <p className="mt-5 max-w-[64ch] text-[17px] leading-relaxed text-ink text-pretty">{digest.overview ?? digest.summary}</p>
          <div className="mt-6 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Link href="/" className={PRIMARY}>
              <GlobeHemisphereWest className="size-3.5" /> Open the live map
            </Link>
            <CopyThread posts={digest.thread} />
            {digest.reportUrl ? (
              <a href={digest.reportUrl} target="_blank" rel="noreferrer" className={cn(TERTIARY, "h-10 justify-center px-3 text-[13.5px]")}>
                Read the full report <ArrowUpRight className="size-3.5" />
              </a>
            ) : null}
          </div>
        </header>

        <Tile className="mt-8 lg:col-start-2 lg:row-start-1 lg:mt-0 lg:self-start">
          <TileHead aside={<Eyebrow>Last 48 hours</Eyebrow>}>
            <Eyebrow>Organisations hit</Eyebrow>
          </TileHead>
          <p className="flex items-baseline gap-2.5 px-4 pb-4 pt-1.5 sm:px-5">
            <span className="font-condensed text-[68px] font-bold leading-[0.86] tracking-[-0.035em] text-ink">{counts.incidents}</span>
            <span className="text-[13px] text-ink-3">in {plural(counts.countries, "country", "countries")}</span>
          </p>
          <dl className="grid grid-cols-3 border-t border-white/[0.06]">
            {(["confirmed", "reported", "claimed"] as const).map((status, index) => (
              <div key={status} className={cn("min-w-0 px-4 py-3", index > 0 && "border-l border-white/[0.06]")}>
                <dt className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                  <StatusMark status={status} size={8} />
                  {STATUS_LABEL[status]}
                </dt>
                <dd className="mt-1 text-[18px] font-semibold leading-none tracking-[-0.01em] text-ink tabular">{counts[status]}</dd>
              </div>
            ))}
          </dl>
          <dl className="border-t border-white/[0.06] px-4 py-2 sm:px-5">
            {more.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4 py-1.5">
                <dt className="text-[12.5px] text-ink-3">{row.label}</dt>
                <dd className={cn("font-mono text-[12px] tabular", row.value === null ? "text-ink-4" : "text-ink")}>
                  {row.value === null ? "Unknown" : row.value}
                </dd>
              </div>
            ))}
          </dl>
        </Tile>

        <figure className="mt-10 lg:col-span-2 lg:row-start-2">
          <Tile>
            <DotMap
              view={view}
              markers={markers}
              label={`World map of ${plural(digest.incidents.length, "organisation")} hit in the last 48 hours`}
              className="aspect-[1200/520]"
            />
          </Tile>
          <figcaption className="mt-2.5 px-1">
            <Eyebrow>Where they were hit</Eyebrow>
          </figcaption>
        </figure>

        <div className="min-w-0 lg:col-start-1 lg:row-start-3">
          {digest.groups.map((group) => (
            <section key={group.id} aria-labelledby={`${group.id}-title`} className="pt-12">
              <h2
                id={`${group.id}-title`}
                className="sticky top-0 z-[1] -mx-3 flex items-baseline justify-between border-b border-white/[0.06] bg-space px-3 pb-2.5 pt-3"
              >
                <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">{group.title}</span>
                <span className="font-mono text-[10.5px] tabular text-ink-4">{group.items.length}</span>
              </h2>
              <ol start={group.items[0]?.n} className="list-none">
                {group.items.map((item) => (
                  <Item key={item.n} item={item} />
                ))}
              </ol>
            </section>
          ))}
        </div>

        <aside className="min-w-0 pt-12 lg:col-start-2 lg:row-start-3" aria-label="Follow the brief">
          <div className="space-y-3 lg:sticky lg:top-6">
            <Tile className="p-4">
              <Eyebrow as="h2">Get this every morning</Eyebrow>
              <p className="mt-2 text-[13.5px] leading-snug text-ink-2 text-pretty">
                Add the Valyu bot to Slack, or follow the RSS feed of every new incident in any reader.
              </p>
              <div className="mt-4 grid gap-2">
                <a href={SLACK_URL} target="_blank" rel="noreferrer" className={`${PRIMARY} w-full`}>
                  <SlackLogo className="size-3.5" /> Add to Slack
                </a>
                <a href="/feed.xml" className={`${SECONDARY} w-full`}>
                  <Rss className="size-3.5" /> RSS feed
                </a>
              </div>
            </Tile>
            <Tile className="p-4">
              <Eyebrow as="h2">Share today&apos;s brief</Eyebrow>
              <ShareRow
                grid
                className="mt-3"
                url={url}
                title={`Everything that broke in the last 48 hours, ${longDate(digest.date)}`}
                text={`Everything that broke in the last 48 hours (${longDate(digest.date)}), with sources and fixes:`}
              />
            </Tile>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
