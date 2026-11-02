import { describe, expect, it, vi } from "vitest";

import { settle, unwrap } from "@/lib/fetched";
import { epssPercent, recordsLabel, shortDate } from "@/lib/format";
import { tidyVendor, vendorDomain } from "@/lib/vendors";
import { stackMatch } from "@/stores/stack";

describe("settle and unwrap", () => {
  it("never rejects, and unwrap rethrows outside the cache scope", async () => {
    await expect(settle(async () => 42)).resolves.toEqual({ ok: true, value: 42 });
    const failed = await settle(async () => {
      throw new Error("NVD 429");
    });
    expect(failed).toEqual({ ok: false, error: "NVD 429" });
    expect(() => unwrap(failed)).toThrow("NVD 429");
  });
});

describe("stackMatch", () => {
  it("matches whole words only, ignoring case", () => {
    expect(stackMatch(["PHP", "Ivanti"], "Ivanti", "Connect Secure")).toBe("Ivanti");
    expect(stackMatch(["php"], "PHP Group", "PHP")).toBe("php");
    // "PHP" must not match inside another word.
    expect(stackMatch(["php"], "phpMyAdmin")).toBeNull();
    expect(stackMatch([], "anything")).toBeNull();
  });
});

describe("honest formatting", () => {
  it("never rounds EPSS up to a false 100% or down to 0%", () => {
    expect(epssPercent(0.99987)).toBe("99.99%");
    expect(epssPercent(0.00004)).toBe("0.00%");
    expect(epssPercent(0.4237)).toBe("42%");
  });

  it("only calls records confirmed when the incident is confirmed", () => {
    expect(recordsLabel({ records: 1200, status: "reported" })).toBe("1.2K records reported");
    expect(recordsLabel({ records: 1200, status: "confirmed" })).toBe("1.2K records confirmed");
    expect(recordsLabel({ recordsClaimed: 5000, status: "claimed" })).toBe("5K records claimed");
  });

  it("shows the year only for dates outside the current year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
    expect(shortDate("2026-01-10T00:00:00Z")).toBe("10 Jan");
    expect(shortDate("2024-01-10T00:00:00Z")).toBe("10 Jan 2024");
    vi.useRealTimers();
  });
});

describe("vendors", () => {
  it("restores casing and finds logos only for known vendors", () => {
    expect(tidyVendor("Php")).toBe("PHP");
    expect(vendorDomain("Palo Alto Networks")).toBe("paloaltonetworks.com");
    expect(vendorDomain("EG Secure Solutions")).toBeUndefined();
  });
});
