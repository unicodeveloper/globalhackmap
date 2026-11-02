"use client";

import { SignOut } from "@phosphor-icons/react";
import { useEffect } from "react";

import { ValyuMark } from "@/components/icons/agents";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { startSignIn, useAuth } from "@/lib/auth/client";
import { VALYU_PLANS_URL } from "@/lib/site";

export function AuthButton() {
  const { user, loaded, load, signOut } = useAuth();
  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) return <div className="h-8 w-[92px]" aria-hidden />;

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => void startSignIn()}
        className="ml-0.5 press flex h-8 items-center gap-2 whitespace-nowrap rounded-full bg-ink px-3.5 text-[13px] font-medium text-space transition-[transform,background-color] hover:bg-white active:scale-[0.98]"
      >
        <ValyuMark className="size-3" />
        Sign in
      </button>
    );
  }

  const initial = (user.name ?? user.email).slice(0, 1).toUpperCase();
  return (
    <Popover>
      <PopoverTrigger className="ml-0.5 flex size-8 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-space" aria-label="Account">
        {initial}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-[14px] border-0 bg-surface p-4 ring-1 ring-hairline-2 elevated">
        <p className="truncate text-[14px] font-medium text-ink">{user.name ?? user.email}</p>
        <p className="truncate text-[12.5px] text-ink-3">{user.email}</p>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
          AI answers and stack checks you run here use your own Valyu credits. New accounts start with free credits.
        </p>
        <div className="mt-4 flex gap-2">
          <a
            href={VALYU_PLANS_URL}
            target="_blank"
            rel="noreferrer"
            className="flex-1 rounded-full bg-ink px-3 py-2 text-center text-[13px] font-medium text-space"
          >
            Plans and credits
          </a>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] text-ink-3 ring-1 ring-hairline-2 hover:text-ink"
          >
            <SignOut className="size-3.5" /> Sign out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
