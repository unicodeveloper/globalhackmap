"use client";

import { useSyncExternalStore } from "react";

const TICK = 30_000;
const listeners = new Set<() => void>();
let timer: number | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) timer = window.setInterval(() => listeners.forEach((notify) => notify()), TICK);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.clearInterval(timer);
  };
}

/**
 * The current time for "5m ago" labels, safe to render on the server. The server and the hydration
 * pass both use `serverNow` (pass the snapshot's generatedAt), so the HTML matches even when a cached
 * page is served hours later; React then swaps in the real clock and refreshes every 30 seconds.
 * Calling Date.now() during render instead makes React discard the server HTML (error #418).
 */
export function useNow(serverNow: number): number {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / TICK) * TICK,
    () => serverNow,
  );
}
