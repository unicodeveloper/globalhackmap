"use client";

import { Code } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useId, useRef, useState } from "react";

import { CodeBlock, type CodeLang } from "@/components/agents/code-block";
import { ClaudeCodeIcon, ClaudeIcon, CodexIcon, CursorIcon, OpenAIIcon } from "@/components/icons/agents";
import { cn } from "@/lib/utils";

interface Client {
  id: string;
  tab: string;
  name: string;
  Icon: (props: { className?: string }) => React.ReactNode;
  steps: string;
  snippet: { label: string; code: string; lang: CodeLang };
}

function clients(mcpUrl: string): Client[] {
  const url = { label: "MCP server URL", code: mcpUrl, lang: "text" as const };
  return [
    {
      id: "claude-code",
      tab: "Claude Code",
      name: "Claude Code",
      Icon: ClaudeCodeIcon,
      steps: "Run this command in your terminal.",
      snippet: { label: "Terminal", code: `claude mcp add --transport http globalhackmap ${mcpUrl}`, lang: "shell" },
    },
    {
      id: "claude",
      tab: "Claude",
      name: "Claude.ai and Claude Desktop",
      Icon: ClaudeIcon,
      steps:
        "Add a remote MCP server in your client’s settings and paste this URL. Look for Connectors or Add custom connector; the labels depend on your client version.",
      snippet: url,
    },
    {
      id: "chatgpt",
      tab: "ChatGPT",
      name: "ChatGPT",
      Icon: OpenAIIcon,
      steps:
        "In Settings, look for Apps or Connectors. If developer mode and custom MCP connectors are available for your account, add a remote MCP server and paste this URL.",
      snippet: url,
    },
    {
      id: "cursor",
      tab: "Cursor",
      name: "Cursor",
      Icon: CursorIcon,
      steps: "Add this server to your project’s MCP configuration, preserving any existing entries.",
      snippet: { label: ".cursor/mcp.json", code: JSON.stringify({ mcpServers: { globalhackmap: { url: mcpUrl } } }, null, 2), lang: "json" },
    },
    {
      id: "vscode",
      tab: "VS Code",
      name: "VS Code",
      Icon: Code,
      steps: "Add an HTTP server to your project’s MCP configuration.",
      snippet: { label: ".vscode/mcp.json", code: JSON.stringify({ servers: { globalhackmap: { type: "http", url: mcpUrl } } }, null, 2), lang: "json" },
    },
    {
      id: "codex",
      tab: "Codex",
      name: "Codex",
      Icon: CodexIcon,
      steps: "Add this entry to your Codex configuration.",
      snippet: { label: "~/.codex/config.toml", code: `[mcp_servers.globalhackmap]\nurl = ${JSON.stringify(mcpUrl)}`, lang: "toml" },
    },
  ];
}

/**
 * Per-client install instructions as a tab list. Every panel is rendered (inactive ones hidden),
 * so all instructions are in the HTML for readers without JavaScript.
 */
export function ConnectTabs({ mcpUrl }: { mcpUrl: string }) {
  const list = clients(mcpUrl);
  const [active, setActive] = useState(list[0].id);
  const [touched, setTouched] = useState(false);
  const reduced = useReducedMotion();
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number, focus = false) {
    const next = list[(index + list.length) % list.length];
    const tab = tabs.current[list.indexOf(next)];
    setActive(next.id);
    setTouched(true);
    if (focus) tab?.focus();
    tab?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const keys: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: list.length - 1,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    select(keys[event.key], true);
  }

  return (
    <div className="glass-panel overflow-hidden rounded-[22px] p-1.5 md:grid md:grid-cols-[176px_minmax(0,1fr)]">
      <div
        role="tablist"
        aria-label="Agent or assistant"
        className="flex gap-0.5 overflow-x-auto p-1 scrollbar-none max-md:pr-8 max-md:[mask-image:linear-gradient(to_right,#000_82%,transparent)] md:flex-col md:overflow-visible"
      >
        {list.map((client, index) => {
          const on = client.id === active;
          return (
            <button
              key={client.id}
              ref={(node) => {
                tabs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${client.id}`}
              aria-selected={on}
              aria-controls={`${id}-panel-${client.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => select(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "relative z-0 flex h-9 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[12px] px-3 text-[13px] transition-colors duration-200",
                on ? "text-ink" : "text-ink-3 hover:text-ink-2",
              )}
            >
              {on ? (
                <motion.span
                  layoutId={`${id}-active`}
                  className="absolute inset-0 -z-10 rounded-[12px] bg-white/[0.06] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]"
                  transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42 }}
                />
              ) : null}
              <client.Icon className={cn("size-4 shrink-0 transition-opacity", on ? "opacity-100" : "opacity-70")} />
              {client.tab}
            </button>
          );
        })}
      </div>

      {list.map((client) => {
        const on = client.id === active;
        return (
          <div
            key={client.id}
            role="tabpanel"
            id={`${id}-panel-${client.id}`}
            aria-labelledby={`${id}-tab-${client.id}`}
            hidden={!on}
            className="min-w-0 p-2 pt-3 md:p-2"
          >
            {on ? (
              <motion.div
                key={client.id}
                initial={touched && !reduced ? { opacity: 0, y: 4 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
              >
                <Pane client={client} />
              </motion.div>
            ) : (
              <Pane client={client} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Pane({ client }: { client: Client }) {
  return (
    <>
      <div className="px-2 pb-3">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{client.name}</h3>
        <p className="mt-1 max-w-[56ch] text-[13.5px] leading-relaxed text-ink-3">{client.steps}</p>
      </div>
      <CodeBlock label={client.snippet.label} code={client.snippet.code} lang={client.snippet.lang} />
    </>
  );
}
