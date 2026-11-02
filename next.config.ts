import type { NextConfig } from "next";

const dev = process.env.NODE_ENV === "development";

const MAPBOX = "https://api.mapbox.com https://*.tiles.mapbox.com";
const NASA_GIBS = "https://gibs.earthdata.nasa.gov";

// Report-only for now: violations show in the console without breaking anything. Inline scripts stay
// allowed because the pages are static (ISR) and nonces would force them to render per request.
// Mapbox GL needs blob: workers and data:/blob: images; NASA GIBS serves the night-lights tiles.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${MAPBOX} ${NASA_GIBS}`,
  "font-src 'self' data:",
  `connect-src 'self' ${MAPBOX} https://events.mapbox.com ${NASA_GIBS}${dev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: csp },
  // Framing is enforced now: signed-in visitors spend their own Valyu credits, so no clickjacking.
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Clipboard and Web Share stay available: the copy and share buttons use them.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
];

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const nextConfig: NextConfig = {
  // Partial prerendering with `use cache`: static shells from the CDN, data cached per function.
  cacheComponents: true,
  // Links prefetch only the static shell, and unlisted dynamic routes serve their shell instantly.
  partialPrefetching: true,
  cacheLife: {
    // The live situation picture.
    snapshot: { stale: 5 * MINUTE, revalidate: 10 * MINUTE, expire: DAY },
    // Free public feeds (CISA, GitHub, IODA, RansomLook) and lists built from the snapshot.
    feed: { stale: 5 * MINUTE, revalidate: 15 * MINUTE, expire: DAY },
    // Per-CVE lookups and runbooks: NVD and OSV change slowly and rate-limit.
    lookup: { stale: HOUR, revalidate: 6 * HOUR, expire: 7 * DAY },
    // Shared AI answers on the deployment's key.
    answer: { stale: HOUR, revalidate: 6 * HOUR, expire: DAY },
    // Paid or slow per-item work whose result does not change: extractions, explainers, finished research.
    paid: { stale: DAY, revalidate: 7 * DAY, expire: 30 * DAY },
  },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // One build worker: collecting page data and prerendering share a single in-process snapshot and
    // explainer cache, instead of each worker rebuilding the pipeline and bursting Valyu's rate limits.
    cpus: 1,
    staticGenerationMinPagesPerWorker: 1000,
    staticGenerationMaxConcurrency: 4,
    staticGenerationRetryCount: 1,
    // The stylesheet ships inside the HTML, so first paint does not wait on a second request.
    inlineCss: true,
    // Production builds already tree-shake the icon barrel; this skips compiling all of it in dev.
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "www.google.com", pathname: "/s2/favicons" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
