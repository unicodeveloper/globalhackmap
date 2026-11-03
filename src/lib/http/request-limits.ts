import type { Limit } from "./rate-limit";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Buckets ignore query strings and resource IDs, so cycling CVEs cannot reset an allowance. */
export function requestLimits(path: string, method: string, ip: string): Limit[] {
  if (!path.startsWith("/api/"))
    return [
      { key: `lookup-burst:${ip}`, limit: 30, windowMs: MINUTE },
      { key: `lookup-hour:${ip}`, limit: 180, windowMs: HOUR },
    ];
  const limits: Limit[] = [{ key: `api:${ip}`, limit: 180, windowMs: MINUTE }];
  const add = (name: string, limit: number, windowMs = MINUTE) => limits.push({ key: `${name}:${ip}`, limit, windowMs });
  if (path === "/api/brief") {
    add("brief-burst", 6);
    add("brief-hour", 30, HOUR);
  } else if (path === "/api/research" && method === "POST") {
    add("research-burst", 2);
    add("research-hour", 3, HOUR);
  } else if (path === "/api/check") {
    add("check-burst", 10);
    add("check-hour", 60, HOUR);
  } else if (path === "/api/mcp") {
    add("mcp-burst", 30);
    add("mcp-hour", 300, HOUR);
  } else if (path === "/api/auth/token") add("token", 10);
  else if (path.startsWith("/api/research/")) add("research-poll", 30);
  else if (path.startsWith("/api/explain/")) add("explain", 30);
  return limits;
}
