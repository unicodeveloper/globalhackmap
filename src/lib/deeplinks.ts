import { SITE_URL } from "@/lib/site";

export type AgentTarget = "claude-code" | "claude-code-web" | "codex" | "cursor" | "claude" | "chatgpt";

export interface AgentLink {
  target: AgentTarget;
  label: string;
  href: string;
  /** Opens a desktop app rather than a web page. */
  app: boolean;
  /** "repo": a coding agent that works in the visitor's code. "chat": an assistant that explains. */
  kind: "repo" | "chat";
  prompt: string;
}

/**
 * The prompt only carries the CVE ID and a link to our runbook, never third-party text,
 * so a poisoned advisory cannot inject instructions through the button.
 */
export function repoFixPrompt(cve: string): string {
  return `Check whether this repository is affected by ${cve} and fix it if it is.

Fetch ${SITE_URL}/fix/${cve} (use curl if you have no fetch tool) and follow the runbook. Find every place the affected package or product is used, upgrade to a fixed version, run the tests, and open a pull request that explains the change. If the repository is not affected, say so and explain why. Ask me before running anything that costs money.`;
}

export function explainPrompt(cve: string): string {
  return `Explain ${cve} to me in plain English: what is affected, whether it is being exploited, and exactly what I should do today. Start from ${SITE_URL}/fix/${cve} and check the vendor's own advisory before you answer. Be precise about versions and say what is confirmed versus claimed.`;
}

export function incidentPrompt(victim: string, url: string): string {
  return `I might be affected by the ${victim} security incident. Read ${url} and tell me in plain English: what happened, what data was involved, whether I need to do anything, and the exact steps to protect myself. Say what is confirmed versus only claimed.`;
}

/** For a whole repository: audit it locally against what is being exploited, so no code leaves the machine. */
export function repoAuditPrompt(): string {
  return `Audit this repository for vulnerabilities attackers are exploiting right now. Work locally and do not upload any code.

1. Run the dependency audit for each ecosystem present (npm, pnpm or yarn audit, pip-audit, govulncheck, cargo audit, bundle audit, composer audit, or osv-scanner).
2. Check each finding against CISA's Known Exploited Vulnerabilities and the list at ${SITE_URL}/cve. For any CVE, ${SITE_URL}/fix/<CVE-ID> has the fixed versions and steps.
3. Fix exploited ones first: upgrade to a fixed version, run the tests and open a pull request that explains each change. Report anything you could not fix. Ask me before running anything that costs money.`;
}

/** For an incident: does this codebase or its infrastructure depend on the victim, and what to rotate if so. */
export function incidentRepoPrompt(victim: string, url: string): string {
  return `Check whether this repository or the infrastructure it configures depends on ${victim}, which has had a security incident (details: ${url}).

Look for their SDKs and packages, API keys and tokens, OAuth apps, webhooks, SSO or SCIM settings, and hostnames in code, config and CI. If anything depends on them, list exactly where, say which credentials to rotate and what to monitor, and draft the changes. If nothing does, say so. Do not change anything until I confirm.`;
}

/**
 * Coding agents that work in the visitor's repository. Each link only pre-fills the prompt: Claude Code,
 * Codex and Cursor all wait for the visitor to send it. Claude Code on the web covers people without the app.
 */
export function repoLinks(prompt: string): AgentLink[] {
  const enc = encodeURIComponent;
  return [
    { target: "claude-code", label: "Claude Code", href: `claude-cli://open?q=${enc(prompt)}`, app: true, kind: "repo", prompt },
    { target: "codex", label: "Codex", href: `codex://new?prompt=${enc(prompt)}`, app: true, kind: "repo", prompt },
    { target: "cursor", label: "Cursor", href: `https://cursor.com/link/prompt?text=${enc(prompt)}`, app: true, kind: "repo", prompt },
    { target: "claude-code-web", label: "Claude Code (web)", href: `https://claude.ai/code/new?q=${enc(prompt)}`, app: false, kind: "repo", prompt },
  ];
}

export function chatLinks(prompt: string): AgentLink[] {
  const enc = encodeURIComponent;
  return [
    { target: "claude", label: "Claude", href: `https://claude.ai/new?q=${enc(prompt)}`, app: false, kind: "chat", prompt },
    { target: "chatgpt", label: "ChatGPT", href: `https://chatgpt.com/?q=${enc(prompt)}`, app: false, kind: "chat", prompt },
  ];
}

export function agentLinks(cve: string): AgentLink[] {
  return [...repoLinks(repoFixPrompt(cve)), ...chatLinks(explainPrompt(cve))];
}
