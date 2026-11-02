"use client";

import { ArrowCounterClockwise, ArrowUpRight, Sparkle, X } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { ValyuMark } from "@/components/icons/agents";
import { startSignIn } from "@/lib/auth/client";
import { VALYU_PLANS_URL } from "@/lib/site";
import { cn } from "@/lib/utils";
import { useAccess } from "@/stores/access";

interface BriefResponse {
  markdown?: string;
  sources?: { title: string; url: string }[];
  mode?: "free" | "user";
  remaining?: number;
  error?: string;
  needsAuth?: boolean;
  needsCredits?: boolean;
}

type Kind = "incident" | "cve" | "question";

const STEPS = ["Searching live news and advisories", "Reading the primary sources", "Separating confirmed facts from claims", "Writing it up"];

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// The markdown stack (streamdown, remark, rehype) is about a third of the home page's JavaScript and
// only renders once an answer arrives, so it loads on demand.
const loadStreamdown = () => import("streamdown").then((mod) => mod.Streamdown);
const Streamdown = dynamic(loadStreamdown);

async function fetchBrief(kind: Kind, id: string): Promise<{ ok: boolean; data: BriefResponse }> {
  // Fetch the renderer while the answer is being written, so it is ready when the answer lands.
  void loadStreamdown();
  try {
    const res = await fetch("/api/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id }),
    });
    const data = (await res.json()) as BriefResponse;
    return { ok: res.ok && Boolean(data.markdown), data };
  } catch {
    return { ok: false, data: { error: "Network error. Try again." } };
  }
}

function useBrief(kind: Kind, id: string, auto: boolean) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(auto ? "loading" : "idle");
  const [data, setData] = useState<BriefResponse | null>(null);
  const apply = useCallback((result: { ok: boolean; data: BriefResponse }) => {
    setData(result.data);
    setState(result.ok ? "done" : "error");
  }, []);
  const run = useCallback(() => {
    // Answers need a Valyu account; the sign-in prompt explains why and signs them in.
    if (!useAccess.getState().requireAccount("answers")) return Promise.resolve();
    setState("loading");
    setData(null);
    return fetchBrief(kind, id).then(apply);
  }, [kind, id, apply]);
  // Callers remount per subject (see the keyed exports below), so there is no state to reset here.
  useEffect(() => {
    if (auto) void fetchBrief(kind, id).then(apply);
  }, [auto, kind, id, apply]);
  return { state, data, run };
}

function Thinking() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 2300);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex items-center gap-2.5 text-[13px] text-ink-2">
        <span className="relative flex size-4 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-ink/20" />
          <ValyuMark className="relative size-3 text-ink" />
        </span>
        <span key={step} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
          {STEPS[step]}
        </span>
      </div>
      <div className="space-y-2">
        {[94, 82, 88, 64].map((w) => (
          <div key={w} className="skeleton h-2.5 rounded-full" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

function BriefBody({ data }: { data: BriefResponse }) {
  return (
    <>
      <div className="prose-report px-4 py-3.5 text-[14px] leading-[1.6] text-ink-2">
        <Streamdown>{data.markdown ?? ""}</Streamdown>
      </div>
      {data.sources?.length ? (
        <div className="flex flex-wrap gap-1.5 border-t border-hairline px-4 py-3">
          {data.sources.slice(0, 6).map((source, index) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer nofollow"
              title={source.title}
              className="flex max-w-[180px] items-center gap-1.5 rounded-full bg-surface-3 py-1 pl-1 pr-2.5 text-[11.5px] text-ink-3 transition-colors hover:text-ink"
            >
              <span className="flex size-4 items-center justify-center rounded-full bg-space font-mono text-[9px] text-ink-2">{index + 1}</span>
              <span className="truncate">{hostOf(source.url)}</span>
            </a>
          ))}
        </div>
      ) : null}
    </>
  );
}

function Failure({ data, onRetry }: { data: BriefResponse | null; onRetry: () => void }) {
  return (
    <div className="space-y-3 px-4 py-4 text-[13.5px] leading-relaxed text-ink-2">
      <p>{data?.error ?? "Could not write an answer right now."}</p>
      <div className="flex flex-wrap gap-2">
        {data?.needsAuth ? (
          <button
            type="button"
            onClick={() => void startSignIn()}
            className="flex items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-[13px] font-medium text-space"
          >
            <ValyuMark className="size-3" /> Continue free with Valyu
          </button>
        ) : null}
        {data?.needsCredits ? (
          <a
            href={VALYU_PLANS_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-full bg-ink px-3.5 py-2 text-[13px] font-medium text-space"
          >
            Add credits <ArrowUpRight className="size-3.5" />
          </a>
        ) : null}
        {!data?.needsAuth && !data?.needsCredits ? (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] text-ink-2 ring-1 ring-hairline-2 hover:text-ink"
          >
            <ArrowCounterClockwise className="size-3.5" /> Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Footer({ data }: { data: BriefResponse | null }) {
  if (!data?.mode) return null;
  return <span className="text-[11.5px] text-ink-4">{data.mode === "user" ? "On your Valyu credits" : `${data.remaining ?? 0} free answers left today`}</span>;
}

/** Button that turns into a cited AI brief in place. */
export function AiBrief(props: { kind: Kind; id: string; label: string }) {
  return <Brief key={`${props.kind}:${props.id}`} {...props} />;
}

function Brief({ kind, id, label }: { kind: Kind; id: string; label: string }) {
  const { state, data, run } = useBrief(kind, id, false);
  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={() => void run()}
        className="press group flex w-full items-center gap-3.5 rounded-[16px] bg-white/[0.035] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] px-4 py-3.5 text-left transition-[background-color,box-shadow] hover:bg-white/[0.06]"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-ink text-space shadow-[0_1px_2px_rgb(0_0_0/0.5)]">
          <Sparkle className="size-4" weight="fill" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-ink">{label}</span>
          <span className="mt-0.5 block text-[12px] text-ink-3">A cited summary from live sources in about 10 seconds</span>
        </span>
        <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-4">Free</span>
      </button>
    );
  }
  return (
    <div className="overflow-hidden rounded-[16px] bg-white/[0.035] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <Sparkle className="size-3.5 text-ink-2" />
        <span className="text-[12.5px] font-medium text-ink-2">AI brief</span>
        <span className="ml-auto">
          <Footer data={data} />
        </span>
      </div>
      {state === "loading" ? <Thinking /> : null}
      {state === "done" && data ? <BriefBody data={data} /> : null}
      {state === "error" ? <Failure data={data} onRetry={() => void run()} /> : null}
    </div>
  );
}

/** An answer to a question typed into the omnibox. */
export function AnswerCard({ question, onClose }: { question: string; onClose: () => void }) {
  const { state, data, run } = useBrief("question", question, true);
  return (
    <div className="overflow-hidden rounded-[18px] bg-white/[0.028] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06),inset_0_1px_0_rgb(255_255_255/0.05)] animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-start gap-3 border-b border-white/[0.06] px-4 py-3">
        <Sparkle className="mt-0.5 size-4 shrink-0 text-ink-2" />
        <p className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-ink">{question}</p>
        <button type="button" onClick={onClose} className="-mr-1 rounded-full p-1 text-ink-3 hover:bg-white/[0.06] hover:text-ink" aria-label="Close answer">
          <X className="size-4" />
        </button>
      </div>
      <div className={cn("max-h-[42vh] overflow-y-auto scrollbar-thin")}>
        {state === "loading" || state === "idle" ? <Thinking /> : null}
        {state === "done" && data ? <BriefBody data={data} /> : null}
        {state === "error" ? <Failure data={data} onRetry={() => void run()} /> : null}
      </div>
      {state === "done" ? (
        <div className="border-t border-hairline px-4 py-2.5">
          <Footer data={data} />
        </div>
      ) : null}
    </div>
  );
}
