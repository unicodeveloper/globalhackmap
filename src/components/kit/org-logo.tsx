"use client";

import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";

function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s&.-]/gu, " ")
    .split(/[\s.-]+/)
    .filter((w) => w && !/^(the|of|and|&|inc|ltd|llc|plc|co|corp)$/i.test(w));
  if (!words.length) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * The organisation's favicon when we know its domain, over a monogram that shows until a real
 * logo has loaded. Never a guessed logo: unknown domains come back as a 1px image and stay hidden.
 */
export function OrgLogo({ name, domain, size = 28, className }: { name: string; domain?: string; size?: number; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const host = domain?.replace(/^https?:\/\//, "").split("/")[0];
  const check = useCallback((img: HTMLImageElement | null) => {
    // Images that finish before hydration never fire onLoad, so check on mount too.
    if (img?.complete && img.naturalWidth > 1) setLoaded(true);
  }, []);

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-surface-3 ring-1 ring-inset ring-white/[0.06]",
        loaded && "bg-[#ededed]",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {!loaded ? (
        <span className="font-semicondensed font-semibold tracking-[0.02em] text-ink-2" style={{ fontSize: size * 0.36 }}>
          {initials(name)}
        </span>
      ) : null}
      {host ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={check}
          src={`/api/logo?d=${encodeURIComponent(host)}`}
          alt=""
          width={size}
          height={size}
          className={cn("absolute size-[64%] object-contain transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
          onLoad={(event) => {
            if (event.currentTarget.naturalWidth > 1) setLoaded(true);
          }}
          loading="lazy"
          decoding="async"
        />
      ) : null}
    </span>
  );
}
