import { cn } from "@/lib/utils";

const DAY = 86_400_000;

/** Incidents first reported per day, oldest left. The newest day is brightest, as on the live map. */
export function DayBars({ dates, until, days, height = 46, className }: { dates: string[]; until: string; days: number; height?: number; className?: string }) {
  const end = Date.parse(until);
  const bins = Array.from({ length: days }, (_, index) => ({ date: end - (days - 1 - index) * DAY, total: 0 }));
  for (const date of dates) {
    const age = Math.floor((end - Date.parse(date)) / DAY);
    if (age >= 0 && age < days) bins[days - 1 - age].total += 1;
  }
  const max = Math.max(1, ...bins.map((bin) => bin.total));
  return (
    <div
      className={cn("shrink-0", className)}
      role="img"
      aria-label={`Incidents first reported per day over the last ${days} days: ${bins.map((bin) => bin.total).join(", ")}`}
    >
      <div className={cn("flex items-end", days > 20 ? "gap-[3px]" : "gap-[4px]")} style={{ height }}>
        {bins.map((bin, index) => {
          const label = new Date(bin.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
          return (
            <span
              key={bin.date}
              title={`${label}: ${bin.total} ${bin.total === 1 ? "incident" : "incidents"}`}
              className={cn("flex-1 rounded-[2px]", index === days - 1 ? "bg-ink" : bin.total ? "bg-white/45" : "bg-white/[0.13]")}
              style={{ height: Math.max(2, (bin.total / max) * height) }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-ink-4">
        <span>{days}d ago</span>
        <span>today</span>
      </div>
    </div>
  );
}
