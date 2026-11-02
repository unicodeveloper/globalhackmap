"use client";

import type { Map as MapboxMap } from "mapbox-gl";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import { OrgLogo } from "@/components/kit/org-logo";
import { StatusMark, statusColor } from "@/components/kit/status-mark";
import { angularDistance, useMapInstance } from "@/components/map/map-instance";
import { STATUS_LABEL, compact } from "@/lib/format";
import type { Incident } from "@/lib/types";
import { useSituation } from "@/stores/situation";

interface Placed {
  id: string;
  px: number;
  py: number;
  tx: number;
  ty: number;
  w: number;
  side: "left" | "right";
}

const TAG_H = 40;
const MAX_TAGS = 7;
const NAME_FONT = "font-semicondensed text-[13.5px] font-semibold";
const META_FONT = "text-[11px]";
/** Logo, its gap and the horizontal padding around the text. */
const TAG_CHROME = 54;
/** Status mark and its gap before the status line. */
const MARK_W = 11;
const TEXT_MAX = 220;

function priority(incident: Incident, now: number): number {
  const ageDays = (now - Date.parse(incident.date)) / 86_400_000;
  return (
    incident.severity * 3 +
    (incident.status === "confirmed" ? 3 : incident.status === "reported" ? 2 : 0) +
    (incident.records ? Math.log10(incident.records) : 0) -
    ageDays * 0.6
  );
}

const measured = new Map<string, number>();
let ruler: HTMLSpanElement | null = null;

/** Rendered width of `text` in `font`, measured in the page so the fonts' width axis counts. Cached until fonts load. */
function textWidth(text: string, font: string): number {
  const key = `${font}|${text}`;
  const cached = measured.get(key);
  if (cached !== undefined) return cached;
  if (!ruler) {
    ruler = document.createElement("span");
    ruler.setAttribute("aria-hidden", "true");
    document.body.appendChild(ruler);
  }
  ruler.className = `${font} invisible fixed left-0 top-0 whitespace-pre`;
  ruler.textContent = text;
  const width = ruler.getBoundingClientRect().width;
  measured.set(key, width);
  return width;
}

/** Wide enough for the longer of the two lines, so the status and record count never wrap out of the tag. */
function tagWidth(incident: Incident): number {
  const status = STATUS_LABEL[incident.status];
  const meta = incident.records ? `${status} · ${compact(incident.records)}` : status;
  const widest = Math.max(textWidth(incident.victim, NAME_FONT), MARK_W + textWidth(meta, META_FONT));
  // The ruler reads the gap before the count as a space, a pixel or so narrower than the tag's flex gap.
  return TAG_CHROME + Math.ceil(Math.min(TEXT_MAX, widest)) + 2;
}

function layout(
  map: MapboxMap,
  candidates: Incident[],
  pins: Incident[],
  pinned: string | null,
  insetLeft: number,
  insetRight: number,
  insetBottom: number,
): Placed[] {
  const canvas = map.getCanvas();
  const width = canvas.clientWidth - insetRight;
  const height = canvas.clientHeight - insetBottom;
  const center = map.getCenter();
  const zoom = map.getZoom();
  // On the globe only the near hemisphere is visible; keep tags well inside the limb.
  const limit = zoom < 2.5 ? 68 : 85;
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  const placed: Placed[] = [];
  const ordered = pinned ? [...candidates.filter((c) => c.id === pinned), ...candidates.filter((c) => c.id !== pinned)] : candidates;
  // Every visible pin is an obstacle: a tag drawn over one makes it impossible to hover or click.
  const obstacles = pins.filter((pin) => angularDistance(center.lng, center.lat, pin.lon, pin.lat) <= limit).map((pin) => map.project([pin.lon, pin.lat]));

  for (const incident of ordered) {
    if (placed.length >= MAX_TAGS) break;
    if (angularDistance(center.lng, center.lat, incident.lon, incident.lat) > limit) continue;
    const point = map.project([incident.lon, incident.lat]);
    if (point.x < insetLeft + 40 || point.x > width - 30 || point.y < 90 || point.y > height - 70) continue;
    const w = tagWidth(incident);
    const options: { tx: number; ty: number; side: "left" | "right" }[] = [
      { tx: point.x + 34, ty: point.y - 58, side: "right" },
      { tx: point.x - 34 - w, ty: point.y - 58, side: "left" },
      { tx: point.x + 34, ty: point.y + 22, side: "right" },
      { tx: point.x - 34 - w, ty: point.y + 22, side: "left" },
    ];
    const fit = options.find(({ tx, ty }) => {
      if (tx < insetLeft + 12 || tx + w > width - 12 || ty < 76 || ty + TAG_H > height - 56) return false;
      if (obstacles.some((o) => o.x > tx - 8 && o.x < tx + w + 8 && o.y > ty - 8 && o.y < ty + TAG_H + 8)) return false;
      return !boxes.some((b) => tx < b.x + b.w + 8 && tx + w + 8 > b.x && ty < b.y + b.h + 8 && ty + TAG_H + 8 > b.y);
    });
    if (!fit) continue;
    boxes.push({ x: fit.tx, y: fit.ty, w, h: TAG_H });
    placed.push({ id: incident.id, px: point.x, py: point.y, tx: fit.tx, ty: fit.ty, w, side: fit.side });
  }
  return placed;
}

const Tag = memo(function Tag({
  incident,
  placed,
  active,
  onSelect,
  onHover,
}: {
  incident: Incident;
  placed: Placed;
  active: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const color = statusColor(incident.status);
  const anchorX = placed.side === "right" ? placed.tx : placed.tx + placed.w;
  const anchorY = placed.ty + TAG_H / 2;
  const elbowX = placed.side === "right" ? anchorX - 12 : anchorX + 12;
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 overflow-visible" width="100%" height="100%" aria-hidden>
        <polyline
          points={`${placed.px},${placed.py} ${elbowX},${anchorY} ${anchorX},${anchorY}`}
          fill="none"
          stroke={active ? "#f2f2f2" : "rgba(242,242,242,0.45)"}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={placed.px} cy={placed.py} r="2.5" fill={color} />
      </svg>
      {/* Placed by the wrapper and animated inside it: the entrance animation sets its own transform, which
          would otherwise start every tag at the corner of the map. */}
      <div className="absolute left-0 top-0" style={{ transform: `translate3d(${placed.tx}px, ${placed.ty}px, 0)`, width: placed.w, height: TAG_H }}>
        <button
          type="button"
          onClick={() => onSelect(incident.id)}
          onMouseEnter={() => onHover(incident.id)}
          onMouseLeave={() => onHover(null)}
          className="pointer-events-auto flex size-full items-center gap-2 rounded-[10px] bg-space py-1 pl-1 pr-3 text-left ring-1 transition-[box-shadow,background-color] duration-200 hover:bg-surface animate-in fade-in zoom-in-95 duration-300"
          style={{
            // Tinted ring, not a glow: the status colour at low alpha.
            boxShadow: active ? `0 0 0 1px ${color}` : undefined,
            ["--tw-ring-color" as string]: active ? "transparent" : "rgba(255,255,255,0.09)",
          }}
        >
          <OrgLogo name={incident.victim} domain={incident.domain} size={30} />
          <span className="min-w-0">
            <span className={`block truncate ${NAME_FONT} leading-tight text-ink`}>{incident.victim}</span>
            <span className={`flex items-center gap-1 whitespace-nowrap ${META_FONT} leading-tight text-ink-3`}>
              <StatusMark status={incident.status} size={7} />
              {STATUS_LABEL[incident.status]}
              {incident.records ? <span className="text-ink-4">· {compact(incident.records)}</span> : null}
            </span>
          </span>
        </button>
      </div>
    </>
  );
});

/** ATC-style data tags: the most important visible incidents, named on the planet, with leader lines. */
export function DataTags({
  incidents,
  now,
  insetLeft,
  insetRight = 0,
  insetBottom = 0,
}: {
  incidents: Incident[];
  /** Reference time for recency ranking: the snapshot's, so server and client rank the same way. */
  now: number;
  insetLeft: number;
  insetRight?: number;
  insetBottom?: number;
}) {
  const map = useMapInstance((s) => s.map);
  const ready = useMapInstance((s) => s.ready);
  const selectedId = useSituation((s) => s.selectedId);
  const hoveredId = useSituation((s) => s.hoveredId);
  const cinema = useSituation((s) => s.cinema);
  const select = useSituation((s) => s.select);
  const hover = useSituation((s) => s.hover);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const frame = useRef(0);

  const candidates = useMemo(() => [...incidents].sort((a, b) => priority(b, now) - priority(a, now)).slice(0, 60), [incidents, now]);
  const byId = useMemo(() => new Map(incidents.map((incident) => [incident.id, incident])), [incidents]);

  useEffect(() => {
    if (!map || !ready || cinema) return;
    // Schedule at most one layout per frame. Cancelling and rescheduling on every move event starves
    // the callback while the globe spins, because each spin frame fires a move before it can run.
    let scheduled = false;
    const update = () => {
      if (scheduled) return;
      scheduled = true;
      frame.current = requestAnimationFrame(() => {
        scheduled = false;
        setPlaced(layout(map, candidates, incidents, selectedId, insetLeft, insetRight, insetBottom));
      });
    };
    // Widths measured before the webfonts arrived are the fallback font's; measure again once they have.
    const remeasure = () => {
      measured.clear();
      update();
    };
    update();
    map.on("move", update);
    map.on("resize", update);
    document.fonts.addEventListener("loadingdone", remeasure);
    return () => {
      cancelAnimationFrame(frame.current);
      map.off("move", update);
      map.off("resize", update);
      document.fonts.removeEventListener("loadingdone", remeasure);
    };
  }, [map, ready, candidates, incidents, selectedId, insetLeft, insetRight, insetBottom, cinema]);

  if (cinema) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 hidden md:block" aria-label="Named incidents on the map">
      {placed.map((item) => {
        const incident = byId.get(item.id);
        if (!incident) return null;
        return (
          <Tag key={item.id} incident={incident} placed={item} active={item.id === selectedId || item.id === hoveredId} onSelect={select} onHover={hover} />
        );
      })}
    </div>
  );
}
