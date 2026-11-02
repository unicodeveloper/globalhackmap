import { ArrowRight, LinkSimple } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { type SharedResult, sharedDetail, sharedHeadline, sharedLevel, sharedQuery, readShared } from "@/app/check/share/verdict";
import { BUTTON_PRIMARY, EYEBROW, LINK } from "@/components/check/styles";
import { type Stat, StatStrip, type Tone, VerdictTile } from "@/components/check/ui";
import { SiteBar } from "@/components/hud/latest-cves";
import { StatusMark } from "@/components/kit/status-mark";
import { longDate } from "@/lib/og/copy";
import { cn } from "@/lib/utils";

const FALLBACK = "Check your packages and products against the vulnerabilities attackers are exploiting right now.";

export async function generateMetadata({ searchParams }: PageProps<"/check/share">): Promise<Metadata> {
  const result = readShared(await searchParams);
  const title = result ? sharedHeadline(result) : "Are you affected?";
  const image = result ? `/check/og?${sharedQuery(result)}` : "/check/og";
  const description = result ? `${sharedDetail(result)} Check yours on Global Hack Map.` : FALLBACK;
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

/** "I checked 7 packages: 1 actively exploited vulnerability found." with the finding in its status colour. */
function Headline({ result, tone }: { result: SharedResult; tone: Tone }) {
  const text = sharedHeadline(result);
  const cut = text.indexOf(": ");
  if (cut < 0) return text;
  const color = tone === "safe" ? "text-safe" : tone === "reported" ? "text-reported" : "text-confirmed";
  return (
    <>
      {text.slice(0, cut + 1)} <span className={color}>{text.slice(cut + 2)}</span>
    </>
  );
}

function stats(result: SharedResult): Stat[] {
  const mark = <span className="size-[7px] shrink-0 rounded-full bg-ink-4" aria-hidden />;
  if (result.products) {
    return [
      { label: "Products checked", value: result.checked, mark },
      { label: "With exploited CVEs", value: result.exploited, mark: <StatusMark status="confirmed" size={8} /> },
    ];
  }
  // The same tiers, labels and marks as the results page, so the share shows what the check showed.
  return [
    { label: "Packages checked", value: result.checked, mark },
    ...(result.malicious ? [{ label: "Malicious", value: result.malicious, mark: <StatusMark status="confirmed" size={8} /> }] : []),
    { label: "Exploited", value: result.exploited, mark: <StatusMark status="confirmed" size={8} /> },
    { label: "Likely soon", value: result.likely, mark: <StatusMark status="reported" size={8} /> },
    { label: "Critical", value: result.critical, mark: <StatusMark status="reported" size={8} /> },
  ];
}

/** A shared result lives entirely in its query string, so the result streams in at request time. */
export default function SharedResultPage({ searchParams }: PageProps<"/check/share">) {
  return (
    <div className="min-h-dvh bg-space">
      <div className="relative z-10">
        <SiteBar />
      </div>
      <Suspense fallback={<main aria-busy className="mx-auto min-h-[60vh] w-full max-w-[760px] px-5 pt-8 sm:px-7 sm:pt-16" />}>
        <SharedResultFromUrl searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SharedResultFromUrl({ searchParams }: Pick<PageProps<"/check/share">, "searchParams">) {
  const result = readShared(await searchParams);
  const tone: Tone = result ? sharedLevel(result) : "safe";

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col px-5 pb-28 pt-8 sm:px-7 sm:pt-16">
      {result ? (
        <>
          <p className={cn(EYEBROW, "flex items-center gap-2 text-ink-3")}>
            <LinkSimple className="size-3.5" aria-hidden />
            Shared check
          </p>
          <p className="mt-2 text-[14px] text-ink-3">A shared Global Hack Map check. It shares counts only, never package names.</p>
          <div className="mt-6">
            <VerdictTile
              as="h1"
              tone={tone}
              meta={result.date ? longDate(`${result.date}T00:00:00Z`) : undefined}
              headline={<Headline result={result} tone={tone} />}
              sub={sharedDetail(result)}
            >
              <StatStrip label="Shared counts" stats={stats(result)} />
            </VerdictTile>
          </div>
        </>
      ) : (
        <>
          <p className={cn(EYEBROW, "flex items-center gap-2 text-ink-3")}>
            <span className="size-1.5 rounded-full bg-safe" aria-hidden />
            Live check
          </p>
          <h1 className="mt-4 font-semicondensed text-[clamp(42px,6.6vw,66px)] font-bold leading-[0.95] tracking-[-0.03em] text-ink">Are you affected?</h1>
          <p className="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-ink-3 sm:text-[16.5px]">{FALLBACK}</p>
        </>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <Link href="/check" className={cn(BUTTON_PRIMARY, "h-11 px-5 text-[14.5px]")}>
          Check what you use <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <p className="mt-14 max-w-[62ch] px-1 text-[13px] leading-relaxed text-ink-4">
        Global Hack Map tracks new vulnerabilities, active exploits and breaches as they happen, with sources. Add the apps and products you use and see what
        affects them in seconds. Nothing to upload.{" "}
        <Link href="/" className={cn(LINK, "text-ink-3")}>
          See the live map
        </Link>
        .
      </p>
    </main>
  );
}
