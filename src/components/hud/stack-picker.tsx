"use client";

import { ArrowRight, Check, Plus, StackPlus, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { POPULAR } from "@/lib/stack/popular";
import { cn } from "@/lib/utils";
import { useStack } from "@/stores/stack";

/**
 * "What do you run?": the visitor's products and vendors, kept in this browser, so the patch list and
 * the feed can say what touches them. Nothing leaves the device.
 */
export function StackPicker({ suggestions = [], side = "top" }: { suggestions?: string[]; side?: "top" | "bottom" }) {
  const router = useRouter();
  const items = useStack((s) => s.items);
  const add = useStack((s) => s.add);
  const remove = useStack((s) => s.remove);
  const toggle = useStack((s) => s.toggle);
  const [draft, setDraft] = useState("");

  const offered = useMemo(() => {
    const seen = new Set<string>();
    // Common platforms first: most visitors run Microsoft or WordPress, not this week's niche appliance.
    return [...POPULAR.map((pick) => pick.name), ...suggestions].filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [suggestions]);
  const chosen = new Set(items.map((item) => item.toLowerCase()));

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "press flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] transition-colors",
          items.length ? "bg-white/[0.07] text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)] hover:bg-white/[0.1]" : "bg-ink text-space hover:bg-white",
        )}
        aria-label="Choose the products and vendors you use"
      >
        <StackPlus className="size-3.5" weight={items.length ? "regular" : "bold"} />
        {items.length ? `Your stack · ${items.length}` : "What do you run?"}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={side === "top" ? "end" : "start"}
        sideOffset={8}
        className="w-[340px] gap-0 rounded-[18px] border-0 bg-surface p-0 text-ink ring-1 ring-hairline-2 shadow-xl"
      >
        <div className="px-4 pb-3 pt-4">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-4">Your stack</p>
          <p className="mt-1.5 text-[13.5px] leading-snug text-ink-2">
            Add the software and vendors you rely on. Global Hack Map flags the flaws and breaches that touch them.
          </p>
          <form
            className="mt-3 flex items-center gap-2 rounded-[12px] bg-space px-3 ring-1 ring-inset ring-input focus-within:ring-2 focus-within:ring-ink"
            onSubmit={(event) => {
              event.preventDefault();
              add(draft);
              setDraft("");
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="e.g. FortiGate, Jira, Okta"
              aria-label="Add a product or vendor"
              className="h-9 min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-4"
            />
            <button
              type="submit"
              disabled={draft.trim().length < 2}
              className="press rounded-full p-1 text-ink-3 hover:text-ink disabled:opacity-30"
              aria-label="Add"
            >
              <Plus className="size-4" weight="bold" />
            </button>
          </form>
        </div>

        {items.length ? (
          <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] px-4 py-3">
            {items.map((item) => (
              <span key={item} className="flex h-7 items-center gap-1 rounded-full bg-ink pl-2.5 pr-1 text-[12px] font-medium text-space">
                {item}
                <button type="button" onClick={() => remove(item)} className="rounded-full p-0.5 hover:bg-black/10" aria-label={`Remove ${item}`}>
                  <X className="size-3" weight="bold" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="border-t border-white/[0.06] px-4 py-3">
          <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-4">Quick add</p>
          <div className="flex max-h-[148px] flex-wrap gap-1.5 overflow-y-auto scrollbar-thin">
            {offered.map((name) => {
              const on = chosen.has(name.toLowerCase());
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  aria-pressed={on}
                  className={cn(
                    "press flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] transition-colors",
                    on ? "bg-white/[0.12] text-ink" : "bg-white/[0.035] text-ink-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] hover:bg-white/[0.07]",
                  )}
                >
                  {on ? <Check className="size-3" weight="bold" /> : null}
                  {name}
                </button>
              );
            })}
          </div>
        </div>
        {items.length ? (
          <div className="border-t border-white/[0.06] px-4 py-3">
            <button
              type="button"
              // The check reads the same saved list, so it opens with these already on it.
              onClick={() => router.push("/check")}
              className="press flex h-9 w-full items-center justify-center gap-2 rounded-full bg-ink text-[13px] font-medium text-space hover:bg-white"
            >
              See what affects these <ArrowRight className="size-3.5" weight="bold" />
            </button>
          </div>
        ) : null}
        <p className="border-t border-white/[0.06] px-4 py-2.5 text-[11.5px] text-ink-4">Saved in this browser only. Nothing to upload.</p>
      </PopoverContent>
    </Popover>
  );
}
