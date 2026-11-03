import "server-only";

import { takeLimits } from "./rate-limit";

const BUDGETS = {
  answer: [400, 1500],
  search: [120, 600],
  contents: [300, 2000],
  research: [30, 60],
} as const;

/** Reserve on cache misses, immediately before using the shared key, including scheduled work. */
export async function reserveSharedWork(kind: keyof typeof BUDGETS): Promise<void> {
  const [hour, day] = BUDGETS[kind];
  const result = await takeLimits([
    { key: `shared:${kind}:hour`, limit: hour, windowMs: 3_600_000 },
    { key: `shared:${kind}:day`, limit: day, windowMs: 86_400_000 },
  ]);
  if (!result.allowed) throw new Error("Shared service capacity is temporarily unavailable.");
}
