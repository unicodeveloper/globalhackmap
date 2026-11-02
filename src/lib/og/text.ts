import { ADVANCE, FIRST_CODE_POINT } from "@/lib/og/metrics";

export type MetricFont = keyof typeof ADVANCE | "mono";

/** Width in pixels of a single line, from the real advance widths of the font. */
export function textWidth(text: string, font: MetricFont, size: number, tracking = 0): number {
  const chars = [...text];
  if (font === "mono") return chars.length * size * (0.6 + tracking);
  const table: number[] = ADVANCE[font];
  let units = 0;
  for (const ch of chars) {
    const width = table[(ch.codePointAt(0) ?? 0) - FIRST_CODE_POINT];
    // Glyphs outside the table (CJK, symbols) are rendered by a fallback font: assume a full em.
    units += width || 1000;
  }
  return (units / 1000 + chars.length * tracking) * size;
}

/** Greedy word wrap. Returns null when a single word is wider than the line. */
export function wrapLines(text: string, font: MetricFont, size: number, maxWidth: number, tracking = 0): string[] | null {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (textWidth(word, font, size, tracking) > maxWidth) return null;
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, font, size, tracking) <= maxWidth) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Narrowest width that keeps the same number of lines, so a headline never ends on one orphaned word. */
function balance(text: string, font: MetricFont, size: number, maxWidth: number, tracking: number, lines: string[]): string[] {
  if (lines.length < 2) return lines;
  for (let width = maxWidth / lines.length; width < maxWidth; width += 6) {
    const candidate = wrapLines(text, font, size, width, tracking);
    if (candidate && candidate.length === lines.length) return candidate;
  }
  return lines;
}

/** Cut a line to fit, at a word boundary when possible, with an ellipsis. */
export function truncateToWidth(text: string, font: MetricFont, size: number, maxWidth: number, tracking = 0): string {
  if (textWidth(text, font, size, tracking) <= maxWidth) return text;
  const chars = [...text];
  for (let end = chars.length - 1; end > 0; end--) {
    let candidate = chars.slice(0, end).join("").trimEnd();
    const space = candidate.lastIndexOf(" ");
    if (space > candidate.length * 0.6) candidate = candidate.slice(0, space);
    candidate = `${candidate.replace(/[\s,.:;/-]+$/, "")}…`;
    if (textWidth(candidate, font, size, tracking) <= maxWidth) return candidate;
  }
  return "…";
}

export interface FitOptions {
  font: MetricFont;
  maxWidth: number;
  maxLines: number;
  max: number;
  min: number;
  /** Letter spacing in em. */
  tracking?: number;
  /** Prefer one line down to this size before allowing a second line. */
  oneLineMin?: number;
}

export interface Fitted {
  size: number;
  lines: string[];
}

/** Largest size at which the text fits in the allowed lines. Truncates at the minimum size as a last resort. */
export function fitText(text: string, options: FitOptions): Fitted {
  const { font, maxLines, max, min, tracking = 0 } = options;
  // A small safety margin for kerning and rasterising differences.
  const maxWidth = options.maxWidth * 0.97;
  const oneLineMin = options.oneLineMin ?? min;
  for (let size = max; size >= oneLineMin; size -= 2) {
    if (textWidth(text, font, size, tracking) <= maxWidth) return { size, lines: [text] };
  }
  for (let size = Math.min(max, oneLineMin); size >= min; size -= 2) {
    const lines = wrapLines(text, font, size, maxWidth, tracking);
    if (lines && lines.length <= maxLines) return { size, lines: balance(text, font, size, maxWidth, tracking, lines) };
  }
  const lines = wrapLines(text, font, min, maxWidth, tracking) ?? [text];
  const kept = lines.slice(0, maxLines);
  const rest = lines.slice(maxLines - 1).join(" ");
  kept[kept.length - 1] = truncateToWidth(rest, font, min, maxWidth, tracking);
  return { size: min, lines: kept.map((line) => truncateToWidth(line, font, min, maxWidth, tracking)) };
}
