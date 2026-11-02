"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type CopyState = "idle" | "copied" | "failed";
export type CodeLang = "shell" | "json" | "toml" | "text";

/** Copy to the clipboard; when that is blocked, select the visible text so the user can copy it by hand. */
function useCopy(text: string, target: React.RefObject<HTMLElement | null>) {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state !== "copied") return;
    const id = window.setTimeout(() => setState("idle"), 1800);
    return () => window.clearTimeout(id);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
      const selection = window.getSelection();
      if (selection && target.current) {
        const range = document.createRange();
        range.selectNodeContents(target.current);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }

  return { state, copy };
}

function CopyIcon({ copied, tone = "light" }: { copied: boolean; tone?: "light" | "dark" }) {
  const reduced = useReducedMotion();
  return (
    <span className="relative flex size-3.5 items-center justify-center" aria-hidden>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={copied ? "check" : "copy"}
          initial={reduced ? false : { opacity: 0, scale: 0.6, filter: "blur(2px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.6, filter: "blur(2px)" }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {copied ? <Check className={cn("size-3.5", tone === "light" && "text-safe")} weight="bold" /> : <Copy className="size-3.5" />}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const FAILED_NOTE = "Clipboard unavailable. Text selected; copy it using your keyboard or touch menu.";

/** The install pill: a value in mono with a primary copy action, for the one thing a visitor came to copy. */
export function CopyPill({ value, label, icon, className }: { value: string; label: string; icon?: React.ReactNode; className?: string }) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const { state, copy } = useCopy(value, valueRef);
  return (
    <div
      className={cn(
        "flex h-11 min-w-0 items-center gap-2.5 rounded-full bg-white/[0.03] pl-4 pr-1.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.09),inset_0_1px_0_rgb(255_255_255/0.05)]",
        className,
      )}
    >
      {icon ? (
        <span className="shrink-0 text-ink-4" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span ref={valueRef} className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-2">
        {value}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="press flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 text-[12.5px] font-medium text-space hover:bg-white"
      >
        <CopyIcon copied={state === "copied"} tone="dark" />
        {state === "copied" ? "Copied" : "Copy"}
      </button>
      <span role="status" className="sr-only">
        {state === "copied" ? `${label} copied.` : state === "failed" ? FAILED_NOTE : ""}
      </span>
    </div>
  );
}

const TOKEN = /("(?:[^"\\]|\\.)*")|([{}[\],:=])|([^\s"{}[\],:=]+)|(\s+)/g;

/** Quiet two-tone highlighting: values bright, keys mid, punctuation dim. No colour, just weight of ink. */
function highlight(code: string, lang: CodeLang): React.ReactNode {
  if (lang === "text") return code;
  if (lang === "shell") {
    return code.split(/(\s+)/).map((part, index) => {
      if (!part.trim()) return part;
      const tone = index === 0 ? "text-ink" : part.startsWith("-") ? "text-ink-3" : "text-ink-2";
      return (
        <span key={index} className={tone}>
          {part}
        </span>
      );
    });
  }
  // One block per line with a hanging indent, so a long value wraps under its own key instead of at column 0.
  return code.split("\n").map((line, row) => {
    const indent = line.length - line.trimStart().length;
    const body = line.trimStart();
    const out: React.ReactNode[] = [];
    for (const match of body.matchAll(TOKEN)) {
      const [text, string, punct, word] = match;
      const end = (match.index ?? 0) + text.length;
      let tone: string | undefined;
      if (string) tone = /^\s*:/.test(body.slice(end)) ? "text-ink-2" : "text-ink";
      else if (punct) tone = "text-ink-4";
      else if (word) tone = "text-ink-2";
      out.push(
        tone ? (
          <span key={match.index} className={tone}>
            {text}
          </span>
        ) : (
          text
        ),
      );
    }
    return (
      <span key={row} className="block" style={{ paddingLeft: `${indent + 2}ch`, textIndent: "-2ch" }}>
        {out.length ? out : "\u00a0"}
      </span>
    );
  });
}

export function CodeBlock({ code, label, lang = "text", className }: { code: string; label: string; lang?: CodeLang; className?: string }) {
  const codeRef = useRef<HTMLElement>(null);
  const { state, copy } = useCopy(code, codeRef);

  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-[16px] bg-white/[0.028] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06),inset_0_1px_0_rgb(255_255_255/0.05)]",
        className,
      )}
    >
      <div className="flex h-10 items-center justify-between gap-3 border-b border-white/[0.06] pl-4 pr-1.5">
        <span className="min-w-0 truncate font-mono text-[11px] text-ink-4">{label}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="press flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] text-ink-3 hover:bg-white/[0.05] hover:text-ink"
        >
          <CopyIcon copied={state === "copied"} />
          {state === "copied" ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className={cn("flex gap-3 px-4 py-3.5 font-mono text-[12.5px] leading-[1.7] scrollbar-thin", lang === "text" ? "text-ink-2" : "text-ink-3")}
        tabIndex={0}
        aria-label={label}
      >
        {lang === "shell" ? (
          <span className="select-none text-ink-4" aria-hidden>
            $
          </span>
        ) : null}
        <code ref={codeRef} className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {highlight(code, lang)}
        </code>
      </pre>
      <span role="status" className={state === "failed" ? "block px-4 pb-3 text-[12px] text-ink-2" : "sr-only"}>
        {state === "copied" ? `${label} copied.` : state === "failed" ? FAILED_NOTE : ""}
      </span>
    </div>
  );
}
