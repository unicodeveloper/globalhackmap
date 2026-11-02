import landDots from "@/data/geo/land-dots.json";
import { STATUS_COLOR } from "@/lib/format";
import type { IncidentStatus } from "@/lib/types";

/** [lon, lat] land points on a 2.5 degree grid. */
const DOTS = landDots as [number, number][];

export type MarkKind = IncidentStatus | "outage";

export const MARK_COLOR: Record<MarkKind, string> = { ...STATUS_COLOR, outage: "#5ec8ff" };

const DOT = "#2a3341";
const DOT_LIT = "#4f5a6a";

/** Equirectangular view: `scale` pixels per degree, `centerLon` drawn at `centerX`, `topLat` at y = 0. */
export interface MapView {
  width: number;
  height: number;
  scale: number;
  centerLon: number;
  centerX: number;
  topLat: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Marker {
  lat: number;
  lon: number;
  kind: MarkKind;
  r?: number;
  /** A thin ring around the dot, for the one place a card is about. */
  ring?: boolean;
}

export function project(view: MapView, lon: number, lat: number): [number, number] {
  const dLon = ((((lon - view.centerLon) % 360) + 540) % 360) - 180;
  return [view.centerX + dLon * view.scale, (view.topLat - lat) * view.scale];
}

/** Puts (lat, lon) at (x, y), without scrolling past the top of the land. */
export function viewAround(
  lat: number,
  lon: number,
  { width, height, scale, x, y }: { width: number; height: number; scale: number; x: number; y: number },
): MapView {
  return { width, height, scale, centerLon: lon, centerX: x, topLat: Math.min(84, lat + y / scale) };
}

/** The whole world, Atlantic-centred, starting `top` pixels down. */
export function worldView({
  width,
  height,
  scale,
  top = 0,
  centerLon = 12,
}: {
  width: number;
  height: number;
  scale: number;
  top?: number;
  centerLon?: number;
}): MapView {
  return { width, height, scale, centerLon, centerX: width / 2, topLat: 81 + top / scale };
}

function mix(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function distanceToRect(x: number, y: number, rect: Rect): number {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.w));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.h));
  return Math.hypot(dx, dy);
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Opacity that eases from `floor` inside the rect to 1 at `range` pixels away. */
function fadeNear(x: number, y: number, rect: Rect, floor: number, range = 150): number {
  const t = Math.min(1, distanceToRect(x, y, rect) / range);
  return floor + (1 - floor) * t * t * (3 - 2 * t);
}

/**
 * Pins that share a place are laid out in a sunflower around it, so a card shows forty
 * attacks on Tokyo as forty dots rather than one blob. Clusters whose sunflowers would
 * overlap are merged first, so neighbouring cities never draw dots on top of each other.
 */
export function packMarkers(view: MapView, markers: Marker[], gap: number): Marker[] {
  const radius = (n: number) => gap * Math.sqrt(n) + gap * 0.5;
  const clusters = markers.map((marker) => {
    const [x, y] = project(view, marker.lon, marker.lat);
    return { x, y, items: [marker] };
  });
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i];
        const b = clusters[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) >= radius(a.items.length) + radius(b.items.length)) continue;
        const n = a.items.length + b.items.length;
        a.x = (a.x * a.items.length + b.x * b.items.length) / n;
        a.y = (a.y * a.items.length + b.y * b.items.length) / n;
        a.items.push(...b.items);
        clusters.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  const order: MarkKind[] = ["confirmed", "reported", "precautionary", "disputed", "claimed", "outage"];
  const golden = Math.PI * (3 - Math.sqrt(5));
  return clusters.flatMap((cluster) =>
    [...cluster.items]
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
      .map((marker, index) => {
        const x = cluster.x + Math.cos(index * golden) * gap * Math.sqrt(index);
        const y = cluster.y + Math.sin(index * golden) * gap * Math.sqrt(index);
        return { ...marker, lon: view.centerLon + (x - view.centerX) / view.scale, lat: view.topLat - y / view.scale };
      }),
  );
}

/** Status carried by shape as well as colour, matching StatusMark. */
export function markShape(kind: MarkKind, cx: number, cy: number, r: number): string {
  const color = MARK_COLOR[kind];
  const stroke = round(Math.max(1.5, r * 0.36));
  const inner = round(r - stroke / 2);
  const [x, y] = [round(cx), round(cy)];
  const ring = `<circle cx="${x}" cy="${y}" r="${inner}" fill="none" stroke="${color}" stroke-width="${stroke}"`;
  switch (kind) {
    case "confirmed":
      return `<circle cx="${x}" cy="${y}" r="${round(r)}" fill="${color}"/>`;
    case "reported":
      return `${ring}/><path d="M${x} ${round(y - inner)}A${inner} ${inner} 0 0 0 ${x} ${round(y + inner)}Z" fill="${color}"/>`;
    case "precautionary":
      return `${ring} stroke-dasharray="${round(r * 0.8)} ${round(r * 0.64)}"/>`;
    case "disputed": {
      const d = round(inner * 0.7);
      return `${ring}/><path d="M${round(x - d)} ${round(y + d)}L${round(x + d)} ${round(y - d)}" stroke="${color}" stroke-width="${stroke}"/>`;
    }
    default:
      return `${ring}/>`;
  }
}

export interface DotMapOptions {
  markers?: Marker[];
  /** Dots fade out near this area so text over the map stays legible. */
  keepOut?: Rect;
  /** Dots brighten around this point. */
  focus?: { x: number; y: number; radius: number };
  /** How far from the keep-out area dots reach full strength. */
  fadeRange?: number;
  dotRadius?: number;
  /** Fill the container instead of fixed pixel dimensions. */
  responsive?: boolean;
}

/** Dot-matrix world map as an SVG string, shared by OG cards and page maps. */
export function dotMapSvg(view: MapView, { markers = [], keepOut, focus, fadeRange = 150, dotRadius, responsive = false }: DotMapOptions = {}): string {
  const r = round(dotRadius ?? Math.max(1.4, view.scale * 2.5 * 0.25));
  const parts: string[] = [];
  for (const [lon, lat] of DOTS) {
    const [x, y] = project(view, lon, lat);
    if (x < -r || y < -r || x > view.width + r || y > view.height + r) continue;
    const opacity = keepOut ? fadeNear(x, y, keepOut, 0.18, fadeRange) : 1;
    let fill = DOT;
    if (focus) {
      const t = Math.max(0, 1 - Math.hypot(x - focus.x, y - focus.y) / focus.radius);
      if (t > 0) fill = mix(DOT, DOT_LIT, t * t);
    }
    parts.push(`<circle cx="${round(x)}" cy="${round(y)}" r="${r}" fill="${fill}"${opacity < 1 ? ` fill-opacity="${opacity.toFixed(2)}"` : ""}/>`);
  }
  // Confirmed last, so the most certain events sit on top.
  const order: MarkKind[] = ["outage", "claimed", "disputed", "precautionary", "reported", "confirmed"];
  const sorted = [...markers].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const marker of sorted) {
    const [x, y] = project(view, marker.lon, marker.lat);
    const size = marker.r ?? 5;
    if (x < -size * 3 || y < -size * 3 || x > view.width + size * 3 || y > view.height + size * 3) continue;
    const opacity = keepOut ? fadeNear(x, y, keepOut, 0.3, 12) : 1;
    if (opacity < 1) parts.push(`<g opacity="${opacity.toFixed(2)}">`);
    if (marker.ring) {
      parts.push(
        `<circle cx="${round(x)}" cy="${round(y)}" r="${round(size * 2.6)}" fill="none" stroke="${MARK_COLOR[marker.kind]}" stroke-opacity="0.6" stroke-width="1.5"/>`,
      );
    }
    parts.push(markShape(marker.kind, x, y, size));
    if (opacity < 1) parts.push("</g>");
  }
  const dims = responsive ? `width="100%" height="100%" preserveAspectRatio="xMidYMid slice"` : `width="${view.width}" height="${view.height}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view.width} ${view.height}" ${dims}>${parts.join("")}</svg>`;
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
