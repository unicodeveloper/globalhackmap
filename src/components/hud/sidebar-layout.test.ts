import { describe, expect, it } from "vitest";

import { clampSidebarWidth, sidebarKeyboardWidth, sidebarMaximum } from "./sidebar-layout";

describe("sidebar layout", () => {
  it("allows generous expansion without consuming the map viewport", () => {
    expect(sidebarMaximum(1920)).toBe(1120);
    expect(sidebarMaximum(1280)).toBe(928);
    expect(sidebarMaximum(768)).toBe(416);
    for (const viewport of [768, 1024, 1280, 1440, 1920]) {
      expect(viewport - sidebarMaximum(viewport) - 32).toBeGreaterThanOrEqual(320);
    }
  });

  it("clamps pointer widths at both edges and rounds fractional positions", () => {
    expect(clampSidebarWidth(-500, 928)).toBe(360);
    expect(clampSidebarWidth(2000, 928)).toBe(928);
    expect(clampSidebarWidth(543.6, 928)).toBe(544);
  });

  it("supports arrow steps, larger Shift steps, Home and End", () => {
    expect(sidebarKeyboardWidth("ArrowLeft", 420, 928)).toBe(404);
    expect(sidebarKeyboardWidth("ArrowRight", 420, 928)).toBe(436);
    expect(sidebarKeyboardWidth("ArrowRight", 420, 928, true)).toBe(500);
    expect(sidebarKeyboardWidth("ArrowLeft", 370, 928, true)).toBe(360);
    expect(sidebarKeyboardWidth("ArrowRight", 920, 928)).toBe(928);
    expect(sidebarKeyboardWidth("Home", 600, 928)).toBe(360);
    expect(sidebarKeyboardWidth("End", 600, 928)).toBe(928);
    expect(sidebarKeyboardWidth("Escape", 600, 928)).toBeNull();
  });
});
