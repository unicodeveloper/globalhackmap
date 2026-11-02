import { ArrowRight, ArrowUpRight, BookOpenText, GlobeHemisphereWest } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";

import { AiBrief } from "@/components/hud/ai-brief";
import { DeepResearch } from "@/components/hud/deep-research";
import { FixButtons } from "@/components/hud/fix-buttons";
import { StatusMark } from "@/components/kit/status-mark";
import { Affected, AffectedPending } from "@/components/pages/affected";
import { Breadcrumbs } from "@/components/pages/breadcrumbs";
import { IncidentList } from "@/components/pages/incident-list";
import { JsonLd, breadcrumbList } from "@/components/pages/json-ld";
import { PageFallback } from "@/components/pages/page-fallback";
import { PageShell } from "@/components/pages/page-shell";
import { PageSection } from "@/components/pages/section";
import { ShareRow } from "@/components/pages/share-row";
import { PRIMARY, ROW } from "@/components/pages/styles";
import { Eyebrow, Stat, TickMeter, Tile, TileHead, statCell, statGrid } from "@/components/pages/tile";
import { findVuln, isCveId } from "@/lib/lookup";
import { type ExploitTone, clean, cveDescription, cveTitle, epssText, exploitTone, hostOf, longDate, productLabel } from "@/lib/og/copy";
import { kevIndex, withKev } from "@/lib/og/kev";
import { cveMentions, isInSnapshot } from "@/lib/og/select";
import { SITE_URL } from "@/lib/site";
import { getSnapshot } from "@/lib/snapshot";
import { getEpss } from "@/lib/sources/vulns";
import { cveParams } from "@/lib/static-params";
import type { Vuln } from "@/lib/types";
import { cn, decodeParam } from "@/lib/utils";

export async function generateStaticParams() {
  return cveParams();
}

interface Props {
  params: Promise<{ id: string }>;
}

/** Any valid CVE: the snapshot first, then the full KEV catalogue and NVD, with EPSS filled in. */
async function load(id: string): Promise<{ vuln: Vuln; kevKnown: boolean } | null> {
  "use cache";
  cacheLife("feed");
  if (!isCveId(id)) return null;
  const [found, kev] = await Promise.all([findVuln(id).catch(() => null), kevIndex()]);
  if (!found) return null;
  const vuln = withKev(found, kev);
  const kevKnown = kev !== null;
  if (vuln.epss !== undefined) return { vuln, kevKnown };
  const score = (await getEpss([id]).catch(() => null))?.get(id);
  return { vuln: score ? { ...vuln, epss: score.epss, epssPercentile: score.percentile } : vuln, kevKnown };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadataFor(decodeParam((await params).id).toUpperCase());
}

async function metadataFor(id: string): Promise<Metadata> {
  "use cache";
  cacheLife("feed");
  const loaded = await load(id);
  if (!loaded) return { title: "Vulnerability not found", robots: { index: false } };
  const { vuln, kevKnown } = loaded;
  const title = cveTitle(vuln);
  const description = cveDescription(vuln, kevKnown);
  const url = `/cve/${vuln.cve}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", siteName: "Global Hack Map", title, description, url },
    twitter: { card: "summary_large_image", title, description },
  };
}

const kevDate = (date: string) => longDate(`${date}T00:00:00Z`);

/** KEV names repeat the product ("SiteGuard Server Edition OS Command Injection Vulnerability"); NVD names repeat the description. */
function vulnName(vuln: Vuln, product: string, description: string): string | null {
  let name = clean(vuln.name || "");
  if (!name || name === vuln.cve || description.startsWith(name.replace(/\.$/, ""))) return null;
  if (product && name.toLowerCase().startsWith(product.toLowerCase())) name = name.slice(product.length).trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : null;
}

/** The verdict as a lead in the status colour and a plain follow-on. Never stronger than the sources. */
function verdict(vuln: Vuln, tone: ExploitTone, kevKnown: boolean): { lead: string; rest: string } {
  if (tone === "exploited")
    return {
      lead: "Exploited in the wild.",
      rest: `CISA added it to its Known Exploited Vulnerabilities list${vuln.kevAdded ? ` on ${kevDate(vuln.kevAdded)}` : ""}.`,
    };
  if (tone === "news") {
    return kevKnown
      ? { lead: "In the news,", rest: "but not on CISA's list of exploited flaws yet. Treat it as urgent if you run it." }
      : { lead: "In the news.", rest: "CISA's catalogue did not answer just now, so we cannot say whether it is listed as exploited." };
  }
  return kevKnown
    ? { lead: "", rest: "Not on CISA's list of exploited flaws, and not in the news we track." }
    : { lead: "", rest: "CISA's catalogue did not answer just now, so we cannot say whether it is exploited. Check the NVD record." };
}

function percentileText(percentile?: number): string | null {
  if (percentile === undefined) return null;
  return percentile >= 0.999 ? "In the top 0.1% of all CVEs" : `Higher than ${Math.floor(percentile * 100)}% of all CVEs`;
}

/** The shell renders at once; the CVE streams in, and is cached per URL after its first visit. */
export default function CvePage({ params }: Props) {
  return (
    <Suspense fallback={<PageFallback label="Loading the vulnerability" />}>
      <CveRoute params={params} />
    </Suspense>
  );
}

async function CveRoute({ params }: Props) {
  const raw = decodeParam((await params).id);
  const id = raw.toUpperCase();
  if (raw !== id && isCveId(id)) permanentRedirect(`/cve/${id}`);
  const loaded = await load(id);
  if (!loaded) notFound();
  // The researched explainer streams on its own, so a cold one never holds up the rest of the page.
  return (
    <CveView
      id={id}
      affected={
        // Keyed: the slot comes back through the cache inside a children array.
        <Suspense key="affected" fallback={<AffectedPending />}>
          <Affected vuln={loaded.vuln} />
        </Suspense>
      }
    />
  );
}

/** Everything but the explainer, cached as rendered HTML so dates and copy are computed once per refresh. */
async function CveView({ id, affected }: { id: string; affected: React.ReactNode }) {
  "use cache";
  cacheLife("feed");
  const [loaded, snapshot] = await Promise.all([load(id), getSnapshot()]);
  if (!loaded) return null;
  const { vuln, kevKnown } = loaded;

  const url = `${SITE_URL}/cve/${vuln.cve}`;
  const product = productLabel(vuln);
  const tone = exploitTone(vuln, kevKnown);
  const mentions = cveMentions(snapshot, vuln.cve);
  const onMap = isInSnapshot(snapshot, vuln.cve);
  const description = clean(vuln.description);
  const name = vulnName(vuln, product, description);
  const cwe = vuln.cwe?.match(/^CWE-(\d+)$/)?.[1];
  const title = cveTitle(vuln);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: title,
        description: cveDescription(vuln, kevKnown),
        inLanguage: "en",
        isPartOf: { "@type": "WebSite", name: "Global Hack Map", url: SITE_URL },
        about: { "@id": `${url}#vulnerability` },
        mainEntity: { "@id": `${url}#vulnerability` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        primaryImageOfPage: `${url}/opengraph-image`,
      },
      {
        "@type": "Thing",
        "@id": `${url}#vulnerability`,
        name: `${vuln.cve}${product ? ` in ${product}` : ""}`,
        identifier: vuln.cve,
        description: description || vuln.name,
        sameAs: [`https://nvd.nist.gov/vuln/detail/${vuln.cve}`, `https://www.cve.org/CVERecord?id=${vuln.cve}`],
      },
      breadcrumbList(`${url}#breadcrumb`, [
        { name: "Live map", url: SITE_URL },
        { name: vuln.cve, url },
      ]),
    ],
  };

  const said = verdict(vuln, tone, kevKnown);
  const hero = vuln.epss !== undefined ? "epss" : vuln.cvss ? "cvss" : null;
  const severity = vuln.severity ? vuln.severity.charAt(0) + vuln.severity.slice(1).toLowerCase() : null;
  const records = [
    { label: "NVD", host: "nvd.nist.gov", href: `https://nvd.nist.gov/vuln/detail/${vuln.cve}` },
    { label: "CVE.org", host: "cve.org", href: `https://www.cve.org/CVERecord?id=${vuln.cve}` },
    ...(vuln.kev
      ? [
          {
            label: "CISA KEV catalogue",
            host: "cisa.gov",
            href: `https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search_api_fulltext=${vuln.cve}`,
          },
        ]
      : []),
    { label: "EPSS history", host: "first.org", href: `https://api.first.org/data/v1/epss?cve=${vuln.cve}&scope=time-series` },
  ];

  const stats: { label: string; value: React.ReactNode; note?: string; tone: "ink" | "hot" | "muted"; mark?: boolean }[] = [
    {
      label: "Exploited in the wild",
      mark: vuln.kev,
      value: vuln.kev ? "Yes" : kevKnown ? "Not confirmed" : "Unknown",
      note: vuln.kev ? `Per CISA${vuln.kevAdded ? `, listed ${kevDate(vuln.kevAdded)}` : ""}` : kevKnown ? "By CISA" : "CISA did not answer just now",
      tone: vuln.kev ? "hot" : kevKnown ? "ink" : "muted",
    },
    hero === "epss"
      ? {
          label: "Severity",
          value: vuln.cvss ? (
            <>
              {vuln.cvss.toFixed(1)} <span className="text-[13px] font-normal text-ink-3">of 10</span>
            </>
          ) : (
            "Not scored yet"
          ),
          note: severity ? `${severity}, CVSS` : "CVSS",
          tone: vuln.cvss ? "ink" : "muted",
        }
      : { label: "Chance of exploitation", value: "Not scored yet", note: "EPSS, next 30 days", tone: "muted" },
    {
      label: "Used in ransomware",
      value: vuln.ransomware ? "Yes" : "Not known",
      note: vuln.ransomware ? "Per CISA" : undefined,
      tone: vuln.ransomware ? "hot" : "muted",
    },
    {
      label: "US federal deadline",
      value: vuln.kevDue ? kevDate(vuln.kevDue) : "None set",
      note: vuln.kevDue ? "Agencies must fix it by then" : undefined,
      tone: vuln.kevDue ? "ink" : "muted",
    },
  ];

  return (
    <PageShell>
      <JsonLd data={jsonLd} />
      <Breadcrumbs items={[{ label: "Live map", href: "/" }, { label: vuln.cve }]} />

      <div className="mt-6 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <header>
            <h1 className="min-w-0">
              {product ? (
                <>
                  <span className="block font-mono text-[14px] tracking-[0.01em] text-ink-3">{vuln.cve}</span>
                  <span className="mt-2 block font-semicondensed text-[clamp(30px,3.6vw,44px)] font-bold leading-[1.04] tracking-[-0.02em] text-ink text-balance">
                    {product}
                  </span>
                </>
              ) : (
                <span className="block break-all font-mono text-[clamp(30px,4.4vw,48px)] font-medium leading-none tracking-[-0.03em] text-ink">{vuln.cve}</span>
              )}
            </h1>
            {name ? <p className="mt-2.5 max-w-[52ch] text-[17px] leading-snug text-ink-3 text-pretty">{name}</p> : null}

            <p className="mt-5 flex max-w-[66ch] items-start gap-2.5 text-[15.5px] leading-snug text-ink-2 text-pretty">
              {tone === "exploited" ? <StatusMark status="confirmed" size={10} className="mt-[5px]" /> : null}
              {tone === "news" ? <StatusMark status="reported" size={10} className="mt-[5px]" /> : null}
              <span>
                {said.lead ? <span className={cn("font-medium", tone === "exploited" ? "text-confirmed" : "text-reported")}>{said.lead}</span> : null}{" "}
                {said.rest}
              </span>
            </p>
          </header>

          <Tile className="mt-6">
            {hero === "epss" && vuln.epss !== undefined ? (
              <>
                <TileHead aside={<Eyebrow>EPSS</Eyebrow>}>
                  <Eyebrow>Chance of exploitation in 30 days</Eyebrow>
                </TileHead>
                <div className="flex flex-col gap-4 px-4 pb-4 pt-2 sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:px-5">
                  <p className="flex items-baseline gap-2">
                    {vuln.epss >= 0.9995 ? <span className="text-[15px] text-ink-3">over</span> : null}
                    <span className="font-condensed text-[64px] font-bold leading-[0.86] tracking-[-0.035em] text-ink">
                      {vuln.epss >= 0.9995 ? "99.9%" : epssText(vuln.epss)}
                    </span>
                  </p>
                  <div className="w-full sm:w-[260px]">
                    <TickMeter value={vuln.epss} label={`${epssText(vuln.epss)} chance of exploitation in the next 30 days`} />
                    <div className="mt-1.5 flex justify-between font-mono text-[10px] text-ink-4">
                      <span>0%</span>
                      <span>{percentileText(vuln.epssPercentile) ?? "100%"}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
            {hero === "cvss" && vuln.cvss ? (
              <>
                <TileHead aside={<Eyebrow>CVSS</Eyebrow>}>
                  <Eyebrow>Severity</Eyebrow>
                </TileHead>
                <div className="flex flex-col gap-4 px-4 pb-4 pt-2 sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:px-5">
                  <p className="flex items-baseline gap-2">
                    <span className="font-condensed text-[64px] font-bold leading-[0.86] tracking-[-0.035em] text-ink">{vuln.cvss.toFixed(1)}</span>
                    <span className="text-[15px] text-ink-3">of 10{severity ? `, ${severity.toLowerCase()}` : ""}</span>
                  </p>
                  <div className="w-full sm:w-[260px]">
                    <TickMeter value={vuln.cvss / 10} ticks={20} label={`Severity ${vuln.cvss.toFixed(1)} of 10`} />
                    <div className="mt-1.5 flex justify-between font-mono text-[10px] text-ink-4">
                      <span>0</span>
                      <span>10</span>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
            <dl className={cn(statGrid(4), hero && "border-t border-white/[0.06]")}>
              {stats.map((stat, index) => (
                <Stat
                  key={stat.label}
                  label={
                    <>
                      {stat.mark ? <StatusMark status="confirmed" size={7} /> : null}
                      {stat.label}
                    </>
                  }
                  value={stat.value}
                  note={stat.note}
                  tone={stat.tone}
                  className={statCell(index, stats.length, 4)}
                />
              ))}
            </dl>
          </Tile>

          <Tile as="section" aria-labelledby="fix-title" className="mt-3">
            {onMap ? affected : null}
            <div className="px-4 pb-4 pt-3.5 sm:px-5">
              <Eyebrow as="h2" id="fix-title">
                Fix it in one click
              </Eyebrow>
              <div className="mt-3">
                <FixButtons cve={vuln.cve} />
              </div>
            </div>
          </Tile>
        </div>

        <aside className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-label="Act on it">
          <div className="space-y-3 lg:sticky lg:top-6">
            <Tile>
              <div className="p-4">
                <Eyebrow as="h2">Am I affected?</Eyebrow>
                <p className="mt-2 text-[13.5px] leading-snug text-ink-2 text-pretty">
                  Add what you use and see every exploited flaw and breach that touches it{product ? `, starting with ${product}` : ""}.
                </p>
                <div className="mt-4 grid gap-2">
                  <Link href={product ? `/check?add=${encodeURIComponent(product)}` : "/check"} className={`${PRIMARY} w-full`}>
                    Check what you use <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
              <div className="border-t border-white/[0.06] p-2">
                <Link href={onMap ? `/?cve=${vuln.cve}` : "/"} className={cn(ROW, "text-[13px] text-ink-2 hover:text-ink")}>
                  <GlobeHemisphereWest className="size-3.5 text-ink-3" />
                  <span className="flex-1">{onMap ? "See it on the live map" : "Open the live map"}</span>
                  <ArrowUpRight className="size-3.5 text-ink-4" />
                </Link>
                <a href={`/fix/${vuln.cve}`} className={cn(ROW, "text-[13px] text-ink-2 hover:text-ink")}>
                  <BookOpenText className="size-3.5 text-ink-3" />
                  <span className="flex-1">Plain-text runbook for agents</span>
                  <ArrowUpRight className="size-3.5 text-ink-4" />
                </a>
              </div>
            </Tile>

            <Tile className="px-2 pb-2">
              <Eyebrow as="h2" className="block px-2 pb-1.5 pt-3.5">
                Official records
              </Eyebrow>
              <ul>
                {records.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} target="_blank" rel="noreferrer" className={cn(ROW, "group text-[13px] text-ink-2 hover:text-ink")}>
                      <span className="flex-1">{link.label}</span>
                      <span className="font-mono text-[10.5px] text-ink-4">{link.host}</span>
                      <ArrowUpRight className="size-3.5 text-ink-4 transition-colors group-hover:text-ink-2" />
                    </a>
                  </li>
                ))}
              </ul>
            </Tile>

            <Tile className="p-4">
              <Eyebrow as="h2">Share</Eyebrow>
              <ShareRow
                grid
                className="mt-3"
                url={url}
                title={title}
                text={`${vuln.cve}${product ? ` (${product})` : ""}${vuln.kev ? " is being exploited in the wild." : "."} Check if you're affected:`}
              />
            </Tile>
          </div>
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          {description || vuln.published || cwe ? (
            <PageSection title="About this flaw" id="about" className="pt-2">
              {description ? <p className="max-w-[68ch] text-[15.5px] leading-relaxed text-ink-2 text-pretty">{description}</p> : null}
              {vuln.published || cwe ? (
                <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
                  {vuln.published ? (
                    <div>
                      <Eyebrow as="dt">Published</Eyebrow>
                      <dd className="mt-1 text-[13.5px] text-ink">{longDate(vuln.published)}</dd>
                    </div>
                  ) : null}
                  {cwe ? (
                    <div>
                      <Eyebrow as="dt">Weakness</Eyebrow>
                      <dd className="mt-1">
                        <a
                          href={`https://cwe.mitre.org/data/definitions/${cwe}.html`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[13px] text-ink underline decoration-white/20 underline-offset-[3px] hover:decoration-white/60"
                        >
                          {vuln.cwe}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </PageSection>
          ) : null}

          <PageSection title="What should I do about this?" id="brief">
            <div className="max-w-[640px] pt-1">
              <AiBrief kind="cve" id={vuln.cve} label="Ask for a plain-English answer" />
              <div className="mt-3">
                <DeepResearch
                  kind="cve"
                  id={vuln.cve}
                  subject={vuln.cve}
                  title="Get a full remediation report"
                  blurb="Affected and fixed versions per product line, how attackers use it, how to tell if you were hit, and what to do today. Cited, with a PDF, in about five minutes."
                />
              </div>
            </div>
          </PageSection>

          {mentions.length ? (
            <PageSection title={`Incidents that mention ${vuln.cve}`} id="incidents" aside={mentions.length}>
              <IncidentList incidents={mentions.slice(0, 12)} />
            </PageSection>
          ) : null}

          {vuln.references.length ? (
            <PageSection title="Advisories and references" id="references" aside={vuln.references.length}>
              <ul>
                {vuln.references.map((ref) => (
                  <li key={ref}>
                    <a href={ref} target="_blank" rel="noreferrer nofollow" className={cn(ROW, "group -mx-3 items-start py-2.5")}>
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-[10.5px] text-ink-4">{hostOf(ref)}</span>
                        <span className="mt-1 block break-all text-[13.5px] leading-snug text-ink-2 group-hover:text-ink">
                          {ref.replace(/^https?:\/\/(www\.)?/, "")}
                        </span>
                      </span>
                      <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-ink-4 transition-colors group-hover:text-ink-2" />
                    </a>
                  </li>
                ))}
              </ul>
            </PageSection>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
