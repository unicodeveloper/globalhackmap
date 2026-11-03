import "server-only";

import { cacheLife } from "next/cache";

import { callAsUser } from "@/lib/auth/server";
import { type Fetched, settle, unwrap } from "@/lib/fetched";
import { reserveSharedWork } from "@/lib/http/paid-budget";
import { valyuServer } from "@/lib/valyu/server";

export interface BriefResult {
  markdown: string;
  sources: { title: string; url: string }[];
}

const SYSTEM = `You are the analyst behind Global Hack Map: a calm, precise cyber security analyst writing for a general audience and for defenders.
Rules: be factual and sourced; say clearly what is confirmed, what is reported and what is only claimed by attackers; never speculate about attribution; never say a vulnerability is exploited in the wild unless a vendor, CISA or a reputable researcher says so; keep it under 220 words; use short markdown sections with these headings: "What happened", "Who is affected", "What to do now". Use plain English. No hype. Do not use em dashes.
Write as the analyst, never about the request or your material: do not mention "the question", "the context", "the search results", "the sources provided" or "the information available". When something is not known yet, say so plainly ("The company has not said how many people are affected."). Do not name publications inline; sources are listed separately.`;

interface AnswerPayload {
  contents?: string | Record<string, unknown>;
  search_results?: { title?: string; url?: string }[];
}

function parseAnswer(raw: unknown): BriefResult {
  if (typeof raw === "string" && raw.includes("data: ")) {
    let text = "";
    let sources: { title: string; url: string }[] = [];
    for (const line of raw.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const chunk = JSON.parse(line.slice(6)) as {
          search_results?: { title?: string; url?: string }[];
          choices?: { delta?: { content?: string } }[];
          content?: string;
        };
        if (chunk.search_results) sources = chunk.search_results.map((s) => ({ title: s.title ?? s.url ?? "", url: s.url ?? "" }));
        text += chunk.choices?.[0]?.delta?.content ?? chunk.content ?? "";
      } catch {
        // [DONE] and keep-alives
      }
    }
    return { markdown: text.trim(), sources: sources.filter((s) => s.url).slice(0, 8) };
  }
  const payload = raw as AnswerPayload;
  const markdown = typeof payload.contents === "string" ? payload.contents : JSON.stringify(payload.contents ?? "");
  return {
    markdown: markdown.trim(),
    sources: (payload.search_results ?? [])
      .filter((s) => s.url)
      .map((s) => ({ title: s.title ?? s.url!, url: s.url! }))
      .slice(0, 8),
  };
}

function body(question: string, startDate?: string) {
  return {
    query: question,
    system_instructions: SYSTEM,
    search_type: "all",
    fast_mode: true,
    ...(startDate ? { start_date: startDate } : {}),
  };
}

/**
 * Answer with the deployment's key, shared by every instance for 6 hours so popular incidents cost once.
 * Every argument is part of the cache key; failures settle with a short retry lifetime.
 */
export async function answerShared(key: string, question: string, startDate?: string): Promise<BriefResult> {
  return unwrap(await answerSharedFetched(key, question, startDate));
}

async function answerSharedFetched(key: string, question: string, startDate?: string): Promise<Fetched<BriefResult>> {
  "use cache: remote";
  const result = await settle(() => requestAnswer(question, startDate));
  if (result.ok) cacheLife("answer");
  else cacheLife("minutes");
  return result;
}

async function requestAnswer(question: string, startDate?: string): Promise<BriefResult> {
  const valyu = valyuServer();
  if (!valyu) throw new Error("This deployment has no Valyu API key.");
  await reserveSharedWork("answer");
  const res = await valyu.answer(question, {
    systemInstructions: SYSTEM,
    searchType: "all",
    fastMode: true,
    startDate,
  });
  if (Symbol.asyncIterator in Object(res)) throw new Error("unexpected stream");
  const answer = res as { success: boolean; error?: string; contents?: unknown; search_results?: unknown };
  if (!answer.success) throw new Error(answer.error ?? "Valyu answer failed");
  return parseAnswer(answer);
}

/** Answer as the signed-in user, on their own credits. */
export async function answerAsUser(token: string, question: string, startDate?: string): Promise<BriefResult> {
  const raw = await callAsUser<unknown>(token, "/v1/answer", body(question, startDate));
  return parseAnswer(raw);
}
