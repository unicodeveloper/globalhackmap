import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/http/cron";
import { startSweep } from "@/lib/sources/incidents";

/** Starts a DeepResearch sweep for incidents. The snapshot picks up the result when it completes. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Optional backfill window, e.g. ?from=10&to=3 sweeps the period from 10 to 3 days ago.
  const url = new URL(request.url);
  const from = Math.min(30, Math.max(1, Number(url.searchParams.get("from") ?? 3)));
  const to = Math.min(from - 1, Math.max(0, Number(url.searchParams.get("to") ?? 0)));
  const taskId = await startSweep(from, to);
  return NextResponse.json({ started: Boolean(taskId), taskId });
}
