"use client";

import { ArrowUpRight } from "@phosphor-icons/react";
import { toast } from "sonner";

import { ClaudeCodeIcon, ClaudeIcon, CodexIcon, CursorIcon, OpenAIIcon } from "@/components/icons/agents";
import { type AgentLink, type AgentTarget, agentLinks } from "@/lib/deeplinks";
import { cn } from "@/lib/utils";

const ICONS: Record<AgentTarget, (props: { className?: string }) => React.ReactNode> = {
  "claude-code": ClaudeCodeIcon,
  "claude-code-web": ClaudeCodeIcon,
  codex: CodexIcon,
  cursor: CursorIcon,
  claude: ClaudeIcon,
  chatgpt: OpenAIIcon,
};

function track(target: string, cve: string) {
  void fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "fix_click", target, cve }),
    keepalive: true,
  }).catch(() => undefined);
}

function AgentLinkButton({ link, cve, primary }: { link: AgentLink; cve: string; primary: boolean }) {
  const Icon = ICONS[link.target];
  return (
    <a
      href={link.href}
      target={link.href.startsWith("https:") ? "_blank" : undefined}
      rel="noreferrer"
      onClick={() => {
        track(link.target, cve);
        if (link.app) toast(`Opening ${link.label}. Read the prompt, then press enter.`);
      }}
      className={cn(
        "group press flex items-center gap-2 rounded-full text-[13px]",
        primary
          ? "h-9 px-3.5 text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)] hover:bg-white/[0.05]"
          : "h-8 px-2.5 text-ink-3 hover:bg-white/[0.05] hover:text-ink",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {link.label}
      {link.href.startsWith("https:") ? <ArrowUpRight className="size-3 text-ink-4 transition-colors group-hover:text-ink-3" aria-hidden /> : null}
    </a>
  );
}

/** One-click handoff: open a coding agent with a prompt that points at the runbook, or ask an assistant to explain. */
export function OpenInAgent({ cve }: { cve: string }) {
  const links = agentLinks(cve);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Fix ${cve} in a coding agent`}>
        {links
          .filter((link) => link.kind === "repo")
          .map((link) => (
            <AgentLinkButton key={link.target} link={link} cve={cve} primary />
          ))}
      </div>
      <div className="flex flex-wrap items-center gap-0.5" role="group" aria-label={`Have ${cve} explained`}>
        <span className="mr-1 text-[12px] text-ink-4">Explain in</span>
        {links
          .filter((link) => link.kind === "chat")
          .map((link) => (
            <AgentLinkButton key={link.target} link={link} cve={cve} primary={false} />
          ))}
      </div>
    </div>
  );
}
