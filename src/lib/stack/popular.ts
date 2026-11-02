/**
 * The software and services most people and small teams use, offered as one-tap picks. `terms` are what
 * the product check is asked about: CISA files Chrome flaws under "Chromium", Office under "Office", so a
 * pick can stand for several catalogue names. Client-safe: no data beyond this list.
 */
export interface PopularPick {
  name: string;
  domain: string;
  group: "work" | "devices" | "network" | "web";
  terms?: string[];
}

export const POPULAR: PopularPick[] = [
  { name: "Microsoft Windows", domain: "microsoft.com", group: "devices" },
  {
    name: "Microsoft 365",
    domain: "microsoft.com",
    group: "work",
    terms: ["Microsoft Office", "Microsoft Exchange Server", "Microsoft SharePoint", "Microsoft Outlook"],
  },
  { name: "Google Chrome", domain: "google.com", group: "devices", terms: ["Google Chrome", "Google Chromium"] },
  { name: "Apple iPhone and Mac", domain: "apple.com", group: "devices", terms: ["Apple"] },
  { name: "Android", domain: "android.com", group: "devices" },
  { name: "Google Workspace", domain: "google.com", group: "work" },
  { name: "Zoom", domain: "zoom.us", group: "work" },
  { name: "Slack", domain: "slack.com", group: "work" },
  { name: "Salesforce", domain: "salesforce.com", group: "work" },
  { name: "Okta", domain: "okta.com", group: "work" },
  { name: "Atlassian", domain: "atlassian.com", group: "work" },
  { name: "WordPress", domain: "wordpress.org", group: "web" },
  { name: "Cloudflare", domain: "cloudflare.com", group: "web" },
  { name: "GitLab", domain: "gitlab.com", group: "web" },
  { name: "PHP", domain: "php.net", group: "web" },
  { name: "Fortinet", domain: "fortinet.com", group: "network" },
  { name: "Cisco", domain: "cisco.com", group: "network" },
  { name: "Palo Alto Networks", domain: "paloaltonetworks.com", group: "network" },
  { name: "Ivanti", domain: "ivanti.com", group: "network" },
  { name: "Citrix", domain: "citrix.com", group: "network" },
  { name: "SonicWall", domain: "sonicwall.com", group: "network" },
  { name: "VMware", domain: "vmware.com", group: "network" },
  { name: "Veeam", domain: "veeam.com", group: "network" },
];

export const GROUPS: { id: PopularPick["group"]; label: string }[] = [
  { id: "devices", label: "Devices and browsers" },
  { id: "work", label: "Work apps" },
  { id: "network", label: "Network and security" },
  { id: "web", label: "Websites and hosting" },
];

const byName = new Map(POPULAR.map((pick) => [pick.name.toLowerCase(), pick]));

export function popularPick(name: string): PopularPick | undefined {
  return byName.get(name.trim().toLowerCase());
}

/** What to ask the product check about for one picked or typed name. */
export function checkTerms(name: string): string[] {
  return popularPick(name)?.terms ?? [name];
}
