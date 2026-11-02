import Link from "next/link";

import { TopBar } from "@/components/hud/top-bar";
import { ValyuMark } from "@/components/icons/agents";
import { EYEBROW } from "@/components/pages/styles";
import { REPO_URL, VALYU_URL } from "@/lib/site";

const FOOTER_LINKS = [
  { href: "/", label: "Live map" },
  { href: "/brief", label: "Daily brief" },
  { href: "/check", label: "Am I affected?" },
  { href: "/cve", label: "New CVEs" },
  { href: "/agents", label: "For agents" },
  { href: "/feed.xml", label: "RSS" },
];

const LINK = "text-ink-3 underline decoration-white/20 underline-offset-[3px] transition-colors hover:text-ink hover:decoration-white/50";

/**
 * Every indexable page: the site bar, a centred column, and a quiet footer that names the sources.
 * Client-safe, for the error boundary; server pages use PageShell, which adds the new-CVE banner.
 */
export function PageFrame({ children, bar = <TopBar /> }: { children: React.ReactNode; bar?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-space">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-space focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Skip to content
      </a>
      <div className="mx-auto w-full max-w-[1200px]">{bar}</div>
      <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-5 pb-24 sm:px-7">
        {children}
      </main>
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto grid w-full max-w-[1200px] gap-6 px-5 py-8 sm:px-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="max-w-[60ch]">
            <p className={EYEBROW}>Data</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-4">
              CISA KEV, NVD, FIRST EPSS, the GitHub Advisory Database, RansomLook leak-site claims, SEC 8-K filings, IODA and the news, read by{" "}
              <a
                href={`${VALYU_URL}/?utm_source=globalhackmap&utm_medium=app&utm_campaign=footer`}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-baseline gap-1 ${LINK}`}
              >
                <ValyuMark className="size-[9px] self-center" /> Valyu
              </a>{" "}
              search. Every item links to its source.{" "}
              <a href={REPO_URL} target="_blank" rel="noreferrer" className={LINK}>
                Open source
              </a>
              .
            </p>
          </div>
          <nav aria-label="Site" className="-mx-2.5 flex flex-wrap gap-0.5">
            {FOOTER_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="press flex h-7 items-center rounded-full px-2.5 text-[12.5px] text-ink-3 hover:bg-white/[0.05] hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
