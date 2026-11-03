import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { limit, configs } = vi.hoisted(() => ({ limit: vi.fn(), configs: [] as Record<string, unknown>[] }));
vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    constructor(config: Record<string, unknown>) {
      configs.push(config);
    }
    static fixedWindow = vi.fn(() => ({}));
    limit = limit;
  },
}));

import { clientIp, limitResponse, takeLimits } from "./rate-limit";
import { requestLimits } from "./request-limits";

const rule = { key: "brief:192.0.2.1", limit: 5, windowMs: 60_000 };
const ok = () => ({ success: true, reset: Date.now() + 60_000, pending: Promise.resolve() });

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-only-placeholder");
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
  limit.mockReset().mockResolvedValue(ok());
});

describe("distributed rate limits", () => {
  it("accepts the Vercel integration's KV credential names in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "https://vercel-redis.example.test");
    vi.stubEnv("KV_REST_API_TOKEN", "vercel-test-placeholder");
    expect(await takeLimits([rule])).toEqual({ allowed: true });
    expect(limit).toHaveBeenCalledTimes(1);
  });

  it("never substitutes a read-only token for the write token", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "https://vercel-redis.example.test");
    vi.stubEnv("KV_REST_API_READ_ONLY_TOKEN", "read-only-test-placeholder");
    expect(await takeLimits([rule])).toMatchObject({ allowed: false, unavailable: true });
    expect(limit).not.toHaveBeenCalled();
  });

  it("does not mix credentials from a partial explicit configuration and a KV database", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "https://vercel-redis.example.test");
    vi.stubEnv("KV_REST_API_TOKEN", "vercel-test-placeholder");
    expect(await takeLimits([rule])).toMatchObject({ allowed: false, unavailable: true });
    expect(limit).not.toHaveBeenCalled();
  });

  it("uses the official limiter and sends a hashed identifier, not a raw IP", async () => {
    expect(await takeLimits([rule])).toEqual({ allowed: true });
    expect(limit).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(limit.mock.calls[0][0]).not.toContain("192.0.2.1");
    expect(configs[0]).toMatchObject({ analytics: false, ephemeralCache: false, timeout: 2000 });
  });

  it("keeps buckets independent per IP but stable across resource IDs", async () => {
    await takeLimits([rule]);
    await takeLimits([{ ...rule, key: "brief:192.0.2.2" }]);
    expect(limit.mock.calls[0][0]).not.toBe(limit.mock.calls[1][0]);
    expect(requestLimits("/api/explain/CVE-2024-4577", "GET", "a")).toEqual(requestLimits("/api/explain/CVE-2021-44228", "GET", "a"));
  });

  it("stops before consuming later budgets when an earlier bucket is exhausted", async () => {
    limit.mockResolvedValueOnce({ ...ok(), success: false });
    const result = await takeLimits([rule, { ...rule, key: "shared" }]);
    expect(result).toMatchObject({ allowed: false, unavailable: false });
    expect(limit).toHaveBeenCalledTimes(1);
    const response = limitResponse(result)!;
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("overrides the library's fail-open timeout response", async () => {
    limit.mockResolvedValueOnce({ ...ok(), reason: "timeout" });
    expect(limitResponse(await takeLimits([rule]))?.status).toBe(503);
  });

  it("fails closed on provider errors without exposing the error", async () => {
    limit.mockRejectedValueOnce(new Error("secret upstream detail"));
    const response = limitResponse(await takeLimits([rule]))!;
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  });

  it("fails closed when production credentials are absent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    expect(await takeLimits([rule])).toMatchObject({ allowed: false, unavailable: true });
    expect(limit).not.toHaveBeenCalled();
  });

  it("bounds development requests without requiring credentials", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const local = { key: "local-test", limit: 1, windowMs: 60_000 };
    expect(await takeLimits([local])).toEqual({ allowed: true });
    expect(await takeLimits([local])).toMatchObject({ allowed: false, unavailable: false });
  });
});

describe("trusted client identity", () => {
  it("ignores spoofed alternate headers on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    const request = new Request("https://example.test", {
      headers: { "x-vercel-forwarded-for": "192.0.2.1", "x-real-ip": "192.0.2.2", "x-forwarded-for": "192.0.2.3" },
    });
    expect(clientIp(request)).toBe("192.0.2.1");
    expect(clientIp(new Request("https://example.test", { headers: { "x-forwarded-for": "192.0.2.3" } }))).toBe("unknown");
  });

  it("canonicalises IPv6 spellings", () => {
    vi.stubEnv("VERCEL", "1");
    const request = (ip: string) => new Request("https://example.test", { headers: { "x-vercel-forwarded-for": ip } });
    expect(clientIp(request("2001:0db8:0000:0000:0000:0000:0000:0001"))).toBe(clientIp(request("2001:db8::1")));
    expect(clientIp(request("not-an-ip"))).toBe("unknown");
  });
});

describe("route coverage", () => {
  it("caps checks, MCP, auth, paid work and polling before doing the work", () => {
    for (const path of ["/api/check", "/api/mcp", "/api/auth/token", "/api/brief", "/api/research", "/api/research/a", "/api/explain/a"]) {
      expect(requestLimits(path, "POST", "a").length).toBeGreaterThan(1);
    }
    expect(requestLimits("/api/mcp", "POST", "a").some((rule) => rule.key.startsWith("mcp-hour:"))).toBe(true);
    expect(requestLimits("/api/research/a", "GET", "a").some((rule) => rule.key.startsWith("research-hour:"))).toBe(false);
  });
});
