"use client";

import { ArrowUpRight, FilePdf, MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";

import { ValyuMark } from "@/components/icons/agents";
import { startSignIn, useAuth } from "@/lib/auth/client";
import { ACCOUNTS } from "@/lib/mode";
import { VALYU_PLANS_URL } from "@/lib/site";
import { useAccess } from "@/stores/access";

type Phase = "idle" | "starting" | "running" | "done" | "error";

interface Result {
  output?: string;
  pdfUrl?: string;
  sources?: { title?: string; url?: string }[];
}

const STORAGE = "ghm_research_";

interface ResearchProps {
  kind: "incident" | "cve" | "stack";
  /** The incident or CVE; for a stack, any stable key for the list. */
  id: string;
  subject: string;
  /** For a stack: the names to research. */
  items?: string[];
  title?: string;
  blurb?: string;
}

/**
 * Deep research in fast mode: on the visitor's own Valyu credits (25 credits), or self-hosted, on the
 * deployment's key. The task id is kept in session storage so a reload or reopening the dossier picks the
 * running task back up.
 */
export function DeepResearch(props: ResearchProps) {
  return <Research key={`${props.kind}:${props.id}`} {...props} />;
}

function Research({ kind, id, subject, items, title, blurb }: ResearchProps) {
  const user = useAuth((s) => s.user);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ step: 0, total: 12 });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ message: string; needsAuth?: boolean; needsCredits?: boolean } | null>(null);
  const timer = useRef(0);
  const key = `${STORAGE}${kind}:${id}`;

  const poll = (taskId: string) => {
    window.clearTimeout(timer.current);
    const tick = async () => {
      try {
        const res = await fetch(`/api/research/${taskId}`, { cache: "no-store" });
        const json = (await res.json()) as Result & { status?: string; step?: number; total?: number; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Could not check progress");
        if (json.status === "completed") {
          setResult(json);
          setPhase("done");
          return;
        }
        if (json.status === "failed" || json.status === "cancelled") throw new Error(json.error ?? "The research task did not finish.");
        setProgress({ step: json.step ?? 0, total: json.total || 12 });
        setPhase("running");
        timer.current = window.setTimeout(tick, 5000);
      } catch (err) {
        sessionStorage.removeItem(key);
        setError({ message: err instanceof Error ? err.message : "Research failed" });
        setPhase("error");
      }
    };
    void tick();
  };

  useEffect(() => {
    const existing = sessionStorage.getItem(key);
    if (existing) poll(existing);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const start = async () => {
    if (!useAccess.getState().requireAccount("research")) return;
    setPhase("starting");
    setError(null);
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id, items }),
    });
    const json = (await res.json()) as { taskId?: string; error?: string; needsAuth?: boolean; needsCredits?: boolean };
    if (!res.ok || !json.taskId) {
      setError({ message: json.error ?? "Could not start research", needsAuth: json.needsAuth, needsCredits: json.needsCredits });
      setPhase("error");
      return;
    }
    sessionStorage.setItem(key, json.taskId);
    poll(json.taskId);
  };

  if (phase === "idle") {
    return (
      <button
        type="button"
        onClick={() => void start()}
        className="press group flex w-full items-center gap-3.5 rounded-[16px] bg-white/[0.035] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] px-4 py-3.5 text-left transition-[background-color,box-shadow] hover:bg-white/[0.06]"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-white/[0.07] text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]">
          <MagnifyingGlass className="size-4" weight="bold" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-ink">{title ?? `Investigate ${subject} in depth`}</span>
          <span className="mt-0.5 block text-[12px] text-ink-3">
            {blurb ?? "A cited research report with a PDF, in about five minutes."}
            {ACCOUNTS ? (user ? " 25 credits from your Valyu account." : " Runs on your Valyu credits once you sign in.") : null}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-4">
          <ValyuMark className="size-2.5" /> {user ? "25 cr" : "Valyu"}
        </span>
      </button>
    );
  }

  if (phase === "starting" || phase === "running") {
    const pct = Math.round((Math.min(progress.step, progress.total) / Math.max(1, progress.total)) * 100);
    return (
      <div className="rounded-[16px] bg-white/[0.035] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] px-4 py-3.5" aria-live="polite">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-ink">Researching {subject}</span>
          <span className="font-mono text-[11px] tabular text-ink-3">
            step {progress.step} of {progress.total}
          </span>
        </div>
        <div className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-ink transition-[width] duration-700 ease-out-expo" style={{ width: `${Math.max(6, pct)}%` }} />
        </div>
        <p className="mt-2 text-[12px] text-ink-3">Reading news, advisories and filings. You can close this panel; it keeps running.</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="space-y-2.5 rounded-[16px] bg-white/[0.035] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] px-4 py-3.5 text-[13px] text-ink-2">
        <p>{error?.message}</p>
        <div className="flex gap-2">
          {error?.needsAuth ? (
            <button
              type="button"
              onClick={() => void startSignIn()}
              className="press flex items-center gap-2 rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-medium text-space"
            >
              <ValyuMark className="size-3" /> Sign in with Valyu
            </button>
          ) : null}
          {error?.needsCredits ? (
            <a
              href={VALYU_PLANS_URL}
              target="_blank"
              rel="noreferrer"
              className="press flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-medium text-space"
            >
              Add credits <ArrowUpRight className="size-3.5" />
            </a>
          ) : null}
          <button type="button" onClick={() => setPhase("idle")} className="press rounded-full px-3.5 py-1.5 text-[12.5px] text-ink-2 ring-1 ring-white/[0.1]">
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[16px] bg-white/[0.035] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <span className="text-[12.5px] font-medium text-ink-2">Research report</span>
        {result?.pdfUrl ? (
          <a
            href={result.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="press ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] text-ink ring-1 ring-white/[0.1] hover:bg-white/[0.05]"
          >
            <FilePdf className="size-3.5" /> PDF
          </a>
        ) : null}
      </div>
      <div className="prose-report max-h-[50vh] overflow-y-auto px-4 py-3.5 text-[13.5px] leading-[1.6] text-ink-2 scrollbar-thin">
        <Streamdown>{result?.output ?? ""}</Streamdown>
      </div>
    </div>
  );
}
