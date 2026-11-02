import type { IncidentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const COLOR: Record<IncidentStatus, string> = {
  confirmed: "var(--color-confirmed)",
  reported: "var(--color-reported)",
  claimed: "var(--color-claimed)",
  precautionary: "var(--color-reported)",
  disputed: "var(--color-ink-3)",
};

/**
 * Status carried by shape as well as colour: solid = confirmed, half = reported,
 * hollow = claimed by attackers only, dashed = precautionary, struck = disputed.
 */
export function StatusMark({ status, size = 10, className }: { status: IncidentStatus; size?: number; className?: string }) {
  const color = COLOR[status];
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" className={cn("shrink-0", className)} aria-hidden>
      {status === "confirmed" ? <circle cx="5" cy="5" r="4.25" fill={color} /> : null}
      {status === "reported" ? (
        <>
          <circle cx="5" cy="5" r="3.75" fill="none" stroke={color} strokeWidth="1.5" />
          <path d="M5 1.25a3.75 3.75 0 0 0 0 7.5z" fill={color} />
        </>
      ) : null}
      {status === "claimed" ? <circle cx="5" cy="5" r="3.75" fill="none" stroke={color} strokeWidth="1.5" /> : null}
      {status === "precautionary" ? <circle cx="5" cy="5" r="3.75" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="2 1.6" /> : null}
      {status === "disputed" ? (
        <>
          <circle cx="5" cy="5" r="3.75" fill="none" stroke={color} strokeWidth="1.5" />
          <path d="M2.4 7.6l5.2-5.2" stroke={color} strokeWidth="1.5" />
        </>
      ) : null}
    </svg>
  );
}

export function statusColor(status: IncidentStatus): string {
  return COLOR[status];
}
