import { NextResponse } from "next/server";

import { answerAsUser, answerShared } from "@/lib/ai/answer";
import { takeFreeBrief } from "@/lib/ai/quota";
import { ValyuProxyError, getAccessToken } from "@/lib/auth/server";
import { clientIp, limitResponse, takeLimits } from "@/lib/http/rate-limit";
import { findIncident, findVuln } from "@/lib/lookup";
import { countryName } from "@/lib/geo";
import { ACCOUNTS } from "@/lib/mode";

export const maxDuration = 120;

export async function POST(request: Request) {
  const { kind, id } = (await request.json().catch(() => ({}))) as { kind?: "incident" | "cve" | "question"; id?: string };
  if (!id || (kind !== "incident" && kind !== "cve" && kind !== "question")) return NextResponse.json({ error: "bad request" }, { status: 400 });

  let question: string;
  let startDate: string | undefined;
  if (kind === "incident") {
    const incident = await findIncident(id);
    if (!incident) return NextResponse.json({ error: "Unknown incident" }, { status: 404 });
    question = `What do we know about the ${incident.type.replace("_", " ")} affecting ${incident.victim} (${countryName(incident.country)}), first reported around ${incident.date.slice(0, 10)}? Explain what happened, what data or systems are affected, whether the organisation has confirmed it or it is only claimed, who is affected, and exactly what customers and partners should do now.`;
    startDate = new Date(Date.parse(incident.date) - 5 * 86_400_000).toISOString().slice(0, 10);
  } else if (kind === "question") {
    const text = id.replace(/\s+/g, " ").trim().slice(0, 300);
    if (text.length < 3) return NextResponse.json({ error: "Ask a longer question" }, { status: 400 });
    question = `${text}\n\nAnswer for someone who wants to know if they are affected by current cyber incidents and what to do. Today is ${new Date().toISOString().slice(0, 10)}.`;
    startDate = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  } else {
    const vuln = await findVuln(id);
    if (!vuln) return NextResponse.json({ error: "Unknown CVE" }, { status: 404 });
    question = `${vuln.cve}${vuln.vendor ? ` in ${vuln.vendor} ${vuln.product}` : ""}: ${vuln.name}. Is it being exploited in the wild? Which versions are affected and which versions fix it? What should defenders do today, and how can someone check whether they are affected? Cite the vendor advisory.`;
  }

  try {
    const token = ACCOUNTS ? await getAccessToken() : null;
    if (token) {
      const result = await answerAsUser(token, question, startDate);
      return NextResponse.json({ ...result, mode: "user" });
    }
    // The cookie is a courtesy limit (clearing it resets it); these caps bound what scripts can spend.
    const limited = limitResponse(await takeLimits([{ key: `free-brief:${clientIp(request)}`, limit: 12, windowMs: 3_600_000 }]));
    if (limited) return limited;
    // Self-hosted deployments have no accounts to send people to, so only the caps above apply.
    const quota = ACCOUNTS ? await takeFreeBrief() : null;
    if (quota && !quota.allowed) {
      return NextResponse.json(
        { error: "You have used today's free AI briefs. Sign in with Valyu to keep going on your own free credits.", needsAuth: true },
        { status: 429 },
      );
    }
    const cacheKey =
      kind === "question"
        ? `q:${id
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim()}`
        : `${kind}:${id}`;
    const result = await answerShared(cacheKey, question, startDate);
    return NextResponse.json(quota ? { ...result, mode: "free", remaining: quota.remaining } : result);
  } catch (error) {
    if (error instanceof ValyuProxyError && error.status === 402) {
      return NextResponse.json({ error: "Your Valyu account is out of credits.", needsCredits: true }, { status: 402 });
    }
    if (error instanceof ValyuProxyError && error.status === 401) {
      return NextResponse.json({ error: "Your Valyu session expired. Sign in again.", needsAuth: true }, { status: 401 });
    }
    // Upstream messages can carry request details or credentials; keep diagnostics generic too.
    console.error("[brief] Request failed");
    return NextResponse.json({ error: "The brief could not be written just now. Try again in a minute." }, { status: 502 });
  }
}
