import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = process.env.GHM_TEST_URL ?? "http://localhost:3000";
const url = new URL("/api/mcp", base);
const client = new Client({ name: "globalhackmap-protocol-test", version: "1.0.0" });

try {
  await client.connect(new StreamableHTTPClientTransport(url));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["check_stack", "get_cve", "get_incident", "get_situation", "patch_now", "search_incidents"]);
  assert.ok(tools.every((tool) => tool.annotations?.readOnlyHint === true));
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(Array.isArray(result.content), `${name}: missing content`);
    if (!result.isError) assert.ok(result.structuredContent && "data" in result.structuredContent, `${name}: missing structured data`);
    return result;
  };
  const situation = await call("get_situation");
  assert.notEqual(situation.isError, true);
  const snapshot = JSON.parse(situation.content[1].text);
  assert.ok(snapshot.generated_at);
  if (snapshot.incidents.length) {
    const incident = await call("get_incident", { id: snapshot.incidents[0].id });
    assert.notEqual(incident.isError, true);
    const record = JSON.parse(incident.content[1].text);
    assert.ok(record.sources.length);
    assert.ok(["confirmed", "reported", "claimed", "precautionary", "disputed"].includes(record.status));
  }
  const cve = await call("get_cve", { cve: snapshot.cves[0]?.cve ?? "CVE-2021-44228" });
  assert.notEqual(cve.isError, true);
  const search = await call("search_incidents", { country: "US", since_days: 7, limit: 2 });
  assert.notEqual(search.isError, true);
  assert.ok(JSON.parse(search.content[1].text).incidents.length <= 2);
  assert.notEqual((await call("search_incidents", { status: "disputed" })).isError, true);
  const patch = await call("patch_now");
  assert.notEqual(patch.isError, true);
  const check = await call("check_stack", { input: "GitLab 17.2" });
  assert.notEqual(check.isError, true);
  const missing = await call("get_incident", { id: "does-not-exist" });
  assert.equal(missing.isError, true);
  assert.equal(JSON.parse(missing.content[1].text).error, "not_found");
  for (const [name, args] of [
    ["get_cve", { cve: "not-a-cve" }],
    ["search_incidents", { limit: 1000 }],
    ["check_stack", { input: "" }],
  ]) {
    const invalid = await call(name, args);
    assert.equal(invalid.isError, true, `${name}: invalid arguments should be rejected`);
  }
  console.log("PASS MCP SDK initialize, tool discovery, six tools, input validation and not-found semantics");
} finally {
  await client.close();
}

const foreign = await fetch(url, {
  method: "POST",
  headers: { Origin: "https://unrelated.example", "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
});
assert.equal(foreign.status, 403, "Foreign browser origins should be rejected");
console.log("PASS foreign browser origin rejected");

const malformed = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
  body: "{",
});
assert.equal(malformed.status, 400);
const batch = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "[]" });
assert.equal(batch.status, 400);
const oversized = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: " ".repeat(1_048_577) });
assert.equal(oversized.status, 413);
console.log("PASS malformed JSON, batching and oversized requests rejected");
