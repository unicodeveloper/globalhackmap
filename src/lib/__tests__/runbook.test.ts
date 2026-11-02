import { describe, expect, it } from "vitest";

import {
  aliasHint,
  cveRecordSchema,
  firstUnaffected,
  groupAffected,
  linkedAliases,
  looksLikeExploit,
  markedUnaffected,
  osvFixed,
  pickReferences,
  readCveRecord,
  searchTerms,
} from "@/lib/runbook/facts";

// Shapes copied from the live CVE.org records for CVE-2026-109619, CVE-2025-0282, CVE-2021-44228 and CVE-2023-34362.
function record(cna: object, adp: object[] = [], assigner = "php") {
  return readCveRecord(
    cveRecordSchema.parse({ cveMetadata: { cveId: "CVE-2026-109619", state: "PUBLISHED", assignerShortName: assigner }, containers: { cna, adp } }),
  );
}

describe("CVE record versions", () => {
  it("reads fixed releases from lessThan bounds, which OSV lacked for PHP2Shell", () => {
    const facts = record({
      affected: [
        {
          vendor: "PHP Group",
          product: "PHP",
          packageName: "php-src",
          defaultStatus: "unaffected",
          versions: [
            { status: "affected", version: "8.2.*", lessThan: "8.2.35", versionType: "semver" },
            { status: "affected", version: "8.5.*", lessThan: "8.5.12", versionType: "semver" },
          ],
        },
      ],
      metrics: [{ format: "CVSS", cvssV4_0: { baseScore: 9.2 } }],
      references: [{ url: "https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp", tags: ["vendor-advisory"] }],
    });
    expect(facts.products).toHaveLength(1);
    expect(facts.products[0]).toMatchObject({ source: "php, the CNA", cna: true });
    expect(facts.products[0].versions.flatMap(firstUnaffected)).toEqual(["8.2.35", "8.5.12"]);
    expect(facts.scores).toEqual([{ score: 9.2, version: "4.0" }]);
    expect(facts.references[0].cna).toBe(true);
  });

  it("uses changes when the upper bound is a wildcard (Log4Shell)", () => {
    const facts = record({
      affected: [
        {
          vendor: "Apache Software Foundation",
          product: "Apache Log4j2",
          versions: [
            {
              version: "2.0-beta9",
              status: "affected",
              lessThan: "log4j-core*",
              changes: [
                { at: "2.3.1", status: "unaffected" },
                { at: "2.4", status: "affected" },
                { at: "2.12.2", status: "unaffected" },
                { at: "2.13.0", status: "affected" },
                { at: "2.15.0", status: "unaffected" },
              ],
            },
          ],
        },
      ],
    });
    expect(facts.products[0].versions.flatMap(firstUnaffected)).toEqual(["2.3.1", "2.12.2", "2.15.0"]);
  });

  it("never turns an inclusive bound into a fix, but reports explicit unaffected releases (Ivanti)", () => {
    const facts = record({
      affected: [
        {
          vendor: "Ivanti",
          product: "Connect Secure",
          versions: [
            { lessThanOrEqual: "22.7R2.4", status: "affected", version: "22.7R2" },
            { status: "unaffected", version: "22.7R2.5" },
          ],
        },
      ],
    });
    const [affected, unaffected] = facts.products[0].versions;
    expect(firstUnaffected(affected)).toEqual([]);
    expect(markedUnaffected(unaffected)).toBe("22.7R2.5");
  });

  it("falls back to CISA's enrichment when the CNA wrote n/a, merging per-CPE repeats (MOVEit)", () => {
    const facts = record(
      { affected: [{ vendor: "n/a", product: "n/a", versions: [{ version: "n/a", status: "affected" }] }] },
      [
        {
          providerMetadata: { shortName: "CISA-ADP" },
          affected: [
            {
              vendor: "progress",
              product: "moveit_transfer",
              defaultStatus: "unknown",
              versions: [{ status: "affected", version: "2021.0", lessThan: "2021.0.7" }],
            },
            {
              vendor: "progress",
              product: "moveit_transfer",
              defaultStatus: "unknown",
              versions: [{ status: "affected", version: "2022.1.0", lessThan: "2022.1.6" }],
            },
          ],
        },
      ],
      "mitre",
    );
    expect(facts.products).toHaveLength(1);
    // Flagged as enrichment: the runbook must not present these range ends as fixed releases.
    expect(facts.products[0]).toMatchObject({ source: "CISA-ADP, an ADP enricher", cna: false });
    expect(facts.products[0].versions).toHaveLength(2);
  });

  it("keeps the rest of a record when one entry is malformed", () => {
    const facts = record({
      affected: [
        {
          vendor: "PHP Group",
          product: "PHP",
          versions: [
            { status: "affected", version: 8 },
            { status: "affected", version: "8.3.*", lessThan: "8.3.36" },
          ],
        },
      ],
    });
    expect(facts.products[0].versions).toHaveLength(1);
  });
});

describe("OSV data", () => {
  it("follows the aliases OSV names in a 404, ecosystem advisories first", () => {
    const hinted = aliasHint({ code: 5, message: "Vulnerability not found, but the following aliases were: BIT-libphp-2026-109619 BIT-php-2026-109619" });
    expect(hinted).toEqual(["BIT-libphp-2026-109619", "BIT-php-2026-109619"]);
    expect(linkedAliases("CVE-2024-4577", ["BIT-php-2024-4577", "GHSA-3qgc-jrrr-25jv", "CVE-2024-4577", "openSUSE-SU-2024:1"])).toEqual([
      "GHSA-3qgc-jrrr-25jv",
      "BIT-php-2024-4577",
    ]);
    expect(aliasHint({ code: 5, message: "Vulnerability not found" })).toEqual([]);
  });

  it("groups ranges per package and folds packages that share one fix list", () => {
    const range = (introduced: string, fixed: string) => ({ type: "ECOSYSTEM", events: [{ introduced }, { fixed }] });
    const maven = { ecosystem: "Maven", name: "org.apache.logging.log4j:log4j-core" };
    const groups = groupAffected([
      { package: maven, versions: ["2.13.0"], ranges: [range("2.13.0", "2.15.0")] },
      { package: maven, versions: ["2.0"], ranges: [range("2.0-beta9", "2.3.1")] },
      { package: { ecosystem: "Bitnami", name: "php" }, versions: [], ranges: [range("0", "8.2.35")] },
      { package: { ecosystem: "Bitnami", name: "libphp" }, versions: [], ranges: [range("5.4.0", "8.2.35")] },
      { versions: [], ranges: [{ type: "GIT", repo: "https://github.com/apache/logging-log4j2", events: [{ introduced: "0" }, { fixed: "abc123" }] }] },
    ]);
    expect(groups).toHaveLength(4);
    expect(groups[0].ranges).toHaveLength(2);
    expect(osvFixed(groups)).toEqual([
      { ecosystem: "Maven", names: ["org.apache.logging.log4j:log4j-core"], fixed: ["2.15.0", "2.3.1"] },
      { ecosystem: "Bitnami", names: ["php", "libphp"], fixed: ["8.2.35"] },
    ]);
  });
});

describe("product search terms", () => {
  it("splits KEV product lists and drops terms a shorter one already matches", () => {
    expect(searchTerms(["Connect Secure, Policy Secure, and ZTA Gateways", "Neurons for ZTA gateways"])).toEqual([
      "Connect Secure",
      "Policy Secure",
      "ZTA Gateways",
    ]);
    expect(searchTerms(["PHP", "PHP", "php-src"])).toEqual(["PHP"]);
    expect(searchTerms(["n/a", ""])).toEqual([]);
  });
});

describe("references", () => {
  it("omits exploit and proof-of-concept links and puts vendor links first", () => {
    expect(looksLikeExploit({ url: "https://github.com/watchtowrlabs/CVE-2024-4577", tags: [] })).toBe(true);
    expect(looksLikeExploit({ url: "https://github.com/tangxiaofeng7/apache-log4j-poc", tags: [] })).toBe(true);
    expect(looksLikeExploit({ url: "https://github.com/rapid7/metasploit-framework/pull/19247", tags: [] })).toBe(true);
    expect(looksLikeExploit({ url: "https://packetstormsecurity.com/files/165225/x.html", tags: [] })).toBe(true);
    expect(looksLikeExploit({ url: "https://example.com/writeup", tags: ["evidence"] })).toBe(true);
    expect(looksLikeExploit({ url: "https://github.com/php/php-src/security/advisories/GHSA-3qgc-jrrr-25jv", tags: [] })).toBe(false);
    expect(looksLikeExploit({ url: "https://github.com/apache/logging-log4j2/pull/608", tags: [] })).toBe(false);

    const { picked, exploits, more } = pickReferences(
      [
        { url: "https://nvd.nist.gov/vuln/detail/CVE-2024-4577", tags: [] },
        { url: "https://blog.example.com/post", tags: [] },
        { url: "http://insecure.example.com/advisory", tags: ["vendor-advisory"] },
        { url: "https://github.com/watchtowrlabs/CVE-2024-4577", tags: [] },
        { url: "https://www.php.net/ChangeLog-8.php", tags: [], cna: true },
        { url: "https://vendor.example.com/advisory/", tags: ["vendor-advisory"] },
        { url: "https://vendor.example.com/advisory", tags: ["patch"] },
      ],
      ["https://nvd.nist.gov/vuln/detail/CVE-2024-4577"],
      { limit: 2 },
    );
    expect(picked.map((ref) => ref.url)).toEqual(["https://vendor.example.com/advisory/", "https://www.php.net/ChangeLog-8.php"]);
    expect(picked[0].tags).toEqual(["vendor-advisory", "patch"]);
    expect(exploits).toBe(1);
    expect(more).toBe(1);
  });

  it("ranks the product vendor's own site above other vendors' advisories (Log4Shell)", () => {
    const { picked } = pickReferences(
      [
        { url: "https://tools.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-apache-log4j", tags: ["vendor-advisory"], cna: true },
        { url: "https://logging.apache.org/log4j/2.x/security.html", tags: ["WEB"], cna: true },
      ],
      [],
      { vendorDomain: "apache.org" },
    );
    expect(picked.map((ref) => ref.url)[0]).toBe("https://logging.apache.org/log4j/2.x/security.html");
    expect(picked[0].tags).toEqual([]);
  });
});
