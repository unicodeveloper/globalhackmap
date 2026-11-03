import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const session = `ghm-navigation-tests-${process.pid}`;
const base = process.env.GHM_TEST_URL ?? "http://localhost:3000";
const browser = (...args) => {
  const output = execFileSync("pnpm", ["dlx", "agent-browser", "--session", session, "--json", ...args], { encoding: "utf8", timeout: 60000 });
  const response = JSON.parse(output);
  assert.equal(response.success, true);
  return response.data;
};
const evaluate = (code) => browser("eval", code).result;
const wait = (code) => browser("wait", "--fn", code);

try {
  browser("set", "viewport", "1440", "900");
  browser("open", `${base}/?still`);
  const ready = `!!window.__map && window.__map.isStyleLoaded() && document.querySelectorAll('canvas').length === 2`;
  wait(ready);
  evaluate(`window.__oldAtlas = [...document.querySelectorAll('canvas')].find(c => !c.classList.contains('mapboxgl-canvas'))`);
  for (const mode of ["back", "home", "back"]) {
    browser("find", "role", "link", "click", "--name", "Agents", "--exact");
    wait("location.pathname === '/agents'");
    if (mode === "home") browser("find", "role", "link", "click", "--name", "Global Hack Map home");
    else browser("back");
    wait(ready);
    const state = evaluate(`(() => {
      const canvases = [...document.querySelectorAll('canvas')].filter(c => c.checkVisibility());
      return {count:canvases.length, lost:canvases.some(c => c.getContext('webgl2')?.isContextLost()), oldConnected:window.__oldAtlas.isConnected};
    })()`);
    assert.equal(state.count, 2);
    assert.equal(state.lost, false, "Restored canvases must have live contexts");
    assert.equal(state.oldConnected, false, "Disposed Atlas canvases must be removed");
    if (mode === "back") {
      browser("forward");
      wait("location.pathname === '/agents'");
      browser("back");
      wait(ready);
    }
  }
  console.log("PASS homepage link, Back and Forward: fresh Atlas canvas, live WebGL, no leaked canvases");
} finally {
  browser("close");
}
