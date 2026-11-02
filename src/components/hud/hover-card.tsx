"use client";

import { OrgLogo } from "@/components/kit/org-logo";
import { StatusMark } from "@/components/kit/status-mark";
import { countryName } from "@/lib/countries";
import { STATUS_LABEL, placeLabel, relativeTime } from "@/lib/format";
import type { Incident } from "@/lib/types";

export function HoverCard({ incident, x, y }: { incident: Incident; x: number; y: number }) {
  const flip = typeof window !== "undefined" && x > window.innerWidth - 340;
  return (
    <div
      className="pointer-events-none absolute z-40 w-[290px] rounded-[16px] bg-surface p-3.5 ring-1 ring-hairline-2 shadow-xl animate-in fade-in zoom-in-95 duration-150"
      style={{ left: flip ? x - 306 : x + 18, top: Math.max(72, y - 28) }}
    >
      <div className="flex items-center gap-2.5">
        <OrgLogo name={incident.victim} domain={incident.domain} size={32} className="rounded-[9px]" />
        <div className="min-w-0">
          <p className="truncate font-semicondensed text-[15px] font-semibold text-ink">{incident.victim}</p>
          <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
            <StatusMark status={incident.status} size={8} />
            {STATUS_LABEL[incident.status]} · {relativeTime(incident.date)}
          </p>
        </div>
      </div>
      <p className="mt-2.5 line-clamp-2 text-[13px] leading-snug text-ink-2">{incident.title}</p>
      <p className="mt-2.5 flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-[12px] text-ink-4">
        <span className="truncate">{placeLabel(incident, countryName)}</span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em]">Click for details</span>
      </p>
    </div>
  );
}
