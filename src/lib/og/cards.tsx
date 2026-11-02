import "server-only";

import {
  BLOCK_BOTTOM,
  C,
  CONTENT_WIDTH,
  CardFrame,
  Glyph,
  type GlyphKind,
  Lines,
  OG_SIZE,
  PAD_X,
  StatusRow,
  Text,
  linesHeight,
  linesWidth,
  renderCard,
} from "@/lib/og/card";
import {
  countryPhrase,
  countryPoint,
  epssText,
  exploitLine,
  exploitTone,
  fullDate,
  longDate,
  placeText,
  plural,
  productLabel,
  recordsText,
  statusLine,
} from "@/lib/og/copy";
import { MARK_COLOR, type MapView, type Marker, type Rect, dotMapSvg, packMarkers, project, viewAround, worldView } from "@/lib/og/map";
import { fitText, textWidth, truncateToWidth } from "@/lib/og/text";
import type { Incident, IncidentStatus, Vuln } from "@/lib/types";

const { width: W, height: H } = OG_SIZE;
const HEADLINE_TRACKING = -0.012;
const SEP = "  ·  ";
/** World maps are smaller, so they fade over a shorter distance and keep their shape. */
const WORLD_FADE = 80;

/** The place a single-location card is about sits here, above the text block. */
const FOCUS = { x: 884, y: 172 };

function zoomedView(lat: number, lon: number): MapView {
  return viewAround(lat, lon, { width: W, height: H, scale: 5, ...FOCUS });
}

function world(): MapView {
  return worldView({ width: W, height: H, scale: 3.2, top: 34 });
}

function incidentMarkers(view: MapView, incidents: Incident[], r: number): Marker[] {
  return packMarkers(
    view,
    incidents.map((incident) => ({ lat: incident.lat, lon: incident.lon, kind: incident.status, r })),
    r * 2.35,
  );
}

/** The text block's area; line boxes carry leading above the cap height, so the top starts a little lower. */
function keepOutFor(width: number, height: number): Rect {
  const top = BLOCK_BOTTOM - height + 22;
  return { x: 0, y: top, w: PAD_X + width, h: OG_SIZE.height - top };
}

function single(text: string, font: Parameters<typeof fitText>[1]["font"], max: number, min: number, maxWidth = CONTENT_WIDTH) {
  return fitText(text, { font, maxWidth, maxLines: 1, max, min });
}

interface Count {
  kind?: GlyphKind;
  text: string;
}

function CountsRow({ items, size, color = C.ink2 }: { items: Count[]; size: number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 1.05) }}>
      {items.map((item) => (
        <div key={item.text} style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.4) }}>
          {item.kind ? <Glyph kind={item.kind} size={Math.round(size * 0.66)} /> : null}
          <Text size={size} color={color}>
            {item.text}
          </Text>
        </div>
      ))}
    </div>
  );
}

function countsWidth(items: Count[], size: number): number {
  return items.reduce((sum, item) => sum + textWidth(item.text, "medium", size) + (item.kind ? size * 1.06 : 0), 0) + (items.length - 1) * size * 1.05;
}

/** Fit a row of counts by shrinking, then by dropping trailing items. */
function fitCounts(items: Count[], max: number, min: number): { items: Count[]; size: number } {
  for (let kept = items.length; kept > 0; kept--) {
    for (let size = max; size >= min; size -= 1) {
      if (countsWidth(items.slice(0, kept), size) <= CONTENT_WIDTH * 0.97) return { items: items.slice(0, kept), size };
    }
  }
  return { items: items.slice(0, 1), size: min };
}

function statusCounts(incidents: Incident[], claimedLabel: string): Count[] {
  const count = (statuses: IncidentStatus[]) => incidents.filter((incident) => statuses.includes(incident.status)).length;
  const items: Count[] = [
    { kind: "confirmed", text: `${count(["confirmed"])} confirmed` },
    { kind: "reported", text: `${count(["reported", "precautionary", "disputed"])} reported` },
    { kind: "claimed", text: `${count(["claimed"])} ${claimedLabel}` },
  ];
  return items.filter((item) => !item.text.startsWith("0 "));
}

export function incidentCard(incident: Incident) {
  const name = fitText(incident.victim, {
    font: "condensedExtraBold",
    maxWidth: CONTENT_WIDTH,
    maxLines: 2,
    max: 136,
    min: 60,
    oneLineMin: 92,
    tracking: HEADLINE_TRACKING,
  });
  const status = single(statusLine(incident), "semiCondensedBold", 38, 26, CONTENT_WIDTH - 44);
  const meta = truncateToWidth([placeText(incident), longDate(incident.date), recordsText(incident)].filter(Boolean).join(SEP), "medium", 27, CONTENT_WIDTH);
  const height = linesHeight(name, 0.95) + 26 + status.size * 1.1 + 18 + 31;
  const width = Math.max(
    linesWidth(name, "condensedExtraBold", HEADLINE_TRACKING),
    textWidth(meta, "medium", 27),
    textWidth(status.lines[0], "semiCondensedBold", status.size) + 44,
  );
  const view = zoomedView(incident.lat, incident.lon);
  const [x, y] = project(view, incident.lon, incident.lat);
  const map = dotMapSvg(view, {
    markers: [{ lat: incident.lat, lon: incident.lon, kind: incident.status, r: 9, ring: true }],
    keepOut: keepOutFor(width, height),
    focus: { x, y, radius: 190 },
  });
  return renderCard(
    <CardFrame map={map}>
      <Lines fit={name} font="condensedExtraBold" lineHeight={0.95} tracking={HEADLINE_TRACKING} />
      <div style={{ display: "flex", marginTop: 26 }}>
        <StatusRow kind={incident.status} text={status.lines[0]} color={MARK_COLOR[incident.status]} size={status.size} />
      </div>
      <Text size={27} style={{ marginTop: 18 }}>
        {meta}
      </Text>
    </CardFrame>,
  );
}

export function cveCard(vuln: Vuln, mentions: Incident[], kevKnown = true) {
  const id = fitText(vuln.cve, { font: "mono", maxWidth: CONTENT_WIDTH, maxLines: 1, max: 112, min: 64, tracking: -0.03 });
  const product = single(productLabel(vuln) || vuln.name || "Vulnerability", "condensedExtraBold", 66, 40);
  const tone = exploitTone(vuln, kevKnown);
  const kind: GlyphKind = tone === "exploited" ? "confirmed" : tone === "news" ? "reported" : "none";
  const color = tone === "exploited" ? MARK_COLOR.confirmed : tone === "news" ? MARK_COLOR.reported : C.ink3;
  const status = single(exploitLine(vuln, kevKnown), "semiCondensedBold", 36, 26, CONTENT_WIDTH - 44);
  const facts = truncateToWidth(
    [
      vuln.epss !== undefined ? `EPSS ${epssText(vuln.epss)} chance of exploitation in 30 days` : "No EPSS score yet",
      vuln.cvss ? `CVSS ${vuln.cvss.toFixed(1)}${vuln.severity ? ` ${vuln.severity.toLowerCase()}` : ""}` : null,
      vuln.ransomware ? "Used by ransomware" : null,
    ]
      .filter(Boolean)
      .join(SEP),
    "medium",
    27,
    CONTENT_WIDTH,
  );
  const height = id.size + 10 + product.size + 26 + status.size * 1.1 + 18 + 31;
  const width = Math.max(
    textWidth(vuln.cve, "mono", id.size, -0.03),
    textWidth(product.lines[0], "condensedExtraBold", product.size),
    textWidth(facts, "medium", 27),
  );
  const view = world();
  const map = dotMapSvg(view, { markers: incidentMarkers(view, mentions, 5), keepOut: keepOutFor(width, height), fadeRange: WORLD_FADE });
  return renderCard(
    <CardFrame map={map}>
      <Lines fit={id} font="mono" tracking={-0.03} />
      <Lines fit={product} font="condensedExtraBold" color={C.ink2} style={{ marginTop: 10 }} />
      <div style={{ display: "flex", marginTop: 26 }}>
        <StatusRow kind={kind} text={status.lines[0]} color={color} size={status.size} />
      </div>
      <Text size={27} style={{ marginTop: 18 }}>
        {facts}
      </Text>
    </CardFrame>,
  );
}

export function countryCard(code: string, incidents: Incident[]) {
  const name = countryPhrase(code);
  const n = incidents.length;
  const headline = n ? `${plural(n, "organisation")} hit in ${name}` : `No organisations reported hit in ${name}`;
  const head = fitText(headline, {
    font: "condensedExtraBold",
    maxWidth: CONTENT_WIDTH,
    maxLines: 2,
    max: 108,
    min: 56,
    oneLineMin: 84,
    tracking: HEADLINE_TRACKING,
  });
  const tail = { size: head.size, lines: ["in the last 30 days."] };
  const counts = fitCounts(statusCounts(incidents, "claimed by attackers"), 29, 22);
  const height = linesHeight(head, 0.95) + linesHeight(tail, 0.95) + 28 + 34;
  const width = Math.max(linesWidth(head, "condensedExtraBold", HEADLINE_TRACKING), countsWidth(counts.items, counts.size));
  const centroid = countryPoint(code);
  const view = centroid ? zoomedView(centroid[1], centroid[0]) : world();
  const [x, y] = centroid ? project(view, centroid[0], centroid[1]) : [FOCUS.x, FOCUS.y];
  const map = dotMapSvg(view, {
    markers: incidentMarkers(view, incidents, 5),
    keepOut: keepOutFor(width, height),
    focus: centroid ? { x, y, radius: 240 } : undefined,
  });
  return renderCard(
    <CardFrame map={map}>
      <Lines fit={head} font="condensedExtraBold" lineHeight={0.95} tracking={HEADLINE_TRACKING} />
      <Lines fit={tail} font="condensedExtraBold" lineHeight={0.95} tracking={HEADLINE_TRACKING} color={C.ink4} />
      {counts.items.length ? (
        <div style={{ display: "flex", marginTop: 28 }}>
          <CountsRow items={counts.items} size={counts.size} />
        </div>
      ) : null}
    </CardFrame>,
  );
}

export function digestCard({
  date,
  incidents,
  kevAdded,
  newsVulns,
  malware,
}: {
  date: string;
  incidents: Incident[];
  kevAdded: number | null;
  newsVulns: number;
  malware: number | null;
}) {
  const day = fitText(fullDate(date, false), {
    font: "condensedExtraBold",
    maxWidth: CONTENT_WIDTH,
    maxLines: 1,
    max: 124,
    min: 72,
    tracking: HEADLINE_TRACKING,
  });
  const line = single("Everything that broke in the last 48 hours.", "condensedBold", 58, 36);
  const counts = fitCounts(
    [
      { text: `${plural(incidents.length, "organisation")} hit` },
      { text: kevAdded ? plural(kevAdded, "newly exploited flaw") : plural(newsVulns, "flaw in the news", "flaws in the news") },
      ...(malware !== null ? [{ text: plural(malware, "malicious package") }] : []),
    ],
    28,
    22,
  );
  const height = day.size * 0.95 + 12 + line.size + 28 + 34;
  const width = Math.max(
    linesWidth(day, "condensedExtraBold", HEADLINE_TRACKING),
    textWidth(line.lines[0], "condensedBold", line.size),
    countsWidth(counts.items, counts.size),
  );
  const view = world();
  const map = dotMapSvg(view, { markers: incidentMarkers(view, incidents, 3.6), keepOut: keepOutFor(width, height), fadeRange: WORLD_FADE });
  return renderCard(
    <CardFrame map={map}>
      <Lines fit={day} font="condensedExtraBold" lineHeight={0.95} tracking={HEADLINE_TRACKING} />
      <Lines fit={line} font="condensedBold" color={C.ink2} style={{ marginTop: 12 }} />
      <div style={{ display: "flex", marginTop: 28 }}>
        <CountsRow items={counts.items} size={counts.size} color={C.ink3} />
      </div>
    </CardFrame>,
  );
}

export function homeCard(incidents: Incident[]) {
  const n = incidents.length;
  const head = fitText(`${plural(n, "organisation")} hit`, {
    font: "condensedExtraBold",
    maxWidth: CONTENT_WIDTH,
    maxLines: 1,
    max: 132,
    min: 80,
    tracking: HEADLINE_TRACKING,
  });
  const tail = { size: head.size, lines: ["in the last 7 days."] };
  const countries = new Set(incidents.map((incident) => incident.country)).size;
  const counts = fitCounts([...statusCounts(incidents, "only claimed by attackers"), { text: `across ${plural(countries, "country", "countries")}` }], 29, 22);
  const height = linesHeight(head, 0.95) * 2 + 28 + 34;
  const width = Math.max(linesWidth(head, "condensedExtraBold", HEADLINE_TRACKING), countsWidth(counts.items, counts.size));
  const view = world();
  const map = dotMapSvg(view, { markers: incidentMarkers(view, incidents, 3.6), keepOut: keepOutFor(width, height), fadeRange: WORLD_FADE });
  return renderCard(
    <CardFrame map={map}>
      <Lines fit={head} font="condensedExtraBold" lineHeight={0.95} tracking={HEADLINE_TRACKING} />
      <Lines fit={tail} font="condensedExtraBold" lineHeight={0.95} tracking={HEADLINE_TRACKING} color={C.ink4} />
      <div style={{ display: "flex", marginTop: 28 }}>
        <CountsRow items={counts.items} size={counts.size} />
      </div>
    </CardFrame>,
  );
}

/** For links that no longer resolve: still a good-looking card, and honest about it. */
export function fallbackCard(headline: string, detail: string) {
  const head = fitText(headline, {
    font: "condensedExtraBold",
    maxWidth: CONTENT_WIDTH,
    maxLines: 2,
    max: 104,
    min: 56,
    oneLineMin: 84,
    tracking: HEADLINE_TRACKING,
  });
  const sub = single(detail, "medium", 29, 22);
  const height = linesHeight(head, 0.95) + 26 + 34;
  const width = Math.max(linesWidth(head, "condensedExtraBold", HEADLINE_TRACKING), textWidth(sub.lines[0], "medium", sub.size));
  const map = dotMapSvg(world(), { keepOut: keepOutFor(width, height), fadeRange: WORLD_FADE });
  return renderCard(
    <CardFrame map={map}>
      <Lines fit={head} font="condensedExtraBold" lineHeight={0.95} tracking={HEADLINE_TRACKING} />
      <Text size={sub.size} color={C.ink2} style={{ marginTop: 26 }}>
        {sub.lines[0]}
      </Text>
    </CardFrame>,
  );
}
