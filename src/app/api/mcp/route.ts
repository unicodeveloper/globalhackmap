import { mcpHandler } from "@/lib/mcp/server";
import { SITE_URL } from "@/lib/site";
import { readBoundedBody } from "@/lib/http/body";
import { clientIp, limitResponse, takeLimits } from "@/lib/http/rate-limit";

export const maxDuration = 60;

async function handle(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && origin !== new URL(SITE_URL).origin) {
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  }
  if (request.method === "POST") {
    const body = await readBoundedBody(request, 1_048_576);
    if (!body) return Response.json({ error: "Request exceeds 1 MB." }, { status: 413 });
    const text = new TextDecoder().decode(body);
    let message: { method?: string; params?: { name?: string } } | null;
    try {
      message = JSON.parse(text);
    } catch {
      return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
    }
    if (Array.isArray(message)) return Response.json({ error: "Batch requests are not supported." }, { status: 400 });
    if (message?.method === "tools/call" && message.params?.name === "check_stack") {
      const ip = clientIp(request);
      const response = limitResponse(
        await takeLimits([
          { key: `check-burst:${ip}`, limit: 10, windowMs: 60_000 },
          { key: `check-hour:${ip}`, limit: 60, windowMs: 3_600_000 },
        ]),
      );
      if (response) return response;
    }
    return mcpHandler(new Request(request.url, { method: request.method, headers: request.headers, body: text, signal: request.signal }));
  }
  return mcpHandler(request);
}

export { handle as GET, handle as POST, handle as DELETE };
