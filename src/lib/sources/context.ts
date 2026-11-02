import "server-only";

import { type Fetched, settle, unwrap } from "@/lib/fetched";

import { cacheLife } from "next/cache";

import { countryPoint } from "@/lib/geo";
import { withLastGood } from "@/lib/sources/last-good";
import type { DailyBrief, Outage } from "@/lib/types";
import { BRIEF_MARKER, BRIEF_SCHEMA, briefQuery, valyuServer } from "@/lib/valyu/server";

const UA = "GlobalHackMap/1.0 (+https://github.com/yorkeccak/globalhackmap)";

interface IodaEvent {
  location: string;
  location_name: string;
  start: number;
  duration: number;
  datasource: string;
  score: number;
}

/** Country-level internet connectivity drops from IODA (Georgia Tech). Cause unknown unless reported. */
export async function getOutages(): Promise<Outage[]> {
  return unwrap(await getOutagesFetched());
}

async function getOutagesFetched(): Promise<Fetched<Outage[]>> {
  "use cache";
  const result = await settle(async () => {
    return withLastGood("ioda", async () => {
      const until = Math.floor(Date.now() / 1000);
      const from = until - 24 * 3600;
      const res = await fetch(`https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events?from=${from}&until=${until}&entityType=country&limit=60`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) throw new Error(`IODA ${res.status}`);
      const json = (await res.json()) as { data?: IodaEvent[] };
      const best = new Map<string, IodaEvent>();
      for (const event of json.data ?? []) {
        // Long-running events are usually measurement artefacts or chronic conditions, not news.
        if (event.start < from - 2 * 86_400 || event.score < 5_000) continue;
        const iso = event.location.split("/")[1];
        if (!iso) continue;
        const prev = best.get(iso);
        if (!prev || event.score > prev.score) best.set(iso, event);
      }
      const outages: Outage[] = [];
      for (const [iso, event] of best) {
        const point = countryPoint(iso);
        if (!point) continue;
        const end = event.start + event.duration;
        outages.push({
          id: `ioda-${iso}-${event.start}`,
          kind: "country",
          title: `Connectivity drop in ${event.location_name}`,
          country: iso,
          lat: point.lat,
          lon: point.lon,
          start: new Date(event.start * 1000).toISOString(),
          end: end < until - 600 ? new Date(end * 1000).toISOString() : undefined,
          score: Math.round(event.score),
          url: `https://ioda.inetintel.cc.gatech.edu/country/${iso}`,
        });
      }
      return outages.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 25);
    });
  });
  if (result.ok) cacheLife("feed");
  else cacheLife("minutes");
  return result;
}

interface BriefOutput {
  title?: string;
  summary?: string;
  items?: { tier?: string; headline?: string; detail?: string; action?: string; url?: string }[];
}

/** A finished brief never changes, so it is kept for a week; a miss is kept for minutes. */
async function getBriefTask(taskId: string): Promise<DailyBrief | null> {
  "use cache: remote";
  try {
    const brief = await requestBriefTask(taskId);
    cacheLife("paid");
    return brief;
  } catch {
    cacheLife("minutes");
    return null;
  }
}

async function requestBriefTask(taskId: string): Promise<DailyBrief> {
  const valyu = valyuServer();
  if (!valyu) throw new Error("no Valyu key");
  const status = await valyu.deepresearch.status(taskId);
  if (status.status !== "completed" || !status.output) throw new Error(`brief ${taskId} is not complete`);
  const output = (typeof status.output === "string" ? JSON.parse(status.output) : status.output) as BriefOutput;
  const tiers = ["critical", "high", "watch"] as const;
  const items = (output.items ?? [])
    .filter((item) => item.headline)
    .map((item) => ({
      tier: tiers.includes(item.tier as (typeof tiers)[number]) ? (item.tier as (typeof tiers)[number]) : "watch",
      headline: item.headline!.trim(),
      detail: item.detail?.trim() ?? "",
      action: item.action?.trim() || undefined,
      url: item.url && /^https?:\/\//.test(item.url) ? item.url : undefined,
    }))
    .sort((a, b) => tiers.indexOf(a.tier) - tiers.indexOf(b.tier))
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const completed = status.completed_at ?? new Date().toISOString();
  return {
    id: taskId,
    date: completed,
    title: output.title?.trim() || "Daily brief",
    summary: output.summary?.trim() ?? "",
    items,
    shareUrl: status.public ? `https://platform.valyu.ai/share/${taskId}` : undefined,
    sources: status.sources?.length ?? 0,
  };
}

/** The newest completed daily brief produced by the cron route. */
export async function getLatestBrief(): Promise<DailyBrief | null> {
  return unwrap(await getLatestBriefFetched());
}

async function getLatestBriefFetched(): Promise<Fetched<DailyBrief | null>> {
  "use cache";
  const result = await settle(async () => {
    const valyu = valyuServer();
    if (!valyu) return null;
    const list = await valyu.deepresearch.list({ limit: 50 });
    const task = (list.data ?? []).find((item) => item.status === "completed" && item.query?.startsWith(BRIEF_MARKER));
    return task ? getBriefTask(task.deepresearch_id).catch(() => null) : null;
  });
  if (result.ok) cacheLife("feed");
  else cacheLife("minutes");
  return result;
}

/** Start the daily brief (called by the cron route). */
export async function startBrief(): Promise<string | null> {
  const valyu = valyuServer();
  if (!valyu) return null;
  const now = new Date();
  const start = new Date(now.getTime() - 2 * 86_400_000);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const res = await valyu.deepresearch.create({
    query: briefQuery(day(now)),
    mode: "standard",
    outputFormats: [BRIEF_SCHEMA],
    search: { startDate: day(start), endDate: day(now) },
    metadata: { app: "globalhackmap", kind: "brief" },
  });
  if (res.deepresearch_id) {
    await valyu.deepresearch.togglePublic(res.deepresearch_id, true).catch(() => undefined);
  }
  return res.deepresearch_id ?? null;
}
