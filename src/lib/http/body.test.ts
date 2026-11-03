import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readBoundedBody } from "./body";

describe("bounded request bodies", () => {
  it("accepts bytes at the boundary and rejects a misleading Content-Length", async () => {
    const request = new Request("https://example.test", { method: "POST", body: "hello", headers: { "Content-Length": "1" } });
    expect(await readBoundedBody(request, 5)).toEqual(new TextEncoder().encode("hello"));
    expect(await readBoundedBody(new Request("https://example.test", { method: "POST", body: "hello" }), 4)).toBeNull();
  });
  it("counts UTF-8 bytes and stops oversized chunked streams", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("éé"));
        controller.enqueue(new TextEncoder().encode("éé"));
        controller.close();
      },
    });
    const request = new Request("https://example.test", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect(await readBoundedBody(request, 5)).toBeNull();
  });
});
