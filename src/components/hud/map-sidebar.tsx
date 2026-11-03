"use client";

import { SidebarSimple } from "@phosphor-icons/react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

import { SIDEBAR_DEFAULT, SIDEBAR_MIN, clampSidebarWidth, sidebarKeyboardWidth } from "@/components/hud/sidebar-layout";
import { cn } from "@/lib/utils";

export function MapSidebar({
  children,
  open,
  onOpenChange,
  width,
  maximum,
  onWidthChange,
  sheetOpen,
  onSheetToggle,
  cinema,
}: {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  maximum: number;
  onWidthChange: (width: number) => void;
  sheetOpen: boolean;
  onSheetToggle: () => void;
  cinema: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const reopen = useRef<HTMLButtonElement>(null);
  const previouslyOpen = useRef(open);
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (previouslyOpen.current === open) return;
    previouslyOpen.current = open;
    if (open) panel.current?.querySelector<HTMLButtonElement>("[data-sidebar-close]")?.focus();
    else reopen.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!dragging) return;
    const cursor = document.body.style.cursor;
    const userSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [dragging]);

  return (
    <>
      <button
        ref={reopen}
        type="button"
        aria-controls="map-sidebar"
        aria-expanded={open}
        onClick={() => onOpenChange(true)}
        className={cn(
          "glass-pill press pointer-events-auto absolute right-4 top-[124px] z-20 flex h-10 items-center gap-2 rounded-full px-3.5 text-[12.5px] text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink md:left-4 md:right-auto md:top-[76px]",
          (open || cinema) && "hidden",
        )}
      >
        <SidebarSimple className="size-4" aria-hidden /> Show sidebar
      </button>
      <div
        ref={panel}
        id="map-sidebar"
        role="region"
        aria-label="Live incident sidebar"
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[24px] transition-[height] duration-300 ease-out-expo motion-reduce:transition-none",
          sheetOpen ? "h-[min(88dvh,calc(100dvh-var(--map-top)))]" : "h-[52dvh]",
          "md:inset-x-auto md:bottom-4 md:left-4 md:top-[var(--map-top)] md:h-auto md:w-[var(--sidebar-width)] md:rounded-[22px]",
          !open && "hidden",
        )}
        style={{ "--sidebar-width": `${width}px`, pointerEvents: cinema ? "none" : undefined } as CSSProperties}
      >
        <div className="glass-panel flex h-full min-h-0 flex-col overflow-hidden rounded-t-[24px] pb-[env(safe-area-inset-bottom)] pt-2 md:rounded-[22px] md:pb-0 md:pt-0">
          <button
            type="button"
            onClick={onSheetToggle}
            className="pointer-events-auto mx-auto mb-1 flex h-6 w-16 shrink-0 items-center justify-center md:hidden"
            aria-label={sheetOpen ? "Show more of the map" : "Expand the panel"}
          >
            <span className="h-1 w-9 rounded-full bg-white/15" />
          </button>
          {children}
        </div>
        <div
          role="separator"
          tabIndex={cinema ? -1 : 0}
          aria-label="Sidebar width"
          aria-orientation="vertical"
          aria-controls="map-sidebar"
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={maximum}
          aria-valuenow={width}
          aria-valuetext={`${width} pixels`}
          aria-describedby="sidebar-resize-help"
          title="Drag to resize. Arrow keys adjust width. Home for narrowest, End for widest."
          className={cn(
            "group pointer-events-auto absolute -right-2 top-5 bottom-5 hidden w-4 touch-none cursor-col-resize items-center justify-center rounded-full outline-none md:flex",
            "focus-visible:bg-white/10 focus-visible:ring-2 focus-visible:ring-ink/80",
          )}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { pointer: event.pointerId, x: event.clientX, width };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            if (drag.current?.pointer !== event.pointerId) return;
            onWidthChange(clampSidebarWidth(drag.current.width + event.clientX - drag.current.x, maximum));
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointer !== event.pointerId) return;
            event.currentTarget.releasePointerCapture(event.pointerId);
            drag.current = null;
            setDragging(false);
          }}
          onLostPointerCapture={() => {
            drag.current = null;
            setDragging(false);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          onDoubleClick={() => onWidthChange(clampSidebarWidth(SIDEBAR_DEFAULT, maximum))}
          onKeyDown={(event) => {
            const next = sidebarKeyboardWidth(event.key, width, maximum, event.shiftKey);
            if (next === null) return;
            event.preventDefault();
            event.stopPropagation();
            onWidthChange(next);
          }}
        >
          <span
            aria-hidden
            className={cn("h-12 w-1 rounded-full bg-ink/25 transition-colors group-hover:bg-ink/70 group-focus-visible:bg-ink", dragging && "bg-ink")}
          />
        </div>
        <p id="sidebar-resize-help" className="sr-only">
          Drag or use Left and Right arrow keys to resize. Hold Shift for larger steps. Home sets the minimum width. End sets the maximum width. Double-click
          resets the width.
        </p>
      </div>
    </>
  );
}
