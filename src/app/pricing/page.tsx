import { ArrowUpRight, Check } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteBar } from "@/components/hud/latest-cves";
import { GithubIcon } from "@/components/icons/agents";
import { AsciiImage } from "@/components/kit/ascii-image";
import { SignInCta } from "@/components/pricing/sign-in-cta";
import { ACCOUNTS } from "@/lib/mode";
import { REPO_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing: free and open source, AI on your own Valyu credits",
  description:
    "Global Hack Map is free and open source. The map, incident pages, stack checks and fix prompts cost nothing. AI briefs and research run on your own Valyu credits, with free credits to start.",
  alternates: { canonical: "/pricing" },
};

const FREE = [
  "The live map of breaches, ransomware claims, outages and attacks",
  "Every incident, CVE and country page, with sources",
  "Three map dossiers a day, and the top result of your Am I affected? check",
  "One-click fix prompts for Claude Code, Codex and Cursor",
  "The daily brief, the RSS feed and the MCP server for your agents",
];

const CREDITS = [
  "Every map dossier and your full Am I affected? check, free with an account",
  "AI briefs and questions, cited from live sources",
  "DeepResearch reports on an incident, a CVE or everything you use, with a PDF",
  "A daily watch on your stack with the open-source cve-monitor, delivered to GitHub, Slack or email",
  "Valyu's search and research APIs for your own tools and agents",
];

/** `scale` draws the bar: credits as a share of one standard report. A daily watch is drawn as a month of reports. */
const COSTS: { action: string; about: boolean; credits: string; per?: string; note: string; scale: number | "month" }[] = [
  { action: "Ask a question or get an incident brief", about: true, credits: "4", note: "Measured on a typical cited answer", scale: 0.04 },
  { action: "Fast research report", about: false, credits: "25", note: "About five minutes, sources and a CSV", scale: 0.25 },
  { action: "Standard research report", about: false, credits: "100", note: "Ten to twenty minutes, deeper sourcing, PDF", scale: 1 },
  { action: "Daily watch on one stack", about: true, credits: "3,000", per: "a month", note: "One standard report every morning", scale: "month" },
];

const PLANS: { name: string; price: string; per: string; credits: string; buys: string }[] = [
  {
    name: "Pay as you go",
    price: "$10",
    per: "top-up",
    credits: "1,600 credits",
    buys: "About 400 AI answers, or 16 standard reports. Top-ups last 12 months.",
  },
  { name: "Ridiculously Cheap", price: "$29", per: "a month", credits: "5,000 credits", buys: "A daily watch on your stack plus about 500 AI answers." },
  {
    name: "Comfortably Pro",
    price: "$99",
    per: "a month",
    credits: "18,000 credits",
    buys: "Daily watches on five systems or teams plus about 750 AI answers.",
  },
  {
    name: "Serious Business",
    price: "$499",
    per: "a month",
    credits: "100,000 credits",
    buys: "Watch a whole estate every day, and research with Valyu's cybersecurity datasets: CISA KEV, NVD, EPSS and MITRE ATT&CK.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Why does it use Valyu?",
    a: "Global Hack Map is built on Valyu's search and research APIs: they read the world's news, filings and advisories to put each incident on the map. Signing in with Valyu lets the AI features run on your own account instead of a shared key, so there is no paywall in Global Hack Map itself.",
  },
  {
    q: "Is my code or my list of vendors stored?",
    a: "No. Stack checks are processed in memory and never logged or stored. AI questions you ask are sent to Valyu to answer them.",
  },
  {
    q: "Can I run my own copy?",
    a: "Yes. Global Hack Map is open source. Clone the repository, add a Valyu API key and a Mapbox token, and deploy it anywhere that runs Next.js.",
  },
  {
    q: "Is this one of those fake attack maps?",
    a: "No. Every point is a named, sourced incident with an honest status: confirmed by the organisation or a regulator, reported by the press, or only claimed by attackers. Nothing is simulated.",
  },
];

const TILE = "rounded-[18px] bg-white/[0.028] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06),inset_0_1px_0_rgb(255_255_255/0.05)]";
const SECONDARY =
  "press inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-[14px] text-ink-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)] hover:bg-white/[0.04] hover:text-ink";

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-4", className)}>{children}</p>;
}

function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-[640px]">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-2.5 font-semicondensed text-[28px] font-semibold leading-[1.1] tracking-[-0.015em] text-ink sm:text-[34px]">{title}</h2>
      {children ? <p className="mt-3 text-[15px] leading-relaxed text-ink-3">{children}</p> : null}
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-[14.5px] leading-snug text-ink-2">
      <Check className="mt-[3px] size-3.5 shrink-0 text-ink-3" weight="bold" aria-hidden />
      {children}
    </li>
  );
}

function CostBar({ scale }: { scale: number | "month" }) {
  if (scale === "month") {
    return (
      <span className="flex h-1.5 w-full gap-[2px]" role="img" aria-label="One standard report a day for a month">
        {Array.from({ length: 30 }, (_, index) => (
          <span key={index} className="flex-1 rounded-[1px] bg-white/45" />
        ))}
      </span>
    );
  }
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
      <span className="block h-full rounded-full bg-white/45" style={{ width: `${Math.max(scale * 100, 2)}%` }} />
    </span>
  );
}

export default function PricingPage() {
  // Self-hosted deployments have no accounts or plans.
  if (!ACCOUNTS) notFound();
  return (
    <main className="relative min-h-dvh bg-space text-ink">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] overflow-hidden" aria-hidden>
        <AsciiImage
          src="/art/atlas.webp"
          crop={{ x: 0.0, y: 0.0, w: 1, h: 0.56 }}
          cell={7}
          fade={0.55}
          className="absolute right-[-4%] top-0 h-[640px] w-[min(760px,70vw)] opacity-35 sm:opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-space via-space/85 to-space/10" />
      </div>
      <div className="relative z-10">
        <SiteBar />
      </div>

      <div className="relative z-10 mx-auto max-w-[1120px] px-5 pb-24 sm:px-8">
        <section className="max-w-[660px] pb-20 pt-10 sm:pb-28 sm:pt-20">
          <Eyebrow>Pricing</Eyebrow>
          <h1 className="mt-4 font-semicondensed text-[clamp(42px,6vw,72px)] font-bold leading-[0.94] tracking-[-0.03em]">
            Free to use.
            <br />
            <span className="text-ink-3">Your credits when you want more.</span>
          </h1>
          <p className="mt-6 max-w-[54ch] text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">
            Global Hack Map is open source. The map, the incident and CVE pages and the fix prompts cost nothing. A free Valyu account opens everything else,
            and when you want AI to do the reading for you, it runs on your own Valyu credits. New accounts start with free credits.
          </p>
          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <SignInCta className="justify-center" />
            <a href={REPO_URL} target="_blank" rel="noreferrer" className={SECONDARY}>
              <GithubIcon className="size-4" /> Run your own copy
            </a>
          </div>
        </section>

        <section aria-label="What is free and what uses credits" className="grid gap-3 md:grid-cols-2">
          <div className={cn(TILE, "p-6 sm:p-7")}>
            <Eyebrow>No account</Eyebrow>
            <h2 className="mt-2 font-semicondensed text-[30px] font-bold leading-none tracking-[-0.02em]">Free</h2>
            <p className="mt-2 text-[14px] text-ink-3">Open source, nothing to sign up for.</p>
            <ul className="mt-6 space-y-3.5 border-t border-white/[0.06] pt-6">
              {FREE.map((item) => (
                <Feature key={item}>{item}</Feature>
              ))}
            </ul>
          </div>
          <div className={cn(TILE, "p-6 sm:p-7")}>
            <Eyebrow>Signed in with Valyu</Eyebrow>
            <h2 className="mt-2 font-semicondensed text-[30px] font-bold leading-none tracking-[-0.02em]">Free account, your credits</h2>
            <p className="mt-2 text-[14px] text-ink-3">Signing in is free. AI work runs on your own Valyu credits.</p>
            <ul className="mt-6 space-y-3.5 border-t border-white/[0.06] pt-6">
              {CREDITS.map((item) => (
                <Feature key={item}>{item}</Feature>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-24 sm:mt-32">
          <SectionHead eyebrow="Credits" title="What each action costs">
            Valyu prices work in credits. 160 credits are one US dollar.
          </SectionHead>
          <div className={cn(TILE, "mt-8 overflow-hidden")}>
            <div className="hidden grid-cols-[minmax(0,1fr)_200px_190px] items-center gap-8 border-b border-white/[0.06] px-6 py-3 md:grid">
              <Eyebrow>Action</Eyebrow>
              <Eyebrow>Next to a standard report</Eyebrow>
              <Eyebrow className="text-right">Credits</Eyebrow>
            </div>
            <ul className="divide-y divide-white/[0.06]">
              {COSTS.map((row) => (
                <li
                  key={row.action}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_200px_190px] md:gap-x-8 md:py-5"
                >
                  <div className="min-w-0">
                    <p className="text-[15px] text-ink">{row.action}</p>
                    <p className="mt-0.5 text-[13px] text-ink-3">{row.note}</p>
                  </div>
                  <div className="hidden md:block">
                    <CostBar scale={row.scale} />
                  </div>
                  <p className="flex items-baseline justify-end gap-1.5 whitespace-nowrap">
                    {row.about ? <span className="text-[12.5px] text-ink-4">about</span> : null}
                    <span className="font-mono text-[18px] tabular tracking-[-0.02em] text-ink">{row.credits}</span>
                    {row.per ? <span className="text-[12.5px] text-ink-4">{row.per}</span> : null}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-24 sm:mt-32">
          <SectionHead eyebrow="Plans" title="Valyu plans, in Global Hack Map terms">
            Your plan lives on your Valyu account and works across Global Hack Map, Valyu&apos;s APIs and any other app you sign in to with Valyu.
          </SectionHead>
          <div className="glass-panel mt-8 rounded-[22px] p-1.5">
            <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
              {PLANS.map((plan) => (
                <li key={plan.name} className={cn(TILE, "flex flex-col p-5")}>
                  <h3 className="text-[14px] font-medium text-ink">{plan.name}</h3>
                  <p className="mt-6 flex items-baseline gap-2">
                    {/* Mona at a condensed width: the display face draws a slashed zero, which reads as "$1θ" in a price. */}
                    <span className="font-sans text-[52px] font-bold leading-[0.86] tracking-[-0.04em] text-ink [font-variation-settings:'wdth'_75]">
                      {plan.price}
                    </span>
                    <span className="text-[13px] text-ink-3">{plan.per}</span>
                  </p>
                  <p className="mt-3 font-mono text-[12px] tabular text-ink-2">{plan.credits}</p>
                  <p className="mt-5 border-t border-white/[0.06] pt-4 text-[13.5px] leading-relaxed text-ink-2">{plan.buys}</p>
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-4 px-3.5 pb-2.5 pt-4 sm:flex-row sm:items-center sm:justify-between sm:pb-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
                <a
                  href="https://www.valyu.ai/pricing?utm_source=globalhackmap&utm_medium=app&utm_campaign=pricing"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-ink-2 underline decoration-white/20 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
                >
                  Full Valyu pricing <ArrowUpRight className="size-3.5" />
                </a>
                <span className="text-ink-4">Plans and prices are set by Valyu and can change.</span>
              </div>
              <SignInCta className="self-start sm:self-auto" />
            </div>
          </div>
        </section>

        <section className="mt-24 sm:mt-32">
          <SectionHead eyebrow="FAQ" title="Questions" />
          <dl className="mt-8 grid gap-x-12 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q} className="border-t border-white/[0.06] py-6">
                <dt className="text-[15.5px] font-medium text-ink">{item.q}</dt>
                <dd className="mt-2 max-w-[56ch] text-[14.5px] leading-relaxed text-ink-3">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={cn(TILE, "mt-16 flex flex-col items-start justify-between gap-6 rounded-[22px] px-6 py-7 sm:flex-row sm:items-center sm:px-8")}>
          <div>
            <p className="font-semicondensed text-[24px] font-bold leading-tight tracking-[-0.015em]">Start with the map. It is free.</p>
            <p className="mt-1.5 text-[14.5px] text-ink-3">Check whether anything you use was hit this week.</p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/check"
              className="press inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-medium text-space hover:bg-white"
            >
              Am I affected? <ArrowUpRight className="size-4" />
            </Link>
            <Link href="/" className={SECONDARY}>
              Open the map
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
