import { NextResponse } from "next/server";

import { ValyuProxyError, callAsUser, getAccessToken } from "@/lib/auth/server";
import { countryName } from "@/lib/geo";
import { reserveSharedWork } from "@/lib/http/paid-budget";
import { findIncident, findVuln } from "@/lib/lookup";
import { ACCOUNTS } from "@/lib/mode";
import { valyuServer } from "@/lib/valyu/server";

export const maxDuration = 60;

interface CreateResponse {
  deepresearch_id?: string;
  status?: string;
  error?: string;
}

/** Self-hosted: research runs on the deployment's own key, capped per visitor and overall. */
async function startOnDeploymentKey(query: string, metadata: Record<string, string>) {
  const valyu = valyuServer();
  if (!valyu) return NextResponse.json({ error: "This deployment has no Valyu API key." }, { status: 503 });
  await reserveSharedWork("research");
  const task = await valyu.deepresearch.create({ query, mode: "fast", outputFormats: ["markdown", "pdf"], metadata });
  if (!task.success || !task.deepresearch_id) {
    console.error("[research] Upstream task rejected");
    return NextResponse.json({ error: "Research could not start just now. Try again in a minute." }, { status: 502 });
  }
  return NextResponse.json({ taskId: task.deepresearch_id, status: task.status ?? "queued" });
}

/** Start a DeepResearch task: on the signed-in user's Valyu credits, or self-hosted on the deployment's key. */
export async function POST(request: Request) {
  const token = ACCOUNTS ? await getAccessToken() : null;
  if (ACCOUNTS && !token) return NextResponse.json({ error: "Sign in with Valyu to run research on your own credits.", needsAuth: true }, { status: 401 });

  const { kind, id, items } = (await request.json().catch(() => ({}))) as { kind?: "incident" | "cve" | "stack"; id?: string; items?: unknown };
  let query: string | null = null;
  if (kind === "stack") {
    // Names only, as picked or typed: printable, short and few, so the query cannot carry anything else.
    const names = (Array.isArray(items) ? items : [])
      .filter((item): item is string => typeof item === "string")
      .map((item) =>
        item
          .replace(/[^\p{L}\p{N} .,&+\-/()]/gu, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 60),
      )
      .filter((item) => item.length >= 2)
      .slice(0, 25);
    if (names.length) {
      query = `Write a security brief for someone who uses: ${names.join("; ")}.
For each item, cover the last 90 days: vulnerabilities being exploited in the wild (CISA KEV, vendor statements), newly disclosed critical vulnerabilities, and any breach or security incident at the vendor itself. Give affected and fixed versions, what to update or change, and how to tell whether they were hit. Rank everything by urgency, separate confirmed facts from claims, cite vendor advisories and primary sources, and end with a prioritised checklist a non-specialist can follow this week.`;
    }
  } else if (kind === "incident" && id) {
    const incident = await findIncident(id);
    if (incident) {
      query = `Investigate the ${incident.type.replace("_", " ")} affecting ${incident.victim} (${countryName(incident.country)}), first reported around ${incident.date.slice(0, 10)}.
Establish: what happened and when; how the attackers got in, if known; what data and systems were affected and how many people; whether it is confirmed by the organisation or a regulator or only claimed; the threat actor and its recent pattern of victims; what customers, suppliers and partners should do now; and what similar organisations should check this week.
Separate confirmed facts from claims, cite primary sources, and end with a short action list.`;
    }
  } else if (kind === "cve" && id) {
    const vuln = await findVuln(id);
    if (vuln) {
      query = `Produce a remediation brief for ${vuln.cve}${vuln.vendor ? ` (${vuln.vendor} ${vuln.product})` : ""}: ${vuln.name}.
Cover affected and fixed versions per product line, whether it is exploited in the wild (CISA KEV, vendor statements, threat intelligence), known exploitation patterns and indicators, how to detect exposure and compromise, the upgrade or mitigation steps, and what to prioritise today. Cite the vendor advisory and primary sources.`;
    }
  }
  if (!query) return NextResponse.json({ error: kind === "stack" ? "Add something you use first." : "Unknown incident or CVE." }, { status: 404 });
  const metadata = { app: "globalhackmap", kind: kind ?? "", id: kind === "stack" ? "stack" : (id ?? "") };

  try {
    if (!token) return await startOnDeploymentKey(query, metadata);
    const task = await callAsUser<CreateResponse>(token, "/v1/deepresearch/tasks", {
      query,
      mode: "fast",
      output_formats: ["markdown", "pdf"],
      metadata,
    });
    if (!task.deepresearch_id) return NextResponse.json({ error: "Could not start research. Please try again shortly." }, { status: 502 });
    return NextResponse.json({ taskId: task.deepresearch_id, status: task.status ?? "queued" });
  } catch (error) {
    if (error instanceof ValyuProxyError && error.status === 402) {
      return NextResponse.json({ error: "Your Valyu account needs more credits for this.", needsCredits: true }, { status: 402 });
    }
    if (error instanceof ValyuProxyError && error.status === 401) {
      return NextResponse.json({ error: "Your Valyu session expired. Sign in again.", needsAuth: true }, { status: 401 });
    }
    console.error("[research] Request failed");
    return NextResponse.json({ error: "Research could not start just now. Try again in a minute." }, { status: 502 });
  }
}
