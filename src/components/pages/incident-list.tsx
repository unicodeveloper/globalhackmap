import Link from "next/link";

import { OrgLogo } from "@/components/kit/org-logo";
import { StatusMark } from "@/components/kit/status-mark";
import { EYEBROW, ROW } from "@/components/pages/styles";
import { STATUS_LABEL, shortDate } from "@/lib/format";
import type { Incident } from "@/lib/types";
import { cn } from "@/lib/utils";

/** "Boston Scientific cyberattack disrupts manufacturing" reads "Cyberattack disrupts manufacturing" under the name. */
function whatHappened(incident: Incident): string {
  const title = incident.title.trim();
  const name = incident.victim.trim();
  if (title.toLowerCase().startsWith(name.toLowerCase())) {
    const rest = title
      .slice(name.length)
      .replace(/^['’]s\b/, "")
      .replace(/^[\s:,.-]+/, "");
    if (rest.length > 8) return rest[0].toUpperCase() + rest.slice(1);
  }
  return title;
}

/** Absolute day labels: these pages are cached, so "Today" could go stale. */
function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}

function Row({ incident, place, showDate }: { incident: Incident; place: "country" | "city"; showDate: boolean }) {
  const where = place === "country" ? incident.country : incident.city;
  return (
    <li className="[contain-intrinsic-size:auto_56px] [content-visibility:auto]">
      <Link href={`/incident/${incident.id}`} className={cn(ROW, "group -mx-3")}>
        <OrgLogo name={incident.victim} domain={incident.domain} size={32} className="rounded-[9px]" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium tracking-[-0.005em] text-ink">{incident.victim}</span>
            {showDate ? <span className="shrink-0 font-mono text-[10.5px] tabular text-ink-4">{shortDate(incident.date)}</span> : null}
          </span>
          <span className="mt-[3px] flex items-center gap-1.5">
            <StatusMark status={incident.status} size={7} />
            <span className="sr-only">{STATUS_LABEL[incident.status]}:</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3 transition-colors group-hover:text-ink-2">{whatHappened(incident)}</span>
            {where ? (
              <span className={cn("max-w-[14ch] shrink-0 truncate text-ink-4", place === "country" ? "font-mono text-[10.5px]" : "text-[11.5px]")}>
                {where}
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Incidents as quiet rows; `group` splits them under sticky day headers, newest first. */
export function IncidentList({ incidents, place = "country", group = false }: { incidents: Incident[]; place?: "country" | "city"; group?: boolean }) {
  if (!group) {
    return (
      <ul>
        {incidents.map((incident) => (
          <Row key={incident.id} incident={incident} place={place} showDate />
        ))}
      </ul>
    );
  }
  const groups: { label: string; items: Incident[] }[] = [];
  for (const incident of incidents) {
    const label = dayLabel(incident.date);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(incident);
    else groups.push({ label, items: [incident] });
  }
  return (
    <div>
      {groups.map((day) => (
        <section key={day.label} aria-label={day.label}>
          <h3 className="sticky top-0 z-[1] -mx-3 flex items-baseline justify-between bg-space px-3 pb-1.5 pt-3">
            <span className={cn(EYEBROW, "text-ink-3")}>{day.label}</span>
            <span className={EYEBROW}>{day.items.length}</span>
          </h3>
          <ul>
            {day.items.map((incident) => (
              <Row key={incident.id} incident={incident} place={place} showDate={false} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
