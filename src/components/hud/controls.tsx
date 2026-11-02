"use client";

import { StackSimple } from "@phosphor-icons/react";

import { StatusMark } from "@/components/kit/status-mark";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { STATUS_LABEL, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/perf/use-now";
import type { Snapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSituation } from "@/stores/situation";

const LAYERS = [
  { id: "incidents", label: "Incidents" },
  { id: "countries", label: "Country shading" },
  { id: "outages", label: "Connectivity drops" },
  { id: "arcs", label: "Links between victims of the same gang" },
] as const;

/** Map layers and the key to the map's marks. The status split itself lives in the left panel. */
export function MapControls({ generatedAt, feeds, shiftForPanel }: { generatedAt: string; feeds: Snapshot["feeds"]; shiftForPanel: boolean }) {
  const layers = useSituation((s) => s.layers);
  const toggleLayer = useSituation((s) => s.toggleLayer);
  const okFeeds = Object.values(feeds).filter((feed) => feed.ok).length;
  // The popover is prerendered with the page, so its "updated" time uses the server-safe clock.
  const now = useNow(Date.parse(generatedAt));

  return (
    <div
      className={cn(
        "pointer-events-auto absolute top-[76px] z-20 hidden transition-[right] duration-300 ease-out-expo md:block",
        shiftForPanel ? "right-[480px]" : "right-4",
      )}
    >
      <Popover>
        <PopoverTrigger
          className="glass-pill press flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] text-ink-2 transition-colors hover:text-ink"
          aria-label="Map layers and key"
        >
          <StackSimple className="size-3.5" /> Layers
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-72 rounded-[16px] border-0 bg-surface p-1.5 ring-1 ring-hairline-2 shadow-xl">
          <p className="px-2.5 pb-1 pt-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-4">Layers</p>
          {LAYERS.map((layer) => (
            <label
              key={layer.id}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-[10px] px-2.5 py-2 text-[13px] text-ink transition-colors hover:bg-white/[0.04]"
            >
              {layer.label}
              <input type="checkbox" className="size-4 accent-ink" checked={layers[layer.id]} onChange={() => toggleLayer(layer.id)} />
            </label>
          ))}
          <p className="mt-1 border-t border-white/[0.06] px-2.5 pb-1 pt-2.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-4">Key</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-2.5 pb-2 pt-1 text-[12.5px] text-ink-2">
            {(["confirmed", "reported", "claimed"] as const).map((status) => (
              <span key={status} className="flex items-center gap-2">
                <StatusMark status={status} size={9} />
                {STATUS_LABEL[status]}
              </span>
            ))}
            <span className="flex items-center gap-2">
              <span className="size-[9px] rounded-full ring-[1.5px] ring-outage" />
              Connectivity drop
            </span>
          </div>
          <p className="border-t border-white/[0.06] px-2.5 pb-1.5 pt-2.5 text-[12px] leading-relaxed text-ink-4">
            Updated {relativeTime(generatedAt, now)} from {okFeeds} of {Object.keys(feeds).length} live sources.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
