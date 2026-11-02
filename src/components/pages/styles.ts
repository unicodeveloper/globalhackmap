/** Pill buttons, matching the app: primary is ink on space, secondary an inset ring, tertiary a text action. */
export const PRIMARY =
  "press inline-flex h-10 items-center justify-center gap-2 rounded-full bg-ink px-4.5 text-[13.5px] font-medium text-space hover:bg-white";

export const SECONDARY =
  "press inline-flex h-10 items-center justify-center gap-2 rounded-full px-4.5 text-[13.5px] text-ink-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)] hover:bg-white/[0.05] hover:text-ink";

export const TERTIARY = "press inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] text-ink-3 hover:bg-white/[0.05] hover:text-ink";

export const CHIP =
  "press inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] text-ink-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] hover:bg-white/[0.05] hover:text-ink";

/** A tile groups one idea: a stat with its breakdown, a verdict with its fix. */
export const TILE = "rounded-[18px] bg-surface";

/** Kept for pages outside this set that still import it. */
export const CARD = TILE;

/** A list row: quiet until hovered. */
export const ROW = "flex items-center gap-3 rounded-[14px] px-3 py-2 transition-colors duration-150 hover:bg-white/[0.04]";

export const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-4";

export const PROSE = "max-w-[68ch] text-pretty";
