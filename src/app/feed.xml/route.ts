import { STATUS_LABEL, TYPE_LABEL } from "@/lib/format";
import { clean, placeText, statusLine, statusSentence } from "@/lib/og/copy";
import { newestFirst } from "@/lib/og/select";
import { SITE_URL } from "@/lib/site";
import { getSnapshot } from "@/lib/snapshot";

function xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** RSS 2.0 of the latest 50 incidents. Titles carry the status, so a claim never reads as a confirmed breach. */
export async function GET() {
  const snapshot = await getSnapshot();
  const items = newestFirst(snapshot.incidents)
    .slice(0, 50)
    .map((incident) => {
      const url = `${SITE_URL}/incident/${incident.id}`;
      const description = [statusSentence(incident), clean(incident.summary || incident.title), `${placeText(incident)}.`].join(" ");
      return `    <item>
      <title>${xml(`${incident.victim}: ${statusLine(incident)}`)}</title>
      <link>${xml(url)}</link>
      <guid isPermaLink="true">${xml(url)}</guid>
      <pubDate>${new Date(incident.date).toUTCString()}</pubDate>
      <description>${xml(description)}</description>
      <category>${xml(STATUS_LABEL[incident.status])}</category>
      <category>${xml(TYPE_LABEL[incident.type])}</category>
    </item>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Global Hack Map: cyber incidents, live</title>
    <link>${xml(SITE_URL)}</link>
    <atom:link href="${xml(`${SITE_URL}/feed.xml`)}" rel="self" type="application/rss+xml"/>
    <description>Every publicly reported breach, ransomware attack and leak-site claim, with an honest status: confirmed, reported, or only claimed by attackers.</description>
    <language>en</language>
    <lastBuildDate>${new Date(snapshot.generatedAt).toUTCString()}</lastBuildDate>
    <ttl>10</ttl>
${items}
  </channel>
</rss>
`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
    },
  });
}
