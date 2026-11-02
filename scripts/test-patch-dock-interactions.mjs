import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// Run against an existing dev server: node scripts/test-patch-dock-interactions.mjs
const session = `ghm-patch-dock-tests-${process.pid}`;
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
const click = (name) => browser("find", "role", "button", "click", "--name", name, "--exact");
const press = (key) => browser("press", key);
const wait = (code) => browser("wait", "--fn", code);
const visible = `el => !!el && !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'`;
const state = () =>
  evaluate(`(() => {
  const dock = document.querySelector('#patch-now-dock');
  const show = document.querySelector('[aria-label="Show Patch now"]');
  const hide = document.querySelector('[aria-label="Hide Patch now"]');
  const panel = document.querySelector('#map-sidebar');
  const rail = panel.querySelector('section[aria-label="Patch now"]');
  const details = document.querySelector('aside.drawer-surface');
  const isVisible = ${visible};
  const rect = el => el?.getBoundingClientRect().toJSON();
  const hit = el => {
    if (!isVisible(el)) return false;
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  };
  return {
    open: isVisible(dock), restore: isVisible(show),
    dock: rect(dock), show: rect(show), details: rect(details),
    showHit: hit(show), hideHit: hit(hide),
    expanded: hide?.getAttribute('aria-expanded'), collapsed: show?.getAttribute('aria-expanded'),
    controls: show?.getAttribute('aria-controls'),
    focus: document.activeElement.getAttribute('aria-label') ?? document.activeElement.tagName,
    focusInDock: dock?.contains(document.activeElement),
    cardLabels: [...dock.querySelectorAll('ul button')].map(el => el.getAttribute('aria-label')),
    scroll: dock.querySelector('ul').scrollLeft,
    headerOverflow: dock.firstElementChild.scrollWidth > dock.firstElementChild.clientWidth,
    headerWithinDock: [...dock.firstElementChild.querySelectorAll('button')].filter(isVisible).every(el => {
      const r = el.getBoundingClientRect(), d = dock.getBoundingClientRect();
      return r.left >= d.left && r.right <= d.right;
    }),
    railCards: rail?.querySelectorAll('ul button').length ?? 0,
    railVisible: isVisible(rail),
    railToggleCount: rail?.querySelectorAll('[aria-label="Hide Patch now"], [aria-label="Show Patch now"]').length ?? 0,
    width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
    padding: window.__map?.getPadding(), canvasWidth: window.__map?.getCanvas().clientWidth,
    cve: new URL(location.href).searchParams.get('cve'),
    incident: new URL(location.href).searchParams.get('i')
  };
})()`);

function checkHidden(s) {
  assert.equal(s.open, false);
  assert.equal(s.restore, true);
  assert.equal(s.showHit, true, "Restore control must not be obstructed");
  assert.equal(s.focus, "Show Patch now");
  assert.equal(s.collapsed, "false");
  assert.equal(s.controls, "patch-now-dock");
  assert.equal(s.canvasWidth, s.width);
  assert.equal(s.padding.bottom, 96, "Folding the dock should not move the camera");
}

function checkOpen(s) {
  assert.equal(s.open, true);
  assert.equal(s.restore, false);
  assert.equal(s.hideHit, true, "Hide control must not be obstructed");
  assert.equal(s.expanded, "true");
  assert.equal(s.headerOverflow, false);
  assert.equal(s.headerWithinDock, true);
  assert.equal(s.overflow, false);
}

function viewport(width, height = 1000) {
  browser("set", "viewport", String(width), String(height));
  // A rendered frame settles viewport and ResizeObserver work before checking layout.
  browser("screenshot");
  wait(`window.__map.getCanvas().clientWidth === ${width}`);
}

function resizeSidebar(key) {
  browser("focus", '[aria-label="Sidebar width"]');
  press(key);
}

try {
  browser("set", "media", "dark", "reduced-motion");
  browser("set", "viewport", "1440", "1000");
  // CVE selection is a UI check only. Never trigger the paid explainer endpoint.
  browser("network", "route", "**/api/explain/**", "--abort");
  browser("network", "route", "**/api/brief", "--abort");
  browser("open", `${base}/?still`);
  wait("!!window.__map && window.__map.isStyleLoaded()");
  wait("document.querySelectorAll('#patch-now-dock ul button').length > 0");
  checkOpen(state());

  click("Hide Patch now");
  checkHidden(state());
  click("Show Patch now");
  assert.equal(state().focus, "Hide Patch now");
  checkOpen(state());
  press("Enter");
  checkHidden(state());
  press("Space");
  assert.equal(state().focus, "Hide Patch now");
  checkOpen(state());
  press("Space");
  checkHidden(state());
  press("Enter");
  checkOpen(state());
  console.log("PASS click, Enter and Space hide/reopen, accessible state, focus transfer, stable camera");

  browser("click", "#patch-now-dock ul li:first-child button");
  wait("!!document.querySelector('aside.drawer-surface') && new URL(location.href).searchParams.has('cve')");
  wait("document.querySelector('#patch-now-dock').getBoundingClientRect().width === 512");
  browser("find", "role", "button", "click", "--name", "Next", "--exact");
  wait("document.querySelector('#patch-now-dock ul').scrollLeft >= 607");
  const selected = state();
  assert.ok(selected.cve);
  click("Hide Patch now");
  checkHidden(state());
  assert.ok(state().show.right < state().details.left);
  press("Enter");
  const restored = state();
  assert.equal(restored.cve, selected.cve);
  assert.deepEqual(restored.cardLabels, selected.cardLabels);
  assert.ok(Math.abs(restored.scroll - selected.scroll) < 2, "Carousel position should survive folding");
  checkOpen(restored);
  browser("click", 'aside [aria-label="Close"]');
  console.log("PASS selected CVE, card order and carousel scroll survive toggles with right details open");

  resizeSidebar("Home");
  click("Hide Patch now");
  checkHidden(state());
  assert.equal(state().show.left, 392);
  click("Close sidebar");
  assert.equal(state().show.left, 16);
  assert.equal(state().showHit, true);
  click("Show Patch now");
  checkOpen(state());
  click("All vulnerabilities");
  assert.equal(evaluate("document.querySelector('[role=tab][data-active=true]').textContent.includes('CVEs')"), true);
  assert.equal(evaluate("getComputedStyle(document.querySelector('#map-sidebar')).display !== 'none'"), true);
  console.log("PASS narrow/closed sidebar positioning and existing All vulnerabilities action");

  resizeSidebar("End");
  assert.equal(state().open, false);
  assert.equal(state().restore, false);
  assert.equal(state().focus, "Sidebar width");
  resizeSidebar("Home");
  checkOpen(state());
  click("Hide Patch now");
  resizeSidebar("End");
  assert.equal(state().restore, false);
  resizeSidebar("Home");
  assert.equal(state().open, false);
  assert.equal(state().restore, true);
  click("Show Patch now");
  console.log("PASS wide sidebar auto-hiding, no stranded restore control, manual preference retained");

  viewport(848);
  checkOpen(state());
  assert.equal(state().dock.width, 440);
  browser("focus", '[aria-label="Hide Patch now"]');
  viewport(847);
  assert.equal(state().open, false);
  assert.equal(state().restore, false);
  assert.equal(state().focusInDock, false);
  viewport(848);
  checkOpen(state());
  viewport(1440);
  console.log("PASS exact 440px minimum: all header actions fit; at 439px dock and controls disappear safely");

  browser("find", "role", "tab", "click", "--name", "Breaches");
  wait("document.querySelector('[role=tab][data-active=true]').textContent.includes('Breaches')");
  browser("click", "#map-sidebar [role=tabpanel] button");
  wait("!!document.querySelector('aside.drawer-surface') && new URL(location.href).searchParams.has('i')");
  const incident = state().incident;
  click("Hide Patch now");
  checkHidden(state());
  assert.ok(state().show.right < state().details.left);
  press("Enter");
  assert.equal(state().incident, incident);
  checkOpen(state());
  click("Hide Patch now");
  resizeSidebar("End");
  assert.equal(state().restore, false);
  click("Close sidebar");
  assert.equal(state().restore, true);
  assert.equal(state().showHit, true);
  assert.equal(state().show.left, 16);
  browser("click", 'aside [aria-label="Close"]');
  click("Show sidebar");
  resizeSidebar("Home");
  console.log("PASS incident details: unobstructed restore, selection retained, sidebar overlap avoided");

  press("c");
  assert.equal(state().open, false);
  assert.equal(state().restore, false);
  press("Escape");
  assert.equal(state().restore, true);
  viewport(390, 844);
  assert.equal(state().open, false);
  assert.equal(state().restore, false);
  click("Expand the panel");
  wait("document.querySelector('#map-sidebar').clientHeight > 740");
  assert.ok(state().railCards > 0);
  assert.equal(state().railVisible, true);
  assert.equal(state().railToggleCount, 0);
  assert.equal(state().overflow, false);
  assert.equal(evaluate("document.querySelector('#map-sidebar section[aria-label=\"Patch now\"] ul li').getBoundingClientRect().width"), 272);
  viewport(1440);
  assert.equal(state().restore, true);
  assert.equal(state().open, false);
  console.log("PASS cinema clean; mobile rail unchanged, no dock toggle controls; hidden preference survives mobile round trip");
} catch (error) {
  console.error("Patch dock failure state:", state());
  console.error("Failure screenshot:", browser("screenshot"));
  throw error;
} finally {
  browser("close");
}
