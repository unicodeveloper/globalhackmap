import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";

import { countriesWithIncidents } from "@/lib/og/select";
import { SITE_URL } from "@/lib/site";
import { getSnapshot } from "@/lib/snapshot";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("feed");
  const snapshot = await getSnapshot().catch(() => null);
  const now = new Date(snapshot?.generatedAt ?? Date.now());
  const pages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/brief`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/check`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/cve`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/agents`, changeFrequency: "weekly", priority: 0.5 },
  ];
  if (!snapshot) return pages;

  const incidents: MetadataRoute.Sitemap = snapshot.incidents.map((incident) => ({
    url: `${SITE_URL}/incident/${encodeURIComponent(incident.id)}`,
    lastModified: new Date(incident.updated),
    changeFrequency: "daily",
    priority: 0.7,
  }));
  const cves = [...new Map([...snapshot.trending, ...snapshot.fresh, ...snapshot.kev].map((vuln) => [vuln.cve, vuln])).values()].map((vuln) => ({
    url: `${SITE_URL}/cve/${vuln.cve}`,
    ...(vuln.kevAdded ? { lastModified: new Date(`${vuln.kevAdded}T00:00:00Z`) } : vuln.published ? { lastModified: new Date(vuln.published) } : {}),
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));
  const countries: MetadataRoute.Sitemap = countriesWithIncidents(snapshot).map((code) => ({
    url: `${SITE_URL}/country/${code}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.5,
  }));
  return [...pages, ...incidents, ...cves, ...countries];
}
