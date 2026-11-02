import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "ghm_q";
export const FREE_BRIEFS_PER_DAY = 5;

function secret(): string | null {
  const value = process.env.SESSION_SECRET ?? process.env.CRON_SECRET;
  if (value) return value;
  return process.env.NODE_ENV === "production" ? null : "local-dev-secret";
}

function sign(value: string, key: string): string {
  return createHmac("sha256", key).update(value).digest("base64url").slice(0, 22);
}

/** A signed per-browser daily counter for anonymous AI briefs. Not a security boundary, a courtesy limit. */
export async function takeFreeBrief(): Promise<{ allowed: boolean; remaining: number }> {
  const key = secret();
  // A production deployment without a signing secret offers no free briefs rather than forgeable ones.
  if (!key) return { allowed: false, remaining: 0 };
  const jar = await cookies();
  const today = new Date().toISOString().slice(0, 10);
  let count = 0;
  const raw = jar.get(COOKIE)?.value;
  if (raw) {
    const [payload, mac] = raw.split(".");
    const expected = sign(payload ?? "", key);
    const valid = mac && mac.length === expected.length && timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
    const [day, n] = (payload ?? "").split(":");
    if (valid && day === today) count = Number(n) || 0;
  }
  if (count >= FREE_BRIEFS_PER_DAY) return { allowed: false, remaining: 0 };
  count += 1;
  const payload = `${today}:${count}`;
  jar.set(COOKIE, `${payload}.${sign(payload, key)}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 26 });
  return { allowed: true, remaining: FREE_BRIEFS_PER_DAY - count };
}
