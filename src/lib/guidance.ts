import type { Incident } from "@/lib/types";

export interface Guidance {
  people: string[];
  teams: string[];
}

const ACCOUNT_HYGIENE = [
  "If you have an account, change that password, and anywhere you reused it.",
  "Turn on two-factor authentication, ideally an authenticator app or passkey, not SMS.",
  "Expect phishing that uses your real details. Do not click links in messages about this incident; go to the company's site directly.",
];

const BY_TYPE: Record<Incident["type"], Guidance> = {
  data_breach: {
    people: [
      ...ACCOUNT_HYGIENE,
      "If payment cards were involved, watch statements and ask your bank for a new card.",
      "If government ID or social security numbers were involved, consider a credit freeze.",
    ],
    teams: [
      "If this is a vendor of yours, ask what of your data they held and whether it was in scope.",
      "Reset any API keys, SSO trusts or shared credentials you have with them.",
      "Brief your help desk: attackers often impersonate the breached brand next.",
    ],
  },
  ransomware: {
    people: [
      "Expect delays if you rely on this organisation's services, and keep records of anything you are owed.",
      ...ACCOUNT_HYGIENE.slice(0, 1),
      "Ransomware gangs often leak stolen files. Be wary of anyone contacting you about this organisation.",
    ],
    teams: [
      "If you connect to this organisation (VPN, file transfer, email), review and restrict those links until they confirm containment.",
      "Check that your own backups are offline or immutable and that you have tested a restore recently.",
      "Patch internet-facing VPNs, firewalls and remote access first: they are the usual way in.",
    ],
  },
  supply_chain: {
    people: [
      "Update the affected app or extension to the version the vendor names as clean.",
      "If you installed a compromised version, change passwords you used on that machine.",
    ],
    teams: [
      "Search your lockfiles and build logs for the affected package versions.",
      "If a malicious version was installed, rotate every secret that machine or pipeline could read.",
      "Pin dependencies and review install scripts in CI.",
    ],
  },
  ddos: {
    people: ["Your data is not usually at risk in a DDoS. Expect the service to be slow or offline for a while."],
    teams: ["Check that your DNS and CDN providers have DDoS protection enabled.", "Have a status page and a fallback channel ready for customers."],
  },
  cyberattack: {
    people: ["Follow updates from the organisation itself rather than social media.", ...ACCOUNT_HYGIENE],
    teams: [
      "If they are a supplier, ask for an incident summary and the indicators of compromise.",
      "Patch internet-facing systems first, especially VPNs, firewalls and file transfer software.",
    ],
  },
  espionage: {
    people: ["Most espionage targets organisations, not individuals. Watch for targeted phishing if you work with this organisation."],
    teams: ["Review the published indicators and hunt for them in your logs.", "Enforce phishing-resistant MFA for privileged accounts."],
  },
  extortion: {
    people: [...ACCOUNT_HYGIENE, "Never pay anyone who contacts you claiming to hold your data from this incident."],
    teams: [
      "Treat extortion claims as unverified until the organisation confirms them.",
      "Rotate shared credentials and review data you send to this organisation.",
    ],
  },
  defacement: {
    people: ["Avoid downloading anything from the affected website until it is restored."],
    teams: ["Check your own content management system and plugins are patched."],
  },
  other: {
    people: ACCOUNT_HYGIENE,
    teams: ["Ask the organisation for an incident summary if they are a supplier of yours."],
  },
};

export function guidanceFor(incident: Pick<Incident, "type" | "status">): Guidance {
  const base = BY_TYPE[incident.type] ?? BY_TYPE.other;
  if (incident.status === "claimed") {
    return {
      people: ["This is only a claim by the attackers so far. Do not panic, but do the basics:", ...base.people.slice(0, 2)],
      teams: ["Treat this as unverified. Ask the organisation directly before acting on it.", ...base.teams.slice(0, 2)],
    };
  }
  return base;
}

/** The ten things everyone should do this week. Plain English, no jargon. */
export const EVERYONE_CHECKLIST = [
  "Update your phone, laptop and browser today. Turn on automatic updates.",
  "Update your home router, or ask your provider to. Old routers are a favourite target.",
  "Use a password manager and a different password for every account.",
  "Turn on two-factor authentication for email, bank and social media. Passkeys are best.",
  "Your email is the master key: secure it first.",
  "Never click links in messages about breaches or deliveries. Go to the site yourself.",
  "Check haveibeenpwned.com to see where your email has leaked.",
  "Freeze your credit if your ID numbers have leaked. It is free and reversible.",
  "Back up your photos and files to somewhere that is not always connected.",
  "Tell your family. Most scams start with a message that looks like it is from someone you trust.",
];
