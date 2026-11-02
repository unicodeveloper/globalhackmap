import "server-only";

import { ImageResponse } from "next/og";
import type { CSSProperties, ReactElement, ReactNode } from "react";

import { hostLabel } from "@/lib/og/copy";
import { loadFonts } from "@/lib/og/fonts";
import { MARK_COLOR, type MarkKind, svgDataUri } from "@/lib/og/map";
import { type Fitted, type MetricFont, textWidth } from "@/lib/og/text";

export const OG_SIZE = { width: 1200, height: 630 };

/** Content box of every card: 64px sides, footer pinned to the bottom. */
export const PAD_X = 64;
export const CONTENT_WIDTH = OG_SIZE.width - PAD_X * 2;
/** y where the text block above the footer ends. */
export const BLOCK_BOTTOM = 512;

export const C = {
  space: "#05070b",
  ink: "#edf0f4",
  ink2: "#c3c9d1",
  ink3: "#8b95a1",
  ink4: "#5f6976",
};

const FAMILY: Record<MetricFont, CSSProperties> = {
  condensedExtraBold: { fontFamily: "Hubot Sans Condensed", fontWeight: 800 },
  condensedBold: { fontFamily: "Hubot Sans Condensed", fontWeight: 700 },
  semiCondensedBold: { fontFamily: "Hubot Sans SemiCondensed", fontWeight: 700 },
  medium: { fontFamily: "Mona Sans", fontWeight: 500 },
  regular: { fontFamily: "Mona Sans", fontWeight: 400 },
  mono: { fontFamily: "Martian Mono", fontWeight: 500 },
};

export async function renderCard(node: ReactElement): Promise<ImageResponse> {
  return new ImageResponse(node, { ...OG_SIZE, fonts: await loadFonts() });
}

/** Lines laid out by our own measurement, so the card never wraps differently from what was fitted. */
export function Lines({
  fit,
  font,
  color = C.ink,
  tracking = 0,
  lineHeight = 1,
  style,
}: {
  fit: Fitted;
  font: MetricFont;
  color?: string;
  tracking?: number;
  lineHeight?: number;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", ...style }}>
      {fit.lines.map((line, index) => (
        <div
          key={`${index}-${line}`}
          style={{
            display: "flex",
            whiteSpace: "nowrap",
            fontSize: fit.size,
            lineHeight,
            letterSpacing: tracking * fit.size,
            color,
            ...FAMILY[font],
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

export function linesHeight(fit: Fitted, lineHeight = 1): number {
  return fit.lines.length * fit.size * lineHeight;
}

export function linesWidth(fit: Fitted, font: MetricFont, tracking = 0): number {
  return Math.max(...fit.lines.map((line) => textWidth(line, font, fit.size, tracking)));
}

export type GlyphKind = MarkKind | "none";

/** StatusMark, drawn for Satori. "none" is a hollow grey ring for "nothing known". */
export function Glyph({ kind, size }: { kind: GlyphKind; size: number }) {
  const color = kind === "none" ? C.ink3 : MARK_COLOR[kind];
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
      {kind === "confirmed" ? <circle cx="5" cy="5" r="4.25" fill={color} /> : null}
      {kind === "reported" ? (
        <>
          <circle cx="5" cy="5" r="3.75" fill="none" stroke={color} strokeWidth="1.5" />
          <path d="M5 1.25a3.75 3.75 0 0 0 0 7.5z" fill={color} />
        </>
      ) : null}
      {kind === "claimed" || kind === "outage" || kind === "none" ? <circle cx="5" cy="5" r="3.75" fill="none" stroke={color} strokeWidth="1.5" /> : null}
      {kind === "precautionary" ? <circle cx="5" cy="5" r="3.75" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="2 1.6" /> : null}
      {kind === "disputed" ? (
        <>
          <circle cx="5" cy="5" r="3.75" fill="none" stroke={color} strokeWidth="1.5" />
          <path d="M2.4 7.6l5.2-5.2" stroke={color} strokeWidth="1.5" />
        </>
      ) : null}
    </svg>
  );
}

/** A glyph and a line of text, the card's status voice. */
export function StatusRow({ kind, text, color, size }: { kind: GlyphKind; text: string; color: string; size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.42) }}>
      <Glyph kind={kind} size={Math.round(size * 0.74)} />
      <div style={{ display: "flex", whiteSpace: "nowrap", fontSize: size, lineHeight: 1.1, color, ...FAMILY.semiCondensedBold }}>{text}</div>
    </div>
  );
}

function BrandMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="1.6">
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 3.75c-2.6 2.3-3.9 5.05-3.9 8.25s1.3 5.95 3.9 8.25M12 3.75c2.6 2.3 3.9 5.05 3.9 8.25s-1.3 5.95-3.9 8.25" opacity="0.55" />
      <path d="M12 0.75v4.5M12 18.75v4.5M0.75 12h4.5M18.75 12h4.5" />
      <circle cx="12" cy="12" r="1.6" fill={C.ink} stroke="none" />
    </svg>
  );
}

export function Text({
  children,
  size,
  color = C.ink3,
  font = "medium",
  style,
}: {
  children: ReactNode;
  size: number;
  color?: string;
  font?: MetricFont;
  style?: CSSProperties;
}) {
  return <div style={{ display: "flex", whiteSpace: "nowrap", fontSize: size, lineHeight: 1.15, color, ...FAMILY[font], ...style }}>{children}</div>;
}

/** Near-black ground, the dot map, the text block above a footer with the wordmark and the host. */
export function CardFrame({ map, children }: { map: string; children: ReactNode }) {
  return (
    <div
      style={{
        width: OG_SIZE.width,
        height: OG_SIZE.height,
        display: "flex",
        position: "relative",
        backgroundColor: C.space,
        color: C.ink,
        fontFamily: "Mona Sans",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={svgDataUri(map)} width={OG_SIZE.width} height={OG_SIZE.height} style={{ position: "absolute", left: 0, top: 0 }} />
      <div
        style={{
          position: "absolute",
          left: PAD_X,
          width: CONTENT_WIDTH,
          top: 0,
          height: BLOCK_BOTTOM,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          left: PAD_X,
          width: CONTENT_WIDTH,
          bottom: 46,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BrandMark size={30} />
          <Text size={29} color={C.ink} font="semiCondensedBold">
            Global Hack Map
          </Text>
        </div>
        <Text size={23} color={C.ink3}>
          {hostLabel()}
        </Text>
      </div>
    </div>
  );
}

/** A rendered card as bytes, so it can be produced inside a `use cache` scope (a Response cannot cross it). */
export async function cardBytes(card: Response | Promise<Response>): Promise<ArrayBuffer> {
  return (await card).arrayBuffer();
}

/** Serve bytes from `cardBytes` as the image response. */
export function pngResponse(bytes: ArrayBuffer): Response {
  return new Response(bytes, { headers: { "Content-Type": "image/png" } });
}
