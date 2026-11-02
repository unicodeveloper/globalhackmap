import type { Incident } from "@/lib/types";

/** The slice of an incident the "companies I use" check needs on the client. */
export type CheckIncident = Pick<Incident, "id" | "victim" | "domain" | "status" | "type" | "title" | "date" | "actor" | "country">;

const SUFFIXES = new Set([
  "inc",
  "incorporated",
  "ltd",
  "limited",
  "llc",
  "plc",
  "corp",
  "corporation",
  "co",
  "company",
  "group",
  "holdings",
  "holding",
  "the",
  "sa",
  "ag",
  "gmbh",
  "bv",
  "nv",
  "spa",
  "srl",
  "kk",
  "pty",
  "ab",
  "as",
  "oy",
  "se",
]);

function norm(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ");
}

function words(value: string): string[] {
  return norm(value)
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !SUFFIXES.has(word));
}

/** Levenshtein distance capped at 2, enough to forgive one typo in a long word. */
function near(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length] <= 1;
}

function score(query: string, incident: CheckIncident): number {
  const q = words(query);
  if (!q.length) return 0;
  const joined = q.join(" ");
  const name = words(incident.victim);
  const nameJoined = name.join(" ");
  const host = incident.domain?.toLowerCase().replace(/^www\./, "") ?? "";
  const hostLabel = host.split(".")[0] ?? "";

  if (nameJoined === joined) return 100;
  if (host && (norm(query).trim() === host || joined.replace(/ /g, "") === hostLabel)) return 90;
  // Every query word is a whole word of the name ("bank of america" in "Bank of America Merchant Services").
  if (q.every((word) => name.includes(word))) return joined.length >= 3 ? 80 - Math.min(20, name.length - q.length) : 0;
  if (joined.length >= 4 && nameJoined.startsWith(joined)) return 65;
  if (joined.length >= 4 && nameJoined.replace(/ /g, "").includes(joined.replace(/ /g, ""))) return 50;
  // One typo in a single long word ("capcomm", "ticketmastr").
  if (q.length === 1 && q[0].length >= 5 && name.some((word) => near(word, q[0]))) return 40;
  return 0;
}

/** Incidents for one typed name, best match first. */
export function matchIncidents(query: string, incidents: CheckIncident[]): CheckIncident[] {
  return incidents
    .map((incident) => ({ incident, score: score(query, incident) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || b.incident.date.localeCompare(a.incident.date))
    .map((hit) => hit.incident);
}
