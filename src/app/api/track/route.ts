import { NextResponse } from "next/server";

const EVENTS = new Set(["fix_click", "check_run", "share", "cinema"]);

/** Minimal, anonymous product events (no cookies, no IPs stored). Logged for the operator. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { event?: string; target?: string; cve?: string };
  if (!body.event || !EVENTS.has(body.event)) return NextResponse.json({ ok: false }, { status: 400 });
  console.info(JSON.stringify({ ghm_event: body.event, target: body.target?.slice(0, 40), cve: body.cve?.slice(0, 24), at: new Date().toISOString() }));
  return NextResponse.json({ ok: true });
}
