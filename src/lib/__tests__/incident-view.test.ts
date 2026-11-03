import { describe, expect, it } from "vitest";

import { INCIDENT_STATUSES, incidentView } from "@/lib/incident-view";
import type { Incident, IncidentStatus } from "@/lib/types";
import { useSituation } from "@/stores/situation";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-03T12:00:00Z");
const all = new Set<IncidentStatus>(INCIDENT_STATUSES);
const options = { now: NOW, windowMs: DAY, country: null, statuses: all };

function incident(id: string, status: IncidentStatus, age = DAY / 2, extra: Partial<Incident> = {}): Incident {
  return {
    id,
    status,
    victim: id,
    title: id,
    summary: id,
    country: "US",
    date: new Date(NOW - age).toISOString(),
    updated: new Date(NOW).toISOString(),
    type: "data_breach",
    cves: [],
    lat: 0,
    lon: 0,
    geoBasis: "country",
    severity: 2,
    confidence: 0.8,
    sources: [{ title: "Source", url: "https://example.test/advisory", kind: "news" }],
    origin: "news",
    ...extra,
  };
}

describe("incident view and organisation counts", () => {
  it("keeps available status counts when a status is hidden, while filtering results and bars", () => {
    const records = [incident("a", "confirmed"), incident("b", "reported"), incident("c", "claimed")];
    const before = incidentView(records, options);
    const after = incidentView(records, { ...options, statuses: new Set(["reported", "claimed"]) });
    expect(after.summary.statusCounts).toEqual(before.summary.statusCounts);
    expect(after.summary.organisations).toBe(2);
    expect(after.summary.availableOrganisations).toBe(3);
    expect(after.incidents.map((item) => item.id)).toEqual(["b", "c"]);
    expect(after.days[13].total).toBe(2);
    expect(after.summary.filtered).toBe(true);
  });

  it("counts organisations once across duplicate records and domain/name variations", () => {
    const records = [
      incident("a", "confirmed", undefined, { victim: "Acme", domain: "www.ACME.example" }),
      incident("b", "confirmed", undefined, { victim: "Acme Incorporated", domain: "https://acme.example/" }),
      incident("c", "claimed", undefined, { victim: "  ACME  " }),
    ];
    const { summary, days } = incidentView(records, options);
    expect(summary.organisations).toBe(1);
    expect(summary.incidentCount).toBe(3);
    expect(summary.statusCounts.confirmed).toBe(1);
    expect(summary.statusCounts.claimed).toBe(1);
    expect(days[13].total).toBe(1);
    expect(incidentView(records, { ...options, statuses: new Set(["claimed"]) }).summary.organisations).toBe(1);
  });

  it("does not merge different domains solely because organisation names match", () => {
    const records = [
      incident("a", "confirmed", undefined, { victim: "Acme", domain: "acme.example" }),
      incident("b", "confirmed", undefined, { victim: "Acme", domain: "other.example" }),
      incident("c", "claimed", undefined, { victim: "Acme" }),
    ];
    expect(incidentView(records, options).summary.organisations).toBe(3);
  });

  it("applies the time window and country before computing available status counts", () => {
    const records = [
      incident("today", "confirmed"),
      incident("week", "claimed", 3 * DAY),
      incident("month", "reported", 20 * DAY),
      incident("uk", "confirmed", undefined, { country: "GB" }),
    ];
    const view = (windowMs: number) => incidentView(records, { ...options, windowMs, country: "US" });
    expect(view(DAY).summary.availableOrganisations).toBe(1);
    expect(view(7 * DAY).summary.availableOrganisations).toBe(2);
    expect(view(30 * DAY).summary.availableOrganisations).toBe(3);
    expect(view(DAY).summary.statusCounts).toMatchObject({ confirmed: 1, claimed: 0, reported: 0 });
    expect(view(DAY).days[10].total).toBe(1);
  });

  it("keeps reported, precautionary and disputed counts separate", () => {
    const records = [incident("a", "reported"), incident("b", "precautionary"), incident("c", "disputed")];
    expect(incidentView(records, options).summary.statusCounts).toEqual({ confirmed: 0, reported: 1, claimed: 0, precautionary: 1, disputed: 1 });
  });

  it("excludes future, invalid and out-of-window records without changing genuine zero counts", () => {
    const records = [
      incident("future", "confirmed", -DAY),
      incident("invalid", "confirmed", undefined, { date: "invalid" }),
      incident("old", "confirmed", DAY),
    ];
    const { summary, incidents, days } = incidentView(records, options);
    expect(summary.organisations).toBe(0);
    expect(summary.statusCounts.confirmed).toBe(0);
    expect(incidents).toEqual([]);
    expect(days[13].total).toBe(0);
  });

  it("can show an empty selection and restore the original counts", () => {
    const records = [incident("a", "confirmed")];
    expect(incidentView(records, { ...options, statuses: new Set() }).summary).toMatchObject({
      organisations: 0,
      availableOrganisations: 1,
      statusCounts: { confirmed: 1 },
    });
    expect(incidentView(records, options).summary.organisations).toBe(1);
  });

  it("lets every status toggle off and back on without a hidden last-status exception", () => {
    const previous = useSituation.getState().statuses;
    useSituation.setState({ statuses: new Set(INCIDENT_STATUSES) });
    try {
      for (const status of INCIDENT_STATUSES) useSituation.getState().toggleStatus(status);
      expect(useSituation.getState().statuses.size).toBe(0);
      useSituation.getState().toggleStatus("confirmed");
      expect([...useSituation.getState().statuses]).toEqual(["confirmed"]);
    } finally {
      useSituation.setState({ statuses: previous });
    }
  });
});
