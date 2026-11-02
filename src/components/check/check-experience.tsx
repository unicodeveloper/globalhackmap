"use client";

import type { CheckIncident } from "@/components/check/match";
import { EYEBROW } from "@/components/check/styles";
import { type Suggestion, UseCheck } from "@/components/check/use-check";
import { cn } from "@/lib/utils";

interface Props {
  incidents: CheckIncident[];
  suggestions: Suggestion[];
  available: boolean;
  kevTotal: number | null;
  generatedAt: string;
  initialAdd?: string;
}

export function CheckExperience({ incidents, suggestions, available, kevTotal, generatedAt, initialAdd }: Props) {
  return (
    <main className="mx-auto w-full max-w-[760px] px-5 pb-28 pt-8 sm:px-7 sm:pt-16">
      <p className={cn(EYEBROW, "flex flex-wrap items-center gap-x-2.5 gap-y-1")}>
        <span className="flex items-center gap-2 text-ink-3">
          <span className="live-dot size-1.5 rounded-full bg-confirmed" aria-hidden />
          Live
        </span>
        {kevTotal ? <span className="tabular sm:before:mr-2.5 sm:before:content-['·']">{kevTotal.toLocaleString("en")} exploited CVEs</span> : null}
        {available ? <span className="tabular sm:before:mr-2.5 sm:before:content-['·']">{incidents.length} breaches in 30 days</span> : null}
      </p>
      <h1 className="mt-4 font-semicondensed text-[clamp(42px,6.6vw,66px)] font-bold leading-[0.95] tracking-[-0.03em] text-ink">Are you affected?</h1>
      <p className="mt-4 max-w-[54ch] text-pretty text-[15.5px] leading-relaxed text-ink-3 sm:text-[16.5px]">
        Add the apps, products and companies you use. Global Hack Map shows what attackers are exploiting in them, which have been breached, and what to do
        about it. Nothing to upload.
      </p>
      <div className="mt-8">
        <UseCheck incidents={incidents} suggestions={suggestions} generatedAt={generatedAt} initialAdd={initialAdd} />
      </div>
    </main>
  );
}
