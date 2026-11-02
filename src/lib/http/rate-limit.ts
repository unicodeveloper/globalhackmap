import "server-only";

const hits = new Map<string, number[]>();

/**
 * Sliding-window limit held in this server instance's memory. Not shared across instances, so it
 * caps abuse per instance rather than exactly; it needs no storage to run.
 */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  hits.set(key, recent);
  if (recent.length >= limit) return false;
  recent.push(now);
  if (hits.size > 5_000) {
    for (const [other, times] of hits) if (!times.some((at) => now - at < windowMs)) hits.delete(other);
  }
  return true;
}

/** The caller's IP as reported by the platform proxy. */
export function clientIp(request: Request): string {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
