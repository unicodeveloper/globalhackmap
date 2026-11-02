import { describe, expect, it } from "vitest";

import { checkTerms, popularPick } from "@/lib/stack/popular";
import { stackMatch } from "@/stores/stack";

describe("popular picks", () => {
  it("asks about the names CISA files a pick under", () => {
    // Most Chrome entries in KEV are filed as "Google Chromium V8", "Chromium Mojo" and so on.
    expect(checkTerms("Google Chrome")).toContain("Google Chromium");
    expect(checkTerms("google chrome")).toContain("Google Chromium");
    expect(checkTerms("Microsoft 365")).toContain("Microsoft Exchange Server");
  });

  it("passes anything else through as typed", () => {
    expect(checkTerms("Ticketmaster")).toEqual(["Ticketmaster"]);
    expect(popularPick("Ticketmaster")).toBeUndefined();
  });

  it("matches a pick by its catalogue names, not only its label", () => {
    expect(stackMatch(["Apple iPhone and Mac"], "Apple macOS Improper Authentication")).toBe("Apple iPhone and Mac");
    expect(stackMatch(["Google Chrome"], "Google Chromium V8 Type Confusion")).toBe("Google Chrome");
    expect(stackMatch(["Zoom"], "Google Chromium V8 Type Confusion")).toBeNull();
  });
});
