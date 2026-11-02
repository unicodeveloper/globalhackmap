import { EYEBROW, TILE } from "@/components/pages/styles";
import { cn } from "@/lib/utils";

/** Small mono caps label for every tile and section heading. */
export function Eyebrow({
  children,
  className,
  as: Tag = "span",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  as?: "span" | "h2" | "h3" | "p" | "dt";
  id?: string;
}) {
  return (
    <Tag id={id} className={cn(EYEBROW, className)}>
      {children}
    </Tag>
  );
}

export function Tile({
  children,
  className,
  as: Tag = "div",
  ...rest
}: { children: React.ReactNode; className?: string; as?: "div" | "section" | "figure" | "aside" } & React.AriaAttributes) {
  return (
    <Tag className={cn(TILE, "overflow-hidden", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** The eyebrow row at the top of a tile: label left, context right. */
export function TileHead({ children, aside, className }: { children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-4 pt-3.5 sm:px-5", className)}>
      {children}
      {aside}
    </div>
  );
}

/** A label and value cell inside a tile's stat strip. */
export function Stat({
  label,
  value,
  note,
  tone = "ink",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
  tone?: "ink" | "hot" | "muted";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 px-4 py-3 sm:px-5", className)}>
      <dt className="flex items-center gap-1.5 text-[11.5px] text-ink-3">{label}</dt>
      <dd className="mt-1">
        <span
          className={cn(
            "block text-pretty break-words text-[18px] font-semibold leading-tight tracking-[-0.01em] tabular",
            tone === "hot" ? "text-confirmed" : tone === "muted" ? "text-ink-3" : "text-ink",
          )}
        >
          {value}
        </span>
        {note ? <span className="mt-1 block text-[11.5px] leading-snug text-ink-4">{note}</span> : null}
      </dd>
    </div>
  );
}

/** Horizontal tick meter for a 0 to 1 value: data drawn as data, not a gauge. */
export function TickMeter({ value, ticks = 40, label, className }: { value: number; ticks?: number; label: string; className?: string }) {
  const lit = Math.max(value > 0 ? 1 : 0, Math.round(Math.min(1, value) * ticks));
  return (
    <div role="img" aria-label={label} className={cn("flex h-7 items-end gap-[3px]", className)}>
      {Array.from({ length: ticks }, (_, index) => (
        <span key={index} className={cn("h-full flex-1 rounded-[1.5px]", index < lit ? (index === lit - 1 ? "bg-ink" : "bg-white/45") : "bg-white/[0.1]")} />
      ))}
    </div>
  );
}

/** Ranked bars with counts, for "most hit" style breakdowns. */
export function RankBars({ items, label }: { items: { name: string; n: number }[]; label: string }) {
  const max = Math.max(1, ...items.map((item) => item.n));
  return (
    <ul aria-label={label} className="space-y-2">
      {items.map((item) => (
        <li key={item.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className="truncate text-[12.5px] text-ink-2">{item.name}</span>
          <span className="font-mono text-[10.5px] tabular text-ink-3">{item.n}</span>
          <span className="col-span-2 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
            <span className="block h-full rounded-full bg-white/45" style={{ width: `${(item.n / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

const SM_COLS = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" } as const;
const SM_SPAN = { 1: "sm:col-span-1", 2: "sm:col-span-2", 3: "sm:col-span-3" } as const;

/** Columns for a stat grid: 2 across on phones, `cols` across from sm up. */
export function statGrid(cols: 2 | 3 | 4): string {
  return cn("grid grid-cols-2", SM_COLS[cols]);
}

/** Inner dividers for a stat grid cell, plus a wider last cell so a short last row never leaves a hole. */
export function statCell(index: number, count: number, cols: 2 | 3 | 4): string {
  const last = index === count - 1;
  const rest = count % cols;
  return cn(
    "border-white/[0.06]",
    index % 2 === 1 && "border-l",
    index >= 2 && "border-t",
    index % cols === 0 ? "sm:border-l-0" : "sm:border-l",
    index >= cols ? "sm:border-t" : "sm:border-t-0",
    last && count % 2 === 1 && "col-span-2",
    last && SM_SPAN[(rest ? cols - rest + 1 : 1) as 1 | 2 | 3],
  );
}
