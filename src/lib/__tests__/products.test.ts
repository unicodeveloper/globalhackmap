import { describe, expect, it, vi } from "vitest";

import { parseStack } from "@/lib/stack/parse";
import type { Vuln } from "@/lib/types";

// products.ts is server-only in the app; the guard throws outside a React server build, so stub it here.
vi.mock("server-only", () => ({}));
const { matchProducts, productsExploited } = await import("@/lib/stack/products");

/** A catalogue entry with the vendor, product and name fields as CISA and the news feed file them. */
function vuln(cve: string, vendor: string, product: string, name: string, extra: Partial<Vuln> = {}): Vuln {
  return { cve, vendor, product, name, description: name, kev: true, kevAdded: "2025-01-01", ransomware: false, references: [], ...extra };
}

const KEV: Vuln[] = [
  // Real PHP.
  vuln("CVE-2024-4577", "PHP Group", "PHP", "PHP-CGI OS Command Injection Vulnerability"),
  // Bait for "PHP": "PHP" only in the name or the description, or a library CISA files under vendor "PHP".
  vuln("CVE-2025-68645", "Synacor", " Zimbra Collaboration Suite (ZCS)", "Synacor Zimbra Collaboration Suite (ZCS) PHP Remote File Inclusion Vulnerability"),
  vuln("CVE-2016-10033", "PHP", "PHPMailer", "PHPMailer Command Injection Vulnerability"),
  vuln("CVE-2023-36845", "Juniper", "Junos OS", "Juniper Junos OS EX Series and SRX Series PHP External Variable Modification Vulnerability"),
  vuln("CVE-2023-22952", "SugarCRM", "Multiple Products", "Multiple SugarCRM Products Remote Code Execution Vulnerability", {
    description: "Multiple SugarCRM products contain a remote code execution vulnerability in the EmailTemplates. Custom PHP code can be injected.",
  }),
  // Windows, including a component filed under its own product name.
  vuln("CVE-2026-96951", "Microsoft", "Windows", "Microsoft Windows Command Injection Vulnerability"),
  vuln(
    "CVE-2026-68820",
    "Microsoft",
    "Windows Ancillary Function Driver for WinSock ",
    "Microsoft Windows Ancillary Function Driver for WinSock Use-After-Free",
  ),
  // WordPress, and cPanel, whose product field mentions WordPress Squared.
  vuln("CVE-2026-87902", "WordPress", "Core", "WordPress Core Remote File Inclusion Vulnerability"),
  vuln("CVE-2026-41940", "WebPros", "cPanel & WHM and WP2 (WordPress Squared)", "WebPros cPanel & WHM and WP2 (WordPress Squared) Missing Authentication"),
  // Fortinet: FortiOS by name, FortiOS inside a "Multiple Products" entry, and another Fortinet product.
  vuln("CVE-2019-6693", "Fortinet", "FortiOS", "Fortinet FortiOS Use of Hard-Coded Credentials Vulnerability"),
  vuln("CVE-2025-59718", "Fortinet", "Multiple Products", "Fortinet Multiple Products Improper Verification of Cryptographic Signature Vulnerability", {
    description: "Fortinet FortiOS, FortiSwitchMaster, FortiProxy, and FortiWeb contain an improper verification of cryptographic signature vulnerability.",
  }),
  vuln("CVE-2025-64446", "Fortinet", "FortiWeb", "Fortinet FortiWeb Path Traversal Vulnerability"),
  // Ivanti, including a product field that lists several products.
  vuln("CVE-2026-104935", "Ivanti", "Connect Secure", "Ivanti Connect Secure Authentication Bypass by Spoofing Vulnerability"),
  vuln("CVE-2025-22457", "Ivanti", "Connect Secure, Policy Secure, and ZTA Gateways", "Ivanti Connect Secure, Policy Secure, and ZTA Gateways Buffer Overflow"),
  vuln("CVE-2025-4427", "Ivanti", "Endpoint Manager Mobile (EPMM)", "Ivanti Endpoint Manager Mobile (EPMM) Authentication Bypass Vulnerability"),
  // Connect Secure under its old Pulse brand.
  vuln("CVE-2019-11510", "Ivanti", "Pulse Connect Secure", "Ivanti Pulse Connect Secure Arbitrary File Read Vulnerability"),
  // A vendor's other filing for the same product, and a product filed under a new owner.
  vuln("CVE-2021-22175", "GitLab", "GitLab", "GitLab Server-Side Request Forgery (SSRF) Vulnerability"),
  vuln("CVE-2021-39935", "GitLab", "Community and Enterprise Editions", "GitLab Community and Enterprise Editions Server-Side Request Forgery (SSRF)"),
  vuln("CVE-2026-59310", "Broadcom", "VMware vCenter", "Broadcom VMware vCenter Heap Overflow Vulnerability"),
  vuln("CVE-2024-38812", "VMware", "vCenter Server", "VMware vCenter Server Heap-Based Buffer Overflow Vulnerability"),
];

const NEWS: Vuln[] = [
  vuln("CVE-2024-8926", "PHP Group", "PHP", "PHP CGI Parameter Injection Vulnerability (CVE-2024-4577 bypass)", { kev: false, kevAdded: undefined }),
  // A PHP flaw that only affects Windows hosts: "Windows" in the name must not make it a Windows finding.
  vuln("CVE-2026-109700", "PHP Group", "PHP", "PHP-CGI argument injection on Windows with certain code pages", { kev: false, kevAdded: undefined }),
  vuln("CVE-2026-114196", "paytiumsupport", "Paytium", "WordPress Paytium plugin <= 5.0.5 - PHP Object Injection vulnerability", {
    kev: false,
    kevAdded: undefined,
  }),
];

function check(input: string) {
  return matchProducts(parseStack(input).products, KEV, NEWS);
}

const cves = (finding: { matches: { cve: string }[] }) => finding.matches.map((match) => match.cve).sort();
const news = (finding: { news: { cve: string }[] }) => finding.news.map((match) => match.cve).sort();

describe("product matching", () => {
  it("PHP matches PHP, not Zimbra, PHPMailer, Junos or SugarCRM", () => {
    const [php] = check("PHP 8.3.10");
    expect(php).toMatchObject({ name: "PHP", version: "8.3.10", kevTotal: 1 });
    expect(cves(php)).toEqual(["CVE-2024-4577"]);
    expect(news(php)).toEqual(["CVE-2024-8926", "CVE-2026-109700"]);
  });

  it("Windows 11 matches Windows, not a PHP flaw that mentions Windows", () => {
    const [windows] = check("Windows 11");
    expect(cves(windows)).toEqual(["CVE-2026-68820", "CVE-2026-96951"]);
    expect(news(windows)).toEqual([]);
  });

  it("WordPress matches WordPress, not cPanel or another vendor's plugin", () => {
    const [wordpress] = check("WordPress");
    expect(cves(wordpress)).toEqual(["CVE-2026-87902"]);
    expect(news(wordpress)).toEqual([]);
  });

  it("the verdict counts only products with real matches", () => {
    const findings = check("PHP 8.3.10, Windows 11, WordPress, Okta");
    expect(findings.map((finding) => [finding.name, finding.kevTotal])).toEqual([
      ["PHP", 1],
      ["Windows", 2],
      ["WordPress", 1],
      ["Okta", 0],
    ]);
    expect(productsExploited(findings)).toBe(3);
    // The old matcher said 4 of 4 for products that only appeared in other entries' text.
    expect(productsExploited(check("Zimbra Collaboration Suite, PHPMailer, Junos, Okta"))).toBe(3);
    expect(productsExploited(check("Okta, Splunk"))).toBe(0);
  });

  it("Fortinet FortiOS matches FortiOS entries, including a Multiple Products entry that names it", () => {
    const [fortios] = check("Fortinet FortiOS 7.4.2");
    expect(fortios.version).toBe("7.4.2");
    expect(cves(fortios)).toEqual(["CVE-2019-6693", "CVE-2025-59718"]);
    // FortiGate is the marketing name CISA files under FortiOS.
    expect(cves(check("FortiGate")[0])).toEqual(["CVE-2019-6693", "CVE-2025-59718"]);
  });

  it("Ivanti Connect Secure matches Ivanti Connect Secure, not other Ivanti products", () => {
    const [ivanti] = check("Ivanti Connect Secure");
    expect(cves(ivanti)).toEqual(["CVE-2019-11510", "CVE-2025-22457", "CVE-2026-104935"]);
    // Naming only the vendor covers everything filed under it.
    expect(check("Ivanti")[0].kevTotal).toBe(4);
  });

  it("keeps a vendor's other filings for the same product, including after a change of owner", () => {
    expect(cves(check("GitLab 17.2")[0])).toEqual(["CVE-2021-22175", "CVE-2021-39935"]);
    expect(cves(check("VMware vCenter")[0])).toEqual(["CVE-2024-38812", "CVE-2026-59310"]);
  });

  it("never matches on a generic word alone or inside a longer word", () => {
    expect(check("Server")[0].kevTotal).toBe(0);
    expect(check("Secure")[0].kevTotal).toBe(0);
    expect(cves(check("PHPMailer")[0])).toEqual(["CVE-2016-10033"]);
  });
});
