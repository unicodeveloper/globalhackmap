import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const session = `ghm-responsive-tests-${process.pid}`;
const base = process.env.GHM_TEST_URL ?? "http://localhost:3000";
const browser = (...args) => {
  const response = JSON.parse(execFileSync("pnpm", ["dlx", "agent-browser", "--session", session, "--json", ...args], { encoding: "utf8", timeout: 60000 }));
  assert.equal(response.success, true);
  return response.data;
};
const evaluate = (code) => browser("eval", code).result;
const snapshot = await fetch(`${base}/api/snapshot`).then((r) => r.json());
const incident = snapshot.incidents?.[0]?.id;
const cve = snapshot.kev?.[0]?.cve ?? "CVE-2021-44228";
const routes = [
  "/",
  "/check",
  "/check/share?n=12&e=2&m=1&l=3&c=4",
  "/agents",
  "/cve",
  "/brief",
  "/pricing",
  "/country/US",
  `/cve/${cve}`,
  ...(incident ? [`/incident/${incident}`] : []),
];
const failures = [];

try {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [568, 320],
    [768, 1024],
    [1024, 768],
    [1440, 900],
  ]) {
    browser("set", "viewport", String(width), String(height));
    for (const route of routes) {
      browser("open", `${base}${route}${route === "/" ? "?still" : ""}`);
      browser("wait", "--fn", "!!document.querySelector('h1')");
      const result = evaluate(`(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        heading: [...document.querySelectorAll('h1')].find(e => e.checkVisibility())?.getBoundingClientRect().toJSON(),
        overflow: [...document.querySelectorAll('main *, header')].filter(e => e.checkVisibility() && e.getBoundingClientRect().right > innerWidth + 1).slice(0,8).map(e => ({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width}))
      }))()`);
      if (result.scroll > width + 1 || result.heading?.right > width + 1) failures.push({ route, width, height, ...result });
    }
    console.log(`CHECKED ${width}x${height}: ${routes.length} page types`);
  }
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
  console.log("PASS responsive page matrix: no page-level horizontal overflow");
} finally {
  browser("close");
}
