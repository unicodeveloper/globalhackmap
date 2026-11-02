import { NextResponse } from "next/server";
import { z } from "zod";

import { checkStack } from "@/lib/stack/check";
import { MAX_INPUT_BYTES } from "@/lib/stack/types";

export const maxDuration = 60;

const TOO_LARGE = "That is larger than 500 KB. Paste the lockfile for one project at a time.";

const Body = z.object({
  input: z.string().min(1, "Paste something to check first."),
  filename: z.string().max(120).optional(),
});

/** Stack check. The submitted text is parsed in memory and never logged or stored. */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_INPUT_BYTES + 4_096) return NextResponse.json({ error: TOO_LARGE }, { status: 413 });

  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_INPUT_BYTES + 4_096) return NextResponse.json({ error: TOO_LARGE }, { status: 413 });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Send JSON like {"input": "..."}.' }, { status: 400 });
  }
  const body = Body.safeParse(json);
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Bad request" }, { status: 400 });

  try {
    const report = await checkStack(body.data.input, { filename: body.data.filename });
    if (!report.counts.packages && !report.counts.products) {
      return NextResponse.json(
        { error: 'We could not find any packages or products in that. Paste a manifest, a lockfile or a list like "GitLab 17.2, Okta".' },
        { status: 422 },
      );
    }
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.name === "StackInputError") return NextResponse.json({ error: error.message }, { status: 413 });
    // Deliberately no logging of the input or the error detail: it could echo what was pasted.
    return NextResponse.json({ error: "The check failed on our side. Try again in a minute." }, { status: 502 });
  }
}
