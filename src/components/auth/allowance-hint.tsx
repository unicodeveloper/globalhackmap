"use client";

import { ArrowUpRight } from "@phosphor-icons/react";

import { ValyuMark } from "@/components/icons/agents";
import { startSignIn, useAuth } from "@/lib/auth/client";
import { ACCOUNTS } from "@/lib/mode";
import { VALYU_PLANS_URL } from "@/lib/site";
import { freeOpensLeft, useAccess } from "@/stores/access";

/** Free dossiers left today, and a way to sign in for more. */
export function AllowanceHint() {
  const user = useAuth((s) => s.user);
  const loaded = useAuth((s) => s.loaded);
  const day = useAccess((s) => s.day);
  const opened = useAccess((s) => s.opened);
  // Auth loads in the browser, so everything below (including the date read) never runs while prerendering.
  if (!ACCOUNTS || !loaded) return null;
  if (user) {
    return (
      <a href={VALYU_PLANS_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-ink-3 transition-colors hover:text-ink">
        <ValyuMark className="size-2.5" /> Plans and credits <ArrowUpRight className="size-3" />
      </a>
    );
  }
  const left = freeOpensLeft({ day, opened });
  return (
    <button type="button" onClick={() => void startSignIn()} className="flex items-center gap-1.5 text-ink-3 transition-colors hover:text-ink">
      <span className="tabular">{left ? `${left} free ${left === 1 ? "dossier" : "dossiers"} left today` : "Free dossiers used for today"}</span>
      <span className="text-ink">· Sign in</span>
    </button>
  );
}
