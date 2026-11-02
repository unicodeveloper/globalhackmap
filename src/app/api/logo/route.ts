import { NextResponse } from "next/server";

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/**
 * Favicon proxy. Google's favicon service answers 404 for unknown sites (the browser would
 * otherwise render a generic placeholder), and proxying keeps visitors' IPs away from third parties.
 */
export async function GET(request: Request) {
  const domain =
    new URL(request.url).searchParams
      .get("d")
      ?.toLowerCase()
      .replace(/^www\./, "") ?? "";
  if (!DOMAIN.test(domain)) return new NextResponse(null, { status: 400 });
  const upstream = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=64`;
  const res = await fetch(upstream, { next: { revalidate: 60 * 60 * 24 * 14 }, signal: AbortSignal.timeout(6000) }).catch(() => null);
  if (!res || !res.ok) {
    // A transparent pixel rather than a 404 keeps consoles clean; the client swaps in a monogram.
    // Only a 404 means "no favicon"; a timeout or upstream error is cached briefly so it heals.
    const known = res?.status === 404;
    return new NextResponse(PIXEL, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": known ? "public, max-age=86400, s-maxage=604800" : "public, max-age=300, s-maxage=300",
        "X-Logo": "missing",
      },
    });
  }
  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "image/png",
      "Cache-Control": "public, max-age=604800, s-maxage=2592000, immutable",
    },
  });
}
