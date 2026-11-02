/** Class names for the check pages. Plain strings, so server components can use them too. */

/** One idea per tile: a verdict with its breakdown, a finding with its fix. */
export const TILE = "rounded-[18px] bg-surface";

/** A tile that brightens its ring while something inside it has focus. */
export const TILE_FOCUS = "transition-shadow duration-200 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ink";

export const DIVIDER = "border-white/[0.06]";

export const BUTTON_PRIMARY =
  "press inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-ink px-4 text-[14px] font-medium text-space hover:bg-white disabled:cursor-not-allowed disabled:bg-white/[0.07] disabled:text-ink-4 disabled:active:scale-100";

export const BUTTON_SECONDARY =
  "press inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] text-ink-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)] hover:bg-white/[0.05] hover:text-ink";

export const BUTTON_TERTIARY =
  "press inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] text-ink-3 hover:bg-white/[0.05] hover:text-ink";

export const LINK = "text-ink-2 underline decoration-white/20 underline-offset-[3px] transition-colors hover:text-ink hover:decoration-ink";

export const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-4";
