"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { AuthButton } from "@/components/auth/auth-button";
import { BrandMark, GithubIcon, ValyuMark } from "@/components/icons/agents";
import { ACCOUNTS } from "@/lib/mode";
import { REPO_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

/** `show` is the smallest screen an item appears on; "Am I affected?" is always there. */
const NAV = [
  { href: "/", label: "Map", show: "hidden md:flex" },
  { href: "/check", label: "Am I affected?", show: "flex" },
  { href: "/brief", label: "Daily brief", show: "hidden md:flex" },
  { href: "/agents", label: "Agents", show: "hidden lg:flex" },
  ...(ACCOUNTS ? [{ href: "/pricing", label: "Pricing", show: "hidden lg:flex" }] : []),
];

function NavLinks({ pathname }: { pathname: string | null }) {
  return NAV.map((item) => {
    const active = pathname !== null && (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "press h-8 items-center whitespace-nowrap rounded-full px-3.5 text-[13px] transition-colors",
          item.show,
          active ? "bg-white/[0.09] text-ink" : "text-ink-2 hover:text-ink",
        )}
      >
        {item.label}
      </Link>
    );
  });
}

function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

/**
 * The site bar. `ticker` (the new-CVE banner) sits between the brand and the nav on wide screens and
 * wraps to its own row on phones; tablets skip it rather than squeeze the nav.
 */
export function TopBar({ ticker }: { ticker?: React.ReactNode }) {
  return (
    <header className="pointer-events-auto flex min-h-[68px] flex-wrap items-center gap-x-2 bg-space px-4 sm:gap-x-4 py-3.5 sm:px-5">
      <Link href="/" className="flex items-center gap-2.5 rounded-full py-1.5 pl-1 pr-2 sm:pr-3" aria-label="Global Hack Map home">
        <BrandMark className="size-[22px] text-ink" />
        {/* Stacked on phones so the nav keeps its row; one line from small tablets up. */}
        <span className="flex flex-col font-semicondensed font-bold leading-none tracking-[-0.01em] text-ink sm:flex-row sm:gap-[0.28em] sm:text-[19px]">
          <span className="font-mono text-[9.5px] font-normal uppercase tracking-[0.14em] text-ink-3 sm:font-semicondensed sm:text-[19px] sm:font-bold sm:normal-case sm:tracking-[-0.01em] sm:text-ink">
            Global
          </span>
          <span className="mt-[3px] text-[17px] sm:mt-0 sm:text-[19px]">Hack Map</span>
        </span>
      </Link>
      <a
        href="https://www.valyu.ai/?utm_source=globalhackmap&utm_medium=app&utm_campaign=topbar"
        target="_blank"
        rel="noreferrer"
        className={cn("-ml-2 hidden items-center gap-1.5 text-[12px] text-ink-4 transition-colors hover:text-ink-2", ticker ? "xl:flex" : "md:flex")}
      >
        built on <ValyuMark className="size-[10px]" /> Valyu
      </a>
      {ticker ? <div className="order-last mt-2.5 w-full min-w-0 md:hidden lg:order-none lg:mx-2 lg:mt-0 lg:block lg:w-auto lg:flex-1">{ticker}</div> : null}

      <nav className="glass-pill ml-auto flex items-center gap-0.5 rounded-full p-1">
        {/* The pathname is unknown while a dynamic route's shell prerenders; the links render without a highlight until it is. */}
        <Suspense fallback={<NavLinks pathname={null} />}>
          <ActiveNavLinks />
        </Suspense>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="hidden size-8 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-white/[0.07] hover:text-ink sm:flex"
          aria-label="Source code on GitHub"
        >
          <GithubIcon className="size-[16px]" />
        </a>
        {ACCOUNTS ? <AuthButton /> : null}
      </nav>
    </header>
  );
}
