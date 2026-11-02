import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/http/cron";
import { startBrief } from "@/lib/sources/context";

/** Starts the daily DeepResearch situation report. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const taskId = await startBrief();
  return NextResponse.json({ started: Boolean(taskId), taskId });
}
