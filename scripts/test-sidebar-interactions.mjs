import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// Uses the browser CLI without adding a project dependency. Run against an existing dev server:
// node scripts/test-sidebar-interactions.mjs
const session = `ghm-sidebar-tests-${process.pid}`;
const base = process.env.GHM_TEST_URL ?? "http://localhost:3000";

function browser(...args) {
  const output = execFileSync("pnpm", ["dlx", "agent-browser", "--session", session, "--json", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60000,
  });
  const response = JSON.parse(output);
  assert.equal(response.success, true, `Browser command failed: ${args[0]}`);
  return response.data;
}

const evaluate = (code) => browser("eval", code).result;
const press = (key) => browser("press", key);
const click = (name) => browser("find", "role", "button", "click", "--name", name);
const wait = (code) => browser("wait", "--fn", code);
const state = () =>
  evaluate(`(() => {
  const panel = document.querySelector('#map-sidebar');
  const handle = document.querySelector('[aria-label="Sidebar width"]');
  const dock = [...document.querySelectorAll('section[aria-label="Patch now"]')].find(el => !panel.contains(el));
  const map = window.__map;
  return {
    width: panel.clientWidth,
    display: getComputedStyle(panel).display,
    height: panel.clientHeight,
    right: panel.getBoundingClientRect().right,
    handleDisplay: getComputedStyle(handle).display,
    value: Number(handle.getAttribute('aria-valuenow')),
    maximum: Number(handle.getAttribute('aria-valuemax')),
    focus: document.activeElement.getAttribute('aria-label') ?? (document.activeElement.tagName === 'BUTTON' ? document.activeElement.textContent.trim() : document.activeElement.tagName),
    padding: map.getPadding(),
    mapCenterX: map.project(map.getCenter()).x,
    canvasWidth: map.getCanvas().clientWidth,
    viewportWidth: innerWidth,
    overflow: document.documentElement.scrollWidth > innerWidth,
    dockLeft: dock.getBoundingClientRect().left,
    dockDisplay: getComputedStyle(dock).display,
    cursor: document.body.style.cursor,
    tabsOverflow: document.querySelector('[aria-label="Live lists"]').scrollWidth > document.querySelector('[aria-label="Live lists"]').clientWidth,
    creditsLeft: parseFloat(getComputedStyle(document.querySelector('.mapboxgl-ctrl-top-left')).left),
    navBottom: document.querySelector('header').getBoundingClientRect().bottom
  };
})()`);

function checkMap(s, left) {
  assert.equal(s.padding.left, left);
  assert.equal(s.canvasWidth, s.viewportWidth);
  assert.ok(Math.abs(s.mapCenterX - (s.viewportWidth + left - s.padding.right) / 2) < 2, "Map camera must follow available space");
  assert.equal(s.overflow, false);
  assert.equal(s.creditsLeft, s.viewportWidth < 768 ? 0 : Math.max(0, left - 8));
}

function drag(from, to) {
  browser("mouse", "move", String(from), "500");
  browser("mouse", "down");
  browser("mouse", "move", String(to), "500", "--steps", "24");
  browser("mouse", "up");
}

try {
  browser("set", "media", "dark", "reduced-motion");
  browser("set", "viewport", "1440", "1000");
  browser("open", `${base}/?still`);
  wait("!!window.__map && window.__map.isStyleLoaded()");
  wait("window.__map.getPadding().left === 452");
  let s = state();
  assert.equal(s.width, 420);
  checkMap(s, 452);

  click("Close sidebar");
  s = state();
  assert.equal(s.display, "none");
  assert.equal(s.focus, "Show sidebar");
  assert.equal(s.dockLeft, 16);
  checkMap(s, 0);
  click("Show sidebar");
  s = state();
  assert.equal(s.width, 420);
  assert.equal(s.focus, "Close sidebar");
  console.log("PASS close/reopen: no reserved width, dock at 16px, focus restored");

  drag(436, 200);
  s = state();
  assert.equal(s.width, 360);
  assert.equal(s.tabsOverflow, false);
  assert.equal(s.cursor, "");
  checkMap(s, 392);
  drag(376, 1036);
  s = state();
  assert.equal(s.width, 1020);
  assert.equal(s.value, 1020);
  assert.equal(s.focus, "Sidebar width");
  assert.equal(s.dockDisplay, "none");
  checkMap(s, 1052);
  click("Close sidebar");
  checkMap(state(), 0);
  click("Show sidebar");
  assert.equal(state().width, 1020);
  drag(1036, 1438);
  assert.equal(state().width, 1088);
  console.log("PASS pointer drag: 420 -> 360 -> 1020 -> 1088px viewport maximum; map follows");

  press("Home");
  assert.equal(state().width, 360);
  press("ArrowRight");
  assert.equal(state().width, 376);
  press("Shift+ArrowRight");
  assert.equal(state().width, 456);
  press("ArrowLeft");
  assert.equal(state().width, 440);
  press("End");
  s = state();
  assert.equal(s.width, s.maximum);
  assert.equal(s.viewportWidth - s.padding.left, 320);
  checkMap(s, 1120);
  console.log("PASS keyboard: Home, End, 16px arrows, 80px Shift arrows, accessible values");

  browser("set", "viewport", "1920", "1000");
  wait("window.__map.getCanvas().clientWidth === 1920");
  press("End");
  s = state();
  assert.equal(s.width, 1120);
  checkMap(s, 1152);
  browser("set", "viewport", "768", "900");
  wait("window.__map.getPadding().left === 448");
  s = state();
  assert.equal(s.width, 416);
  assert.equal(s.maximum, 416);
  assert.ok(s.right <= 768);
  checkMap(s, 448);
  console.log("PASS desktop bounds: 1120px on 1920px viewport; clamps to 416px at 768px");

  click("Close sidebar");
  press("Control+k");
  wait("document.activeElement.getAttribute('role') === 'combobox'");
  assert.notEqual(state().display, "none");
  press("Escape");
  console.log("PASS search shortcut reopens sidebar and focuses search");

  browser("set", "viewport", "390", "844");
  browser("screenshot");
  wait("window.__map.getCanvas().clientWidth === 390");
  s = state();
  assert.equal(s.width, 390);
  assert.equal(s.handleDisplay, "none");
  assert.ok(Math.abs(s.height - 844 * 0.52) < 2);
  assert.equal(s.overflow, false);
  click("Expand the panel");
  wait("document.querySelector('#map-sidebar').clientHeight > 700");
  assert.ok(Math.abs(state().height - Math.min(844 * 0.88, 844 - state().navBottom - 8)) < 2);
  click("Close sidebar");
  wait("window.__map.getPadding().bottom === 0");
  s = state();
  assert.equal(s.display, "none");
  assert.equal(s.focus, "Show sidebar");
  checkMap(s, 0);
  click("Show sidebar");
  assert.equal(state().focus, "Close sidebar");
  assert.ok(Math.abs(state().height - Math.min(844 * 0.88, 844 - state().navBottom - 8)) < 2);
  click("Show more of the map");
  wait("document.querySelector('#map-sidebar').clientHeight < 440");
  console.log("PASS mobile 390x844: full-width sheet, expanded height stays below navigation, no resize handle, close/reopen unobstructed");
  browser("set", "viewport", "1440", "1000");
  browser("screenshot");
  wait("window.__map.getPadding().left === 1120");
  assert.equal(state().width, 1088);
  assert.notEqual(state().handleDisplay, "none");
  console.log("PASS return to desktop: preferred wide width restored and clamped to viewport");
} catch (error) {
  console.error("Sidebar browser failure state:", state());
  console.error(
    "Map container bounds:",
    evaluate(
      "({map:document.querySelector('.mapboxgl-map').getBoundingClientRect().toJSON(),canvas:window.__map.getCanvas().getBoundingClientRect().toJSON(),focus:document.activeElement.getAttribute('role')})",
    ),
  );
  console.error("Failure screenshot:", browser("screenshot"));
  throw error;
} finally {
  browser("close");
}
