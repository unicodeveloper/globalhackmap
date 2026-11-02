"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*/<>=+";

/**
 * Scramble-to-resolve reveal for names arriving on the map. Runs once per text value,
 * left to right, and renders the final text immediately under reduced motion.
 */
export function DecryptText({ text, duration = 700, className }: { text: string; duration?: number; className?: string }) {
  const [shown, setShown] = useState(text);
  const reduced = useReducedMotion();
  const frame = useRef(0);

  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const resolved = Math.floor(progress * text.length);
      let next = text.slice(0, resolved);
      for (let i = resolved; i < text.length; i++) {
        const ch = text[i];
        next += ch === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      setShown(next);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [text, duration, reduced]);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden>{reduced ? text : shown}</span>
    </span>
  );
}
