"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import { ClaudeCodeIcon, ClaudeIcon, CodexIcon, CursorIcon, OpenAIIcon } from "@/components/icons/agents";
import { type AgentLink, type AgentTarget, agentLinks, chatLinks, incidentRepoPrompt, repoAuditPrompt, repoLinks } from "@/lib/deeplinks";
import { cn } from "@/lib/utils";

const ICONS: Record<AgentTarget, (props: { className?: string }) => React.ReactNode> = {
  "claude-code": ClaudeCodeIcon,
  "claude-code-web": ClaudeCodeIcon,
  codex: CodexIcon,
  cursor: CursorIcon,
  claude: ClaudeIcon,
  chatgpt: OpenAIIcon,
};

const ICON_COLOR: Record<AgentTarget, string> = {
  "claude-code": "text-ink",
  "claude-code-web": "text-ink",
  codex: "text-ink",
  cursor: "text-ink",
  claude: "text-ink",
  chatgpt: "text-ink",
};

function track(target: string, cve?: string) {
  void fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "fix_click", target, cve }),
    keepalive: true,
  }).catch(() => undefined);
}

function AgentButton({ link, cve }: { link: AgentLink; cve?: string }) {
  const Icon = ICONS[link.target];
  // Web pages open in a new tab; app links hand over to the installed app and leave this tab alone.
  const web = link.href.startsWith("https:");
  return (
    <a
      href={link.href}
      target={web ? "_blank" : undefined}
      rel="noreferrer"
      onClick={() => {
        track(link.target, cve);
        if (link.app) toast(`Opening ${link.label}. Read the prompt, then press enter.`);
      }}
      className="group press flex min-w-0 items-center gap-2.5 rounded-[12px] bg-white/[0.04] px-3 py-2.5 text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] transition-[background-color,box-shadow] hover:bg-white/[0.07] hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]"
    >
      <Icon className={cn("size-4 shrink-0", ICON_COLOR[link.target])} />
      <span className="truncate text-[13.5px] font-medium">{link.label}</span>
    </a>
  );
}

function CopyPrompt({ prompt, label = "Copy prompt", inline = false }: { prompt: string; label?: string; inline?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(prompt);
        setCopied(true);
        track("copy");
        toast("Prompt copied. Paste it into any coding agent or assistant.");
        window.setTimeout(() => setCopied(false), 1600);
      }}
      className={
        inline
          ? "press -ml-1.5 mt-1.5 inline-flex items-center gap-1.5 rounded-full px-1.5 py-1 text-[12.5px] text-ink-3 transition-colors hover:text-ink"
          : "press flex items-center justify-center gap-2 rounded-[12px] px-3 py-2.5 text-[13.5px] text-ink-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] transition-colors hover:bg-white/[0.04] hover:text-ink"
      }
    >
      {copied ? <Check className={cn(inline ? "size-3.5" : "size-4", "text-safe")} /> : <Copy className={inline ? "size-3.5" : "size-4"} />}
      {copied ? "Copied" : label}
    </button>
  );
}

function Group({ label, links, cve, copy }: { label: string; links: AgentLink[]; cve?: string; copy?: { prompt: string; label?: string; inline?: boolean } }) {
  // Assistants and the copy button are short enough to sit three across; the coding agents need two until there is room for four.
  const chat = links.every((link) => link.kind === "chat");
  return (
    <div className="@container">
      <p className="mb-2 text-[12.5px] text-ink-3">{label}</p>
      <div className={cn("grid gap-2", chat ? "grid-cols-3" : "grid-cols-2 @3xl:grid-cols-4")}>
        {links.map((link) => (
          <AgentButton key={link.target} link={link} cve={cve} />
        ))}
        {copy && !copy.inline ? <CopyPrompt prompt={copy.prompt} label={copy.label} /> : null}
      </div>
      {copy?.inline ? <CopyPrompt prompt={copy.prompt} label={copy.label} inline /> : null}
    </div>
  );
}

/** One-click fix: open a coding agent with a prompt that points at our runbook for this CVE, or have it explained. */
export function FixButtons({ cve }: { cve: string }) {
  const links = agentLinks(cve);
  const repo = links.filter((link) => link.kind === "repo");
  const chats = links.filter((link) => link.kind === "chat");
  return (
    <div className="grid gap-4">
      <Group
        label="Fix it in your code"
        links={repo}
        cve={cve}
        copy={{ prompt: repo[0].prompt, label: "Using another agent? Copy the prompt", inline: true }}
      />
      <Group label="Explain it to me" links={chats} cve={cve} copy={{ prompt: chats[0].prompt, label: "Copy" }} />
      <p className="text-[12px] leading-relaxed text-ink-4">
        Each opens with a short prompt that points at Global Hack Map&apos;s public runbook for {cve}. Nothing runs until you send it.
      </p>
    </div>
  );
}

/** For an incident: ask an assistant what it means for you, or have a coding agent check your systems for exposure. */
export function IncidentAgentButtons({ victim, url, prompt }: { victim: string; url: string; prompt: string }) {
  const repoPrompt = incidentRepoPrompt(victim, url);
  return (
    <div className="grid gap-4">
      <Group label="What it means for you" links={chatLinks(prompt)} copy={{ prompt, label: "Copy" }} />
      <Group
        label={`Check your systems for ${victim}`}
        links={repoLinks(repoPrompt)}
        copy={{ prompt: repoPrompt, label: "Using another agent? Copy the prompt", inline: true }}
      />
    </div>
  );
}

/** A whole repository, audited locally by the visitor's own coding agent: the code never leaves their machine. */
export function AuditButtons() {
  const prompt = repoAuditPrompt();
  return <Group label="Open in your coding agent" links={repoLinks(prompt)} copy={{ prompt, label: "Using another agent? Copy the prompt", inline: true }} />;
}
