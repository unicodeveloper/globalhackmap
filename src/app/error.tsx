"use client";

import Link from "next/link";
import { useEffect } from "react";

import { PageFrame } from "@/components/pages/page-frame";
import { PRIMARY, SECONDARY } from "@/components/pages/styles";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageFrame>
      <div className="mx-auto max-w-[640px] py-24 sm:py-32">
        <h1 className="font-condensed text-[clamp(40px,6vw,64px)] font-[760] leading-[0.96] tracking-[-0.015em] text-ink text-balance">
          This page failed to load
        </h1>
        <p className="mt-5 max-w-[56ch] text-[16px] leading-relaxed text-ink-2">Try again, or go back to the live map.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={() => retry()} className={PRIMARY}>
            Try again
          </button>
          <Link href="/" className={SECONDARY}>
            Open the live map
          </Link>
        </div>
      </div>
    </PageFrame>
  );
}
