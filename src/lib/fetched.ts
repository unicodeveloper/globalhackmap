/**
 * What a cached fetch returns instead of throwing. During prerendering a rejected `use cache` call fails
 * the page even when the caller catches it, so cached functions settle to a result and a failure gets a
 * short lifetime; the uncached wrapper rethrows outside the cache scope, where it is an ordinary error.
 */
export type Fetched<T> = { ok: true; value: T } | { ok: false; error: string };

export async function settle<T>(work: () => Promise<T>): Promise<Fetched<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function unwrap<T>(result: Fetched<T>): T {
  if (result.ok) return result.value;
  throw new Error(result.error);
}

/** Settles to `fallback` once `ms` passes. The work carries on and, if cached, fills its entry for next time. */
export function beforeDeadline<T, F>(work: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<F>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
