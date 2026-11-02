"use client";

import { MagnifyingGlassPlus } from "@phosphor-icons/react";
import { useEffect } from "react";

import { OrgLogo } from "@/components/kit/org-logo";
import { StatusMark } from "@/components/kit/status-mark";
import { useMapInstance } from "@/components/map/map-instance";
import { STATUS_LABEL, relativeTime } from "@/lib/format";
import type { Incident } from "@/lib/types";
import { useSituation } from "@/stores/situation";

export interface Cluster {
  incidents: Incident[];
  x: number;
  y: number;
  lng: number;
  lat: number;
}

/** Several pins under one click: list them, newest first, with a way to zoom in and separate them. */
export function ClusterMenu({ cluster, now, onClose }: { cluster: Cluster; now: number; onClose: () => void }) {
  const map = useMapInstance((s) => s.map);
  const select = useSituation((s) => s.select);
  const total = cluster.incidents.length;
  const shown = [...cluster.incidents].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const flip = typeof window !== "undefined" && cluster.x > window.innerWidth - 340;

  // Any camera move or Escape dismisses it: the pins it points at have moved.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    map?.once("movestart", onClose);
    window.addEventListener("keydown", onKey);
    return () => {
      map?.off("movestart", onClose);
      window.removeEventListener("keydown", onKey);
    };
  }, [map, onClose]);

  return (
    <div
      role="dialog"
      aria-label={`${total} incidents here`}
      className="pointer-events-auto absolute z-40 w-[300px] rounded-[16px] bg-surface p-1.5 ring-1 ring-hairline-2 shadow-xl animate-in fade-in zoom-in-95 duration-150"
      style={{ left: flip ? cluster.x - 316 : cluster.x + 16, top: Math.max(76, cluster.y - 24) }}
    >
      <p className="px-2.5 pb-1.5 pt-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-4">{total} incidents here</p>
      <ul>
        {shown.map((incident) => (
          <li key={incident.id}>
            <button
              type="button"
              onClick={() => {
                onClose();
                select(incident.id);
              }}
              className="flex w-full items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06]"
            >
              <OrgLogo name={incident.victim} domain={incident.domain} size={26} className="rounded-[7px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">{incident.victim}</span>
                <span className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                  <StatusMark status={incident.status} size={7} />
                  {STATUS_LABEL[incident.status]} · {relativeTime(incident.date, now)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          onClose();
          map?.flyTo({ center: [cluster.lng, cluster.lat], zoom: Math.min(map.getZoom() + 2.5, 9), duration: 1400, essential: true });
        }}
        className="mt-1 flex w-full items-center gap-2 rounded-[11px] border-t border-white/[0.06] px-2.5 py-2.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink"
      >
        <MagnifyingGlassPlus className="size-3.5" /> Zoom in here
        {total > shown.length ? <span className="ml-auto text-ink-4">+{total - shown.length} more</span> : null}
      </button>
    </div>
  );
}
