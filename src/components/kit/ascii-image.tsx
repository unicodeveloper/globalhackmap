"use client";

import { useEffect, useRef } from "react";

const RAMP = " .,:;-=+*xo%#@";

/**
 * Renders an image as glyphs on a 2D canvas: the same language as the Atlas hero, for pages
 * without the globe. Draws once, then lets a few glyphs flicker unless motion is reduced.
 */
export function AsciiImage({
  src,
  crop = { x: 0, y: 0, w: 1, h: 1 },
  cell = 7,
  className,
  fade = 0.6,
}: {
  src: string;
  /** Region of the source image to draw, as fractions. */
  crop?: { x: number; y: number; w: number; h: number };
  cell?: number;
  className?: string;
  /** Where the bottom fade starts, as a fraction of height (1 = no fade). */
  fade?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.src = src;

    const render = () => {
      if (cancelled || !image.naturalWidth) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const cellH = Math.round(cell * 1.55);
      const cols = Math.floor(width / cell);
      const rows = Math.floor(height / cellH);
      const sample = document.createElement("canvas");
      sample.width = cols;
      sample.height = rows;
      const sctx = sample.getContext("2d", { willReadFrequently: true })!;
      const sx = crop.x * image.naturalWidth;
      const sy = crop.y * image.naturalHeight;
      const sw = crop.w * image.naturalWidth;
      const sh = crop.h * image.naturalHeight;
      // Cover-fit the crop into the grid.
      const scale = Math.max(cols / sw, rows / (sh / 1.55));
      const dw = sw * scale;
      const dh = (sh / 1.55) * scale;
      sctx.drawImage(image, sx, sy, sw, sh, (cols - dw) / 2, (rows - dh) / 2, dw, dh);
      const data = sctx.getImageData(0, 0, cols, rows).data;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim() || "monospace";
      ctx.font = `500 ${cell * 1.4}px ${mono}, ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const levels = new Float32Array(cols * rows);
      for (let i = 0; i < cols * rows; i++) {
        const lum = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
        const y = Math.floor(i / cols) / rows;
        const fadeOut = y < fade ? 1 : Math.max(0, 1 - (y - fade) / (1 - fade));
        levels[i] = Math.max(0, Math.min(1, (lum - 0.06) / 0.86)) * fadeOut;
      }

      const draw = (time: number) => {
        ctx.clearRect(0, 0, width, height);
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const level = levels[y * cols + x];
            if (level < 0.05) continue;
            let index = Math.round(level * (RAMP.length - 1));
            const n = Math.sin(x * 12.9898 + y * 78.233 + Math.floor(time / 160) * 1.7) * 43758.5453;
            if (time && n - Math.floor(n) > 0.995) index = 1 + Math.floor((n * 7) % (RAMP.length - 1));
            if (index < 1) continue;
            ctx.fillStyle = `rgba(237, 240, 244, ${0.12 + level * 0.62})`;
            ctx.fillText(RAMP[index], x * cell + cell / 2, y * cellH + cellH / 2);
          }
        }
      };

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        draw(0);
        return;
      }
      let last = 0;
      const tick = (now: number) => {
        frame = requestAnimationFrame(tick);
        if (document.hidden || now - last < 120) return;
        last = now;
        draw(now);
      };
      frame = requestAnimationFrame(tick);
    };

    image.onload = () => void document.fonts.ready.then(render);
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      render();
    });
    observer.observe(canvas);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [src, crop.x, crop.y, crop.w, crop.h, cell, fade]);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
