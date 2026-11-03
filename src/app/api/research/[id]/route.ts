import { NextResponse } from "next/server";

import { callAsUser, getAccessToken } from "@/lib/auth/server";
import { ACCOUNTS } from "@/lib/mode";
import { valyuServer } from "@/lib/valyu/server";

interface StatusResponse {
  status?: string;
  progress?: { current_step?: number; total_steps?: number };
  current_step?: number;
  total_steps?: number;
  output?: string;
  pdf_url?: string;
  sources?: { title?: string; url?: string }[];
  error?: string;
}

/** Self-hosted: the task ran on the deployment's own key. */
async function statusOnDeploymentKey(id: string): Promise<StatusResponse> {
  const valyu = valyuServer();
  if (!valyu) throw new Error("This deployment has no Valyu API key.");
  const task = await valyu.deepresearch.status(id);
  if (!task.success) throw new Error(task.error ?? "status failed");
  return { ...task, output: typeof task.output === "string" ? task.output : undefined };
}

/** Poll a DeepResearch task: on the signed-in user's Valyu credits, or self-hosted on the deployment's key. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const token = ACCOUNTS ? await getAccessToken() : null;
  if (ACCOUNTS && !token) return NextResponse.json({ error: "Sign in again.", needsAuth: true }, { status: 401 });
  try {
    const task = token ? await callAsUser<StatusResponse>(token, `/v1/deepresearch/tasks/${id}/status`, undefined, "GET") : await statusOnDeploymentKey(id);
    const step = task.progress?.current_step ?? task.current_step ?? 0;
    const total = task.progress?.total_steps ?? task.total_steps ?? 0;
    return NextResponse.json(
      {
        status: task.status,
        step,
        total,
        output: task.status === "completed" ? task.output : undefined,
        pdfUrl: task.status === "completed" ? task.pdf_url : undefined,
        sources: task.status === "completed" ? (task.sources ?? []).filter((s) => s.url).slice(0, 12) : undefined,
        error: task.error ? "Research did not finish. Please try again shortly." : undefined,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.error("[research status] Request failed");
    return NextResponse.json({ error: "Could not check progress just now." }, { status: 502 });
  }
}
