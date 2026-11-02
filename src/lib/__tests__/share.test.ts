import { describe, expect, it } from "vitest";

import { readShared, sharedDetail, sharedHeadline, sharedLevel, sharedQuery } from "@/app/check/share/verdict";

/** The counts the results page showed for lodash 4.17.15 and next 14.0.0: nothing in KEV, 4 likely soon, 3 critical. */
const NEXT_AND_LODASH = { exploited: 0, malicious: 0, likely: 4, critical: 3, checked: 2, products: false, date: "2026-10-25" };

describe("shared check result", () => {
  it("carries likely and critical counts, so a risky check never reads as 0 found", () => {
    const query = sharedQuery(NEXT_AND_LODASH);
    expect(query).toBe("e=0&m=0&l=4&c=3&n=2&d=2026-10-25");
    const shared = readShared(Object.fromEntries(new URLSearchParams(query)));
    expect(shared).toEqual(NEXT_AND_LODASH);
    expect(sharedHeadline(shared!)).toBe("I checked 2 packages: 7 serious vulnerabilities found.");
    expect(sharedDetail(shared!)).toMatch(/^4 are likely to be exploited soon and 3 are rated critical, none known to be exploited yet\./);
    expect(sharedLevel(shared!)).toBe("reported");
  });

  it("puts exploited and malicious first and counts the rest as other serious findings", () => {
    const shared = { ...NEXT_AND_LODASH, exploited: 1, malicious: 2 };
    expect(sharedHeadline(shared)).toBe(
      "I checked 2 packages: 1 actively exploited vulnerability, 2 malicious packages and 7 other serious vulnerabilities found.",
    );
    expect(sharedLevel(shared)).toBe("confirmed");
  });

  it("says 0 found only when nothing serious was found, and reads old links without l or c", () => {
    const old = readShared({ e: "0", m: "0", n: "2" })!;
    expect(old).toMatchObject({ likely: 0, critical: 0 });
    expect(sharedHeadline(old)).toBe("I checked 2 packages for exploited vulnerabilities and malware: 0 found.");
    expect(sharedLevel(old)).toBe("safe");
  });

  it("keeps product shares to the exploited count and never carries names", () => {
    const query = sharedQuery({ exploited: 1, malicious: 0, likely: 0, critical: 0, checked: 4, products: true });
    expect(query).toBe("e=1&m=0&n=4&t=products");
    expect(sharedLevel(readShared(Object.fromEntries(new URLSearchParams(query)))!)).toBe("reported");
    expect([...new URLSearchParams(sharedQuery(NEXT_AND_LODASH)).values()].every((value) => /^[\d-]+$/.test(value))).toBe(true);
  });
});
