"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Check, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ValyuMark } from "@/components/icons/agents";
import { startSignIn, useAuth } from "@/lib/auth/client";
import { type PromptReason, FREE_OPENS, useAccess } from "@/stores/access";

const COPY: Record<PromptReason, { title: string; body: string }> = {
  dossiers: {
    title: "Keep exploring the live picture",
    body: `You have opened your ${FREE_OPENS} free dossiers for today. Sign in to open every incident and vulnerability, with sources, fixes and agent prompts.`,
  },
  answers: {
    title: "Ask anything about a hack",
    body: "Cited answers from live news, advisories and filings, in about ten seconds. Sign in to ask.",
  },
  check: {
    title: "See exactly what affects you",
    body: "Sign in to see every exploited flaw and breach touching what you use, with the fix for each.",
  },
  research: {
    title: "Run DeepResearch",
    body: "A cited research report with a PDF in about five minutes, on the free credits your Valyu account starts with.",
  },
};

const UNLOCKS = [
  "Every incident and vulnerability dossier, unlimited",
  "Your personal check: what affects the apps you use",
  "Cited AI answers and DeepResearch reports",
  "Free credits to start, on your own Valyu account",
];

/** The sign-in prompt, mounted once for the whole site. Features that need an account open it through useAccess. */
export function SignInPrompt() {
  const prompt = useAccess((s) => s.prompt);
  const reason = useAccess((s) => s.reason);
  const closePrompt = useAccess((s) => s.closePrompt);
  const user = useAuth((s) => s.user);
  const [leaving, setLeaving] = useState(false);

  // The free allowance lives in localStorage; load it after hydration so server and client HTML agree.
  useEffect(() => {
    void useAccess.persist.rehydrate();
  }, []);

  // Back can restore the entire document from the browser cache, including pending UI state.
  useEffect(() => {
    const onPageShow = () => setLeaving(false);
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // Signing in elsewhere (another tab, the nav button) closes it.
  useEffect(() => {
    if (user && prompt) closePrompt();
  }, [user, prompt, closePrompt]);

  const copy = COPY[reason];

  return (
    <Dialog.Root open={Boolean(prompt)} onOpenChange={(open) => !open && closePrompt()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/70 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[61] max-h-[calc(100dvh-2rem)] w-[min(440px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-[22px] bg-surface text-ink ring-1 ring-hairline-2 shadow-xl outline-none transition-[opacity,transform] duration-200 ease-out-expo data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0">
          <div className="relative px-6 pb-6 pt-7">
            <Dialog.Close
              className="press absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-ink"
              aria-label="Not now"
            >
              <X className="size-4" />
            </Dialog.Close>
            <span className="flex size-11 items-center justify-center rounded-[13px] bg-ink text-space shadow-[0_8px_30px_-8px_rgb(237_240_244/0.35)]">
              <ValyuMark className="size-[18px]" />
            </span>
            <Dialog.Title className="mt-5 font-semicondensed text-[27px] font-bold leading-[1.05] tracking-[-0.02em] text-balance">{copy.title}</Dialog.Title>
            <Dialog.Description className="mt-2.5 text-[14.5px] leading-relaxed text-ink-2 text-pretty">{copy.body}</Dialog.Description>
            <ul className="mt-5 grid gap-2.5">
              {UNLOCKS.map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-[13.5px] leading-snug text-ink-2">
                  <Check className="mt-[2px] size-3.5 shrink-0 text-safe" weight="bold" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={leaving}
              onClick={async () => {
                setLeaving(true);
                try {
                  await startSignIn();
                } catch {
                  toast.error("Could not open sign-in. Please try again.");
                } finally {
                  setLeaving(false);
                }
              }}
              className="press mt-6 flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-ink text-[15px] font-semibold text-space transition-colors hover:bg-white disabled:opacity-70"
            >
              <ValyuMark className="size-3.5" />
              {leaving ? "Opening Valyu…" : "Continue with Valyu"}
            </button>
            <p className="mt-3 text-center text-[12px] text-ink-4">Free to start. Global Hack Map is built on Valyu&apos;s search and research APIs.</p>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
