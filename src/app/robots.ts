import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Named so it is explicit that AI crawlers and assistants are welcome: agents are first-class users.
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Amazonbot",
  "CCBot",
  "Meta-ExternalAgent",
  "MistralAI-User",
  "DuckAssistBot",
];

// API routes and the sign-in callback are not pages; everything else is open.
const PRIVATE = ["/api/", "/auth/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
