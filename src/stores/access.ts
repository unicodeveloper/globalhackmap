"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { useAuth } from "@/lib/auth/client";
import { ACCOUNTS } from "@/lib/mode";

/** Dossiers a visitor can open each day before Global Hack Map asks them to sign in with Valyu. */
export const FREE_OPENS = 3;

/** Why the sign-in prompt is showing, so it can say what signing in unlocks. */
export type PromptReason = "dossiers" | "answers" | "check" | "research";

interface AccessState {
  /** UTC day the allowance belongs to; a new day resets it. */
  day: string;
  /** Dossiers opened today, so reopening one is free. */
  opened: string[];
  prompt: PromptReason | null;
  /** The last reason shown, kept while the prompt fades out so its wording does not change mid-exit. */
  reason: PromptReason;
  /**
   * True when this dossier may open: signed in (or auth still loading), already opened today, or within
   * the free allowance. Otherwise it shows the sign-in prompt and returns false.
   */
  allowOpen: (key: string) => boolean;
  /** For features that need an account: true when signed in, else shows the sign-in prompt. */
  requireAccount: (reason: PromptReason) => boolean;
  closePrompt: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const useAccess = create<AccessState>()(
  persist(
    (set, get) => ({
      day: "",
      opened: [],
      prompt: null,
      reason: "dossiers",
      allowOpen: (key) => {
        if (!ACCOUNTS) return true;
        // Never prompt someone who may already have an account, including while the auth check is pending.
        const { user, loaded } = useAuth.getState();
        if (user || !loaded) return true;
        const day = today();
        const opened = get().day === day ? get().opened : [];
        if (opened.includes(key)) return true;
        if (opened.length < FREE_OPENS) {
          set({ day, opened: [...opened, key] });
          return true;
        }
        set({ prompt: "dossiers", reason: "dossiers" });
        return false;
      },
      requireAccount: (reason) => {
        if (!ACCOUNTS) return true;
        if (useAuth.getState().user) return true;
        set({ prompt: reason, reason });
        return false;
      },
      closePrompt: () => set({ prompt: null }),
    }),
    // Only the allowance persists; the prompt itself never reopens on reload.
    { name: "ghm_allowance_v1", partialize: ({ day, opened }) => ({ day, opened }), skipHydration: true },
  ),
);

/** Free dossiers left today, for the hint in the panel. */
export function freeOpensLeft(state: Pick<AccessState, "day" | "opened">): number {
  return state.day === today() ? Math.max(0, FREE_OPENS - state.opened.length) : FREE_OPENS;
}
