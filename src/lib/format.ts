import type { Incident, IncidentStatus, IncidentType } from "@/lib/types";

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  confirmed: "Confirmed",
  reported: "Reported",
  claimed: "Claimed",
  precautionary: "Precautionary",
  disputed: "Disputed",
};

export const STATUS_HELP: Record<IncidentStatus, string> = {
  confirmed: "The organisation, a regulator or a securities filing has confirmed it.",
  reported: "Reported by at least one news outlet. Not yet confirmed by the organisation.",
  claimed: "Only the attackers say so, on their leak site. Treat it as a claim, not a fact.",
  precautionary: "Systems were taken offline as a precaution. No compromise has been stated.",
  disputed: "The organisation denies it.",
};

export const STATUS_COLOR: Record<IncidentStatus, string> = {
  confirmed: "#ff4a3d",
  reported: "#ffb547",
  claimed: "#e9e3d6",
  precautionary: "#ffb547",
  disputed: "#8b95a1",
};

export const TYPE_LABEL: Record<IncidentType, string> = {
  ransomware: "Ransomware",
  data_breach: "Data breach",
  cyberattack: "Cyberattack",
  ddos: "DDoS",
  supply_chain: "Supply chain",
  espionage: "Espionage",
  extortion: "Extortion",
  defacement: "Defacement",
  other: "Incident",
};

export function compact(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** "10 Jan", or "10 Jan 2024" when it is not this year. */
export function shortDate(iso: string): string {
  const date = new Date(iso);
  const thisYear = date.getUTCFullYear() === new Date().getUTCFullYear();
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: thisYear ? undefined : "numeric", timeZone: "UTC" });
}

/** EPSS as a percentage that never rounds up to a false 100% or down to a false 0%. */
export function epssPercent(epss: number): string {
  const pct = epss * 100;
  const digits = pct >= 99 || pct < 1 ? 2 : pct < 10 ? 1 : 0;
  return `${Math.min(pct, 99.99).toFixed(digits)}%`;
}

export function utcClock(date: Date): string {
  return date.toISOString().slice(11, 19) + "Z";
}

export function placeLabel(incident: Pick<Incident, "city" | "country">, countryName: (iso: string) => string): string {
  const country = countryName(incident.country);
  return incident.city ? `${incident.city}, ${country}` : country;
}

/** Only a confirmed incident has confirmed records; anything else is a reported or claimed count. */
export function recordsLabel(incident: Pick<Incident, "records" | "recordsClaimed" | "status">): string | null {
  if (incident.records) return `${compact(incident.records)} records ${incident.status === "confirmed" ? "confirmed" : "reported"}`;
  if (incident.recordsClaimed) return `${compact(incident.recordsClaimed)} records claimed`;
  return null;
}
