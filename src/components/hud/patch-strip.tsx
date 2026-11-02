"use client";

import { CaretDown, CaretLeft, CaretRight, CaretUp, ListBullets } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef } from "react";

import { StackPicker } from "@/components/hud/stack-picker";
import { OrgLogo } from "@/components/kit/org-logo";
import { usePatchList } from "@/hooks/use-patch";
import type { PatchItem } from "@/lib/types";
import { productLabel } from "@/lib/og/copy";
import { cn } from "@/lib/utils";
import { useSituation } from "@/stores/situation";
import { stackMatch, useStack } from "@/stores/stack";

export const PATCH_DOCK_MIN_WIDTH = 440;

function daysAgo(date: string): number {
  return Math.floor((Date.now() - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
}

function summaryLine(total: number | undefined, mine: number, hasStack: boolean): string {
  if (total === undefined) return "Finding what attackers are using right now";
  if (!hasStack) return `${total} flaws attackers are using, and who they affect`;
  if (mine) return `${mine} of ${total} touch your stack`;
  return `None of these ${total} name your stack. Other flaws still might.`;
}

function Signal({ item }: { item: PatchItem }) {
  const age = item.kevAdded ? daysAgo(item.kevAdded) : null;
  const label = item.ransomware ? "Ransomware" : item.exploited ? "Exploited" : "In the news";
  return (
    <span className={cn("flex shrink-0 items-center gap-1.5 text-[11.5px]", item.exploited ? "text-confirmed" : "text-reported")}>
      <span className="size-[6px] rounded-full bg-current" />
      {label}
      {age !== null && age <= 7 ? <span className="text-ink-3">· {age === 0 ? "today" : `${age}d`}</span> : null}
    </span>
  );
}

function PatchCard({ item, index, width, mine }: { item: PatchItem; index: number; width: number; mine: boolean }) {
  const selectCve = useSituation((s) => s.selectCve);
  const product = productLabel(item);
  // CSS rather than motion/react: the same entrance without shipping Motion on the home page.
  return (
    <li
      className="shrink-0 snap-start motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2.5 motion-safe:fill-mode-both motion-safe:duration-[450ms] motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)]"
      style={{ width, animationDelay: `${Math.min(index, 6) * 50}ms` }}
    >
      <button
        type="button"
        onClick={() => selectCve(item.cves[0])}
        className={cn(
          "press flex h-full w-full flex-col rounded-[14px] p-3.5 text-left transition-colors duration-200",
          mine ? "bg-surface-3 ring-1 ring-inset ring-ink/40 hover:bg-white/15" : "bg-surface-2 hover:bg-surface-3",
        )}
        aria-label={`${product}: ${item.title}.${mine ? " In your stack." : ""} Open details and fixes.`}
      >
        <span className="flex w-full items-center gap-2.5">
          <OrgLogo name={item.vendor} domain={item.domain} size={22} className="rounded-[6px]" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-2">{product}</span>
          {mine ? (
            <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-semibold text-space">You run this</span>
          ) : (
            <Signal item={item} />
          )}
        </span>
        <span className="mt-2.5 line-clamp-2 text-[14px] font-medium leading-[1.3] tracking-[-0.005em] text-ink">{item.title}</span>
        <span className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-ink-3">{item.who}</span>
      </button>
    </li>
  );
}

/**
 * "Patch now": the software attackers are using right now, one card per product, each saying in plain
 * English what can happen and who it affects. A card opens the CVE dossier with the fixes. Docked along
 * the bottom of the map on desktop; a rail inside the sheet on mobile.
 */
export function PatchStrip({
  variant = "dock",
  insetLeft = 452,
  insetRight = 0,
  availableWidth = 1000,
  onShowSidebar,
  open = true,
  onOpenChange,
  inactive = false,
}: {
  variant?: "dock" | "rail";
  insetLeft?: number;
  insetRight?: number;
  availableWidth?: number;
  onShowSidebar?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  inactive?: boolean;
}) {
  const list = usePatchList();
  const section = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLUListElement>(null);
  const hideButton = useRef<HTMLButtonElement>(null);
  const showButton = useRef<HTMLButtonElement>(null);
  const focusAfterToggle = useRef(false);
  const setTab = useSituation((s) => s.setTab);
  const stack = useStack((s) => s.items);
  // What the visitor runs comes first; the rest keep their urgency order.
  const items = useMemo(() => {
    if (!list) return list;
    const marked = list.map((item) => ({ item, mine: Boolean(stackMatch(stack, item.vendor, item.product)) }));
    return [...marked.filter((entry) => entry.mine), ...marked.filter((entry) => !entry.mine)];
  }, [list, stack]);
  const vendors = useMemo(() => [...new Set((list ?? []).map((item) => item.vendor))], [list]);
  const dock = variant === "dock";
  const available = dock && !inactive && availableWidth >= PATCH_DOCK_MIN_WIDTH && items !== null;
  const previouslyAvailable = useRef(available);

  useEffect(() => {
    if (!dock) return;
    if (focusAfterToggle.current) {
      focusAfterToggle.current = false;
      if (available) (open ? hideButton : showButton).current?.focus();
    } else if (
      !available &&
      previouslyAvailable.current &&
      (section.current?.contains(document.activeElement) || document.activeElement === showButton.current)
    ) {
      // If the viewport removes the dock while it has focus, leave focus on the map, not hidden UI.
      document.querySelector<HTMLCanvasElement>(".mapboxgl-canvas")?.focus();
    }
    previouslyAvailable.current = available;
  }, [available, dock, open]);

  if (items === null) return null;
  const width = dock ? 296 : 272;
  const mineCount = items?.filter((entry) => entry.mine).length ?? 0;
  const summary = summaryLine(items?.length, mineCount, stack.length > 0);

  return (
    <>
      {dock && onOpenChange ? (
        <button
          ref={showButton}
          type="button"
          aria-label="Show Patch now"
          title="Show Patch now"
          aria-expanded={false}
          aria-controls="patch-now-dock"
          onClick={() => {
            focusAfterToggle.current = true;
            onOpenChange(true);
          }}
          className="glass-pill press pointer-events-auto absolute bottom-4 z-20 hidden h-10 items-center gap-2 rounded-full px-3.5 text-[12.5px] text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink md:flex"
          style={{ left: insetLeft, display: !available || open ? "none" : undefined }}
        >
          <CaretUp className="size-4" aria-hidden /> Patch now
        </button>
      ) : null}
      <section
        ref={section}
        id={dock ? "patch-now-dock" : undefined}
        aria-label="Patch now"
        className={cn(
          dock &&
            "glass-panel pointer-events-auto absolute bottom-4 z-20 hidden rounded-[22px] pb-3 pt-3.5 transition-[right] duration-300 ease-out-expo motion-reduce:transition-none md:block",
        )}
        style={dock ? { left: insetLeft, right: 16 + insetRight, display: !available || !open ? "none" : undefined } : undefined}
      >
        <div className={cn("flex items-center gap-2.5", dock ? "pl-4 pr-3" : "px-5")}>
          <h2 className="shrink-0 whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-2">Patch now</h2>
          <p className={cn("min-w-0 flex-1 truncate text-[12px]", dock && availableWidth < 700 && "hidden", mineCount ? "text-ink" : "text-ink-3")}>
            {summary}
          </p>
          {dock ? (
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <StackPicker suggestions={vendors} />
              <button
                type="button"
                onClick={() => {
                  setTab("exploited");
                  onShowSidebar?.();
                }}
                title="All vulnerabilities"
                className={cn(
                  "press mr-1 flex h-8 items-center justify-center rounded-full text-[12px] text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-ink",
                  availableWidth < 700 ? "w-8" : "px-2.5",
                )}
              >
                {availableWidth < 700 ? <ListBullets className="size-4" aria-hidden /> : null}
                <span className={availableWidth < 700 ? "sr-only" : undefined}>All vulnerabilities</span>
              </button>
              {([-1, 1] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => scroller.current?.scrollBy({ left: dir * (width + 8) * 2, behavior: "smooth" })}
                  aria-label={dir < 0 ? "Previous" : "Next"}
                  className="press flex size-7 items-center justify-center rounded-full bg-white/[0.05] text-ink-2 ring-1 ring-white/[0.07] transition-colors hover:text-ink"
                >
                  {dir < 0 ? <CaretLeft className="size-3.5" weight="bold" /> : <CaretRight className="size-3.5" weight="bold" />}
                </button>
              ))}
              {onOpenChange ? (
                <button
                  ref={hideButton}
                  type="button"
                  aria-label="Hide Patch now"
                  title="Hide Patch now"
                  aria-expanded={true}
                  aria-controls="patch-now-dock"
                  onClick={() => {
                    focusAfterToggle.current = true;
                    onOpenChange(false);
                  }}
                  className="press ml-1 flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <CaretDown className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
          ) : (
            <StackPicker suggestions={vendors} />
          )}
        </div>

        <ul
          ref={scroller}
          className={cn(
            "mt-2.5 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain scrollbar-none",
            dock ? "scroll-px-3 px-3 [mask-image:linear-gradient(to_right,black_calc(100%-48px),transparent)]" : "scroll-px-5 px-5 pb-1",
          )}
          aria-label="Vulnerabilities to patch now"
        >
          {items
            ? items.map(({ item, mine }, index) => <PatchCard key={item.key} item={item} index={index} width={width} mine={mine} />)
            : [0, 1, 2, 3].map((index) => (
                <li key={index} className="flex h-[132px] shrink-0 flex-col gap-3 rounded-[14px] bg-white/[0.035] p-3.5" style={{ width }}>
                  <span className="skeleton h-[22px] w-2/3 rounded-[6px]" />
                  <span className="skeleton h-4 w-full rounded" />
                  <span className="skeleton h-3.5 w-4/5 rounded" />
                </li>
              ))}
        </ul>
      </section>
    </>
  );
}
