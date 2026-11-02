"use client";

import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  count?: number;
}

/**
 * Segmented control on an inset track; the active segment's surface slides between options.
 * Used for tabs (role="tab") and single-choice switches (role="radio"). The slide is plain CSS on a
 * measured indicator, so no animation library ships with it.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  kind = "radio",
  mono = false,
  className,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  kind?: "radio" | "tab";
  mono?: boolean;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const root = track.current;
    const pill = indicator.current;
    if (!root || !pill) return;
    const place = () => {
      const active = root.querySelector<HTMLElement>('[data-active="true"]');
      if (!active) return;
      // The first placement jumps into position; later ones slide.
      pill.style.transitionDuration = placed.current ? "" : "0ms";
      pill.style.transform = `translateX(${active.offsetLeft}px)`;
      pill.style.width = `${active.offsetWidth}px`;
      pill.style.opacity = "1";
      placed.current = true;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(root);
    return () => observer.disconnect();
  }, [value, options.length]);

  return (
    <div
      ref={track}
      role={kind === "tab" ? "tablist" : "radiogroup"}
      aria-label={label}
      className={cn("relative flex rounded-full bg-space p-[3px]", className)}
    >
      <span
        ref={indicator}
        aria-hidden
        className="pointer-events-none absolute bottom-[3px] left-0 top-[3px] rounded-full bg-surface-3 opacity-0 transition-[transform,width] duration-300 ease-out-expo motion-reduce:transition-none"
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role={kind}
            data-active={active}
            aria-selected={kind === "tab" ? active : undefined}
            aria-checked={kind === "radio" ? active : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative flex flex-1 items-baseline justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-[5px] transition-colors duration-200",
              mono ? "font-mono text-[11px] tabular" : "text-[12.5px]",
              active ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className={cn("font-mono text-[10.5px] tabular", active ? "text-ink-3" : "text-ink-4")}>{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
