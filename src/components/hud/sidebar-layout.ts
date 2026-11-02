export const SIDEBAR_DEFAULT = 420;
export const SIDEBAR_MIN = 360;
export const SIDEBAR_MAX = 1120;

/** Leave at least 320px of map and the outer gutters visible on desktop. */
export function sidebarMaximum(viewportWidth: number) {
  return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, viewportWidth - 352));
}

export function clampSidebarWidth(width: number, maximum: number) {
  return Math.round(Math.max(SIDEBAR_MIN, Math.min(maximum, width)));
}

export function sidebarKeyboardWidth(key: string, width: number, maximum: number, shift = false) {
  const step = shift ? 80 : 16;
  if (key === "Home") return SIDEBAR_MIN;
  if (key === "End") return maximum;
  if (key === "ArrowLeft") return clampSidebarWidth(width - step, maximum);
  if (key === "ArrowRight") return clampSidebarWidth(width + step, maximum);
  return null;
}
