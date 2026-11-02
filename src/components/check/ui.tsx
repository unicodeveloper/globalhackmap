"use client";

import NumberFlow from "@number-flow/react";
import { Check } from "@phosphor-icons/react";

import { DIVIDER, EYEBROW, TILE } from "@/components/check/styles";
import { StatusMark } from "@/components/kit/status-mark";
import { cn } from "@/lib/utils";

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn(EYEBROW, className)}>{children}</span>;
}

export type Tone = "confirmed" | "reported" | "claimed" | "precautionary" | "safe";

const BADGE: Record<Tone, string> = {
  confirmed: "bg-confirmed/[0.1] shadow-[inset_0_0_0_1px_rgb(255_74_61/0.22)]",
  reported: "bg-reported/[0.1] shadow-[inset_0_0_0_1px_rgb(255_181_71/0.22)]",
  claimed: "bg-white/[0.05] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)]",
  precautionary: "bg-reported/[0.07] shadow-[inset_0_0_0_1px_rgb(255_181_71/0.18)]",
  safe: "bg-safe/[0.1] shadow-[inset_0_0_0_1px_rgb(110_231_168/0.22)]",
};

/** The verdict's mark: status by shape and colour, on a tinted square. */
function VerdictBadge({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[11px] sm:size-10 sm:rounded-[12px]", BADGE[tone], className)} aria-hidden>
      {tone === "safe" ? <Check className="size-[18px] text-safe" weight="bold" /> : <StatusMark status={tone} size={13} />}
    </span>
  );
}

/** The verdict tile: what we found, in one sentence, then whatever breaks it down. */
export function VerdictTile({
  tone,
  label = "Verdict",
  meta,
  headline,
  sub,
  as: Heading = "h2",
  children,
}: {
  tone: Tone;
  label?: string;
  meta?: React.ReactNode;
  headline: React.ReactNode;
  sub?: React.ReactNode;
  as?: "h1" | "h2";
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(TILE, "overflow-hidden")}>
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 sm:px-5">
        <Eyebrow>{label}</Eyebrow>
        {meta ? <Eyebrow className="truncate">{meta}</Eyebrow> : null}
      </div>
      <div className="flex items-start gap-3.5 px-4 pb-5 pt-3 sm:gap-4 sm:px-5">
        <VerdictBadge tone={tone} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <Heading className="text-balance font-semicondensed text-[clamp(23px,3.3vw,31px)] font-bold leading-[1.1] tracking-[-0.02em] text-ink">
            {headline}
          </Heading>
          {sub ? <p className="mt-2 max-w-[60ch] text-pretty text-[14px] leading-relaxed text-ink-2 sm:text-[14.5px]">{sub}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export interface Stat {
  label: string;
  value: number;
  mark?: React.ReactNode;
}

/** The verdict's breakdown, drawn like the Pulse tile's status split: a label with its mark over a rolling count. */
export function StatStrip({ stats, label }: { stats: Stat[]; label: string }) {
  return (
    <div className={cn("overflow-hidden border-t", DIVIDER)}>
      <dl aria-label={label} className="-ml-px -mt-px flex w-[calc(100%+1px)] flex-wrap">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={cn(
              "flex min-w-0 grow flex-col justify-between border-l border-t px-3.5 py-3 sm:basis-0 sm:px-5",
              stats.length > 3 ? "basis-[40%]" : "basis-0",
              DIVIDER,
            )}
          >
            <dt className="flex items-start gap-1.5 text-[11.5px] leading-snug text-ink-3 [&>span]:mt-[4.5px] [&>svg]:mt-[4px]">
              {stat.mark}
              {stat.label}
            </dt>
            <dd className={cn("mt-1.5 text-[19px] font-semibold leading-none tracking-[-0.01em] tabular", stat.value ? "text-ink" : "text-ink-4")}>
              <NumberFlow value={stat.value} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
