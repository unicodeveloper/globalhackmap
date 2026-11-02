"use client";

import { ArrowRight, ArrowUpRight, CircleNotch } from "@phosphor-icons/react";
import { useState } from "react";

import { ValyuMark } from "@/components/icons/agents";
import { startSignIn, useAuth } from "@/lib/auth/client";
import { VALYU_PLANS_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

const PRIMARY =
  "group press inline-flex h-11 items-center gap-2.5 whitespace-nowrap rounded-full bg-ink pl-4 pr-5 text-[14px] font-medium text-space shadow-[inset_0_-1px_0_rgb(0_0_0/0.12)] hover:bg-white disabled:cursor-default disabled:opacity-80";

/** The page's primary action: start Valyu OAuth, or manage the plan once signed in. */
export function SignInCta({ className }: { className?: string }) {
  const user = useAuth((s) => s.user);
  const [pending, setPending] = useState(false);

  if (user) {
    return (
      <a href={VALYU_PLANS_URL} target="_blank" rel="noreferrer" className={cn(PRIMARY, className)}>
        Manage your Valyu plan
        <ArrowUpRight className="size-4 transition-transform duration-200 ease-out-expo group-hover:-translate-y-px group-hover:translate-x-px" aria-hidden />
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        setPending(true);
        // Navigation usually replaces the page; reset in case it opened a new tab or failed.
        void startSignIn("/").finally(() => window.setTimeout(() => setPending(false), 3000));
      }}
      className={cn(PRIMARY, className)}
    >
      {pending ? <CircleNotch className="size-4 motion-safe:animate-spin" aria-hidden /> : <ValyuMark className="size-4" />}
      Sign in with Valyu, free
      <ArrowRight className="size-4 text-space/60 transition-transform duration-200 ease-out-expo group-hover:translate-x-0.5" aria-hidden />
    </button>
  );
}
