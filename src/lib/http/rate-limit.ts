import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface Limit {
  key: string;
  limit: number;
  windowMs: number;
}

export type LimitResult = { allowed: true } | { allowed: false; retryAfter: number; unavailable: boolean };

const local = new Map<string, { count: number; expires: number }>();
const limiters = new Map<string, Ratelimit>();

function localLimit(limits: Limit[]): LimitResult {
  const now = Date.now();
  for (const [key, value] of local) if (value.expires <= now) local.delete(key);
  if (local.size + limits.length > 10_000) return { allowed: false, retryAfter: 60, unavailable: true };
  for (const item of limits) {
    const value = local.get(item.key);
    if (value && value.count >= item.limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((value.expires - now) / 1000)), unavailable: false };
  }
  for (const item of limits) {
    const value = local.get(item.key) ?? { count: 0, expires: now + item.windowMs };
    value.count++;
    local.set(item.key, value);
  }
  return { allowed: true };
}

/** Official Upstash counters shared by every instance. Production never falls back to local memory. */
export async function takeLimits(limits: Limit[]): Promise<LimitResult> {
  if (!limits.length) return { allowed: true };
  // Vercel's integration can expose the KV_* names. Keep credential pairs together.
  const explicit = Boolean(process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_TOKEN);
  const url = explicit ? process.env.UPSTASH_REDIS_REST_URL : process.env.KV_REST_API_URL;
  const token = explicit ? process.env.UPSTASH_REDIS_REST_TOKEN : process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV !== "production") return localLimit(limits);
    return { allowed: false, retryAfter: 60, unavailable: true };
  }
  try {
    if (new URL(url).protocol !== "https:") throw new Error("Invalid limiter URL");
    for (const item of limits) {
      const configKey = `${url}:${item.limit}:${item.windowMs}`;
      let limiter = limiters.get(configKey);
      if (!limiter) {
        limiter = new Ratelimit({
          redis: new Redis({ url, token, retry: false, signal: () => AbortSignal.timeout(2000) }),
          limiter: Ratelimit.fixedWindow(item.limit, `${item.windowMs} ms`),
          prefix: `ghm:limit:v1:${item.limit}:${item.windowMs}`,
          analytics: false,
          ephemeralCache: false,
          timeout: 2000,
        });
        limiters.set(configKey, limiter);
      }
      const key = createHmac("sha256", token).update(item.key).digest("hex");
      const result = await limiter.limit(key);
      // The library defaults to allowing timeouts. Explicitly override that for spend protection.
      void result.pending.catch(() => undefined);
      if (result.reason === "timeout") return { allowed: false, retryAfter: 60, unavailable: true };
      if (!result.success) return { allowed: false, retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)), unavailable: false };
    }
    return { allowed: true };
  } catch {
    // Never echo the Redis response, URL or credentials to clients or logs.
    return { allowed: false, retryAfter: 60, unavailable: true };
  }
}

/** Trust Vercel's overwritten client-IP header, never a visitor-provided alternate header. */
export function clientIp(request: Request): string {
  const value =
    process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") : (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for"));
  const ip = value?.split(",")[0]?.trim();
  if (!ip || !isIP(ip)) return "unknown";
  return isIP(ip) === 6 ? new URL(`http://[${ip}]`).hostname : ip;
}

export function limitResponse(result: LimitResult): Response | null {
  if (result.allowed) return null;
  return Response.json(
    { error: result.unavailable ? "Request protection is temporarily unavailable. Please try again shortly." : "Too many requests. Please try again shortly." },
    { status: result.unavailable ? 503 : 429, headers: { "Retry-After": String(result.retryAfter), "Cache-Control": "private, no-store" } },
  );
}
