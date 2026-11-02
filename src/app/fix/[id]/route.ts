import { isCveId } from "@/lib/lookup";
import { getRunbook } from "@/lib/runbook/render";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cve = id.toUpperCase();
  const markdown = isCveId(cve) ? await getRunbook(cve) : null;
  return new Response(
    markdown ?? "# Runbook not found\n\nUse a known CVE ID such as CVE-2021-44228. This ID is malformed or no vulnerability record is available.\n",
    {
      status: markdown ? 200 : 404,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        // A miss can be an upstream outage rather than an unknown CVE, so it is not held for an hour.
        "Cache-Control": markdown ? "public, s-maxage=3600, stale-while-revalidate=86400" : "public, s-maxage=300",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
