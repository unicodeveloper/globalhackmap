"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { checkTerms } from "@/lib/stack/popular";

interface StackState {
  /** Products and vendors the visitor uses, as typed. Kept in this browser only. */
  items: string[];
  add: (name: string) => void;
  remove: (name: string) => void;
  toggle: (name: string) => void;
}

const tidy = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 60);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const useStack = create<StackState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (name) => {
        const value = tidy(name);
        if (value.length < 2 || get().items.some((item) => same(item, value))) return;
        set({ items: [...get().items, value].slice(0, 40) });
      },
      remove: (name) => set({ items: get().items.filter((item) => !same(item, name)) }),
      toggle: (name) => (get().items.some((item) => same(item, name)) ? get().remove(name) : get().add(name)),
    }),
    // Rehydrated after mount (SituationRoom and UseCheck) so the server HTML and the first client render agree.
    { name: "ghm_stack_v1", skipHydration: true },
  ),
);

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The first stack entry named in the texts, matched as a whole word, ignoring case. A popular pick also matches its catalogue names. */
export function stackMatch(items: string[], ...texts: (string | undefined)[]): string | null {
  if (!items.length) return null;
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  const named = (term: string) => new RegExp(`(^|[^a-z0-9])${escape(term.toLowerCase())}($|[^a-z0-9])`).test(haystack);
  return items.find((item) => named(item) || checkTerms(item).some(named)) ?? null;
}
