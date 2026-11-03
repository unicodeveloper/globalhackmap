import { ArrowUpRight, FileText } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock, CopyPill } from "@/components/agents/code-block";
import { ConnectTabs } from "@/components/agents/connect-tabs";
import { OpenInAgent } from "@/components/agents/open-in-agent";
import { PageNav } from "@/components/agents/page-nav";
import { SiteBar } from "@/components/hud/latest-cves";
import { StatusMark } from "@/components/kit/status-mark";
import { repoFixPrompt } from "@/lib/deeplinks";
import { STATUS_LABEL } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { getSnapshot } from "@/lib/snapshot";
import { cn } from "@/lib/utils";
import { tidyVendor } from "@/lib/vendors";

export const metadata: Metadata = {
  title: "For agents",
  description: "Connect Global Hack Map over MCP, read the live picture and give your coding agent a sourced CVE fix runbook.",
  alternates: { canonical: "/agents" },
};

const TOOLS: { name: string; args: string; description: string }[] = [
  {
    name: "get_situation",
    args: "()",
    description: "The cached picture: important incidents, trending and exploited CVEs, malicious packages and active outages.",
  },
  { name: "patch_now", args: "()", description: "What attackers are exploiting today, per product: what they can do, who is affected and the fix." },
  {
    name: "search_incidents",
    args: "(query?, country?, status?, since_days?, limit?)",
    description: "Find incidents by name, actor or domain, with country, status and date filters.",
  },
  { name: "get_incident", args: "(id)", description: "A full incident record, its sources, status and practical guidance." },
  { name: "get_cve", args: "(cve)", description: "Merged CVE facts, a runbook URL and the exact prompt for a repository fix." },
  { name: "check_stack", args: "(input)", description: "Check a manifest, lockfile or product list against public vulnerability data." },
];

const RUNBOOK_STEPS = [
  "Checks whether the repository is affected",
  "Lists the available version evidence",
  "Guides a minimal fix",
  "Asks for tests before a pull request",
];

const SECTIONS = [
  { id: "connect", label: "Connect over MCP" },
  { id: "tools", label: "Available tools" },
  { id: "runbooks", label: "Fix a CVE" },
  { id: "json", label: "JSON API" },
  { id: "valyu", label: "Go deeper" },
];

const TILE = "rounded-[18px] bg-white/[0.028] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06),inset_0_1px_0_rgb(255_255_255/0.05)]";
const TEXT_LINK =
  "press inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-ink-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.09)] hover:bg-white/[0.04] hover:text-ink";

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-4", className)}>{children}</p>;
}

function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-[640px]">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-2.5 font-semicondensed text-[26px] font-semibold leading-[1.1] tracking-[-0.015em] text-ink sm:text-[30px]">{title}</h2>
      {children ? <p className="mt-3 text-[14.5px] leading-relaxed text-ink-3">{children}</p> : null}
    </div>
  );
}

export default async function AgentsPage() {
  const snapshot = await getSnapshot();
  const example = snapshot.trending[0];
  const mcpUrl = `${SITE_URL}/api/mcp`;
  const exampleLabel = example
    ? [tidyVendor(example.vendor), tidyVendor(example.product)].filter((part, index, all) => part && all.indexOf(part) === index).join(" ")
    : "";

  return (
    <div className="min-h-screen bg-space text-ink">
      <SiteBar />
      <main id="main-content" className="mx-auto max-w-[1160px] px-5 pb-24 sm:px-8">
        <section className="grid items-center gap-10 pb-16 pt-8 sm:pt-14 lg:grid-cols-2 lg:gap-12 lg:pb-24">
          <div className="min-w-0">
            <Eyebrow>For agents</Eyebrow>
            <h1 className="mt-4 max-w-[560px] text-balance font-semicondensed text-[44px] font-bold leading-[0.96] tracking-[-0.03em] sm:text-[60px]">
              Put Global Hack Map inside your agent
            </h1>
            <p className="mt-5 max-w-[500px] text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">
              Read the situation, check your stack and turn a CVE into a pull request. Connect over MCP, or give your coding agent a fix runbook.
            </p>
            <div className="mt-8 flex max-w-[540px] flex-col gap-2.5 sm:flex-row">
              <CopyPill value={mcpUrl} label="MCP server URL" className="sm:flex-1" />
              <a
                href="/llms.txt"
                className="press inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-[13.5px] text-ink-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.09)] hover:bg-white/[0.04] hover:text-ink"
              >
                <FileText className="size-4" /> Read llms.txt
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-ink-3">
              {["No Global Hack Map API key", "Six read-only tools", "No paid research calls"].map((fact) => (
                <li key={fact} className="flex items-center gap-2">
                  <span className="size-1 rounded-full bg-ink-4" aria-hidden />
                  {fact}
                </li>
              ))}
            </ul>
          </div>

          <div id="connect" className="min-w-0 scroll-mt-8">
            <h2 className="sr-only">Connect over MCP</h2>
            <ConnectTabs mcpUrl={mcpUrl} />
            <p className="mt-3 px-2 text-[12.5px] leading-relaxed text-ink-4">
              Using another client? Add a remote Streamable HTTP MCP server with the Global Hack Map URL. No API key is needed.
            </p>
          </div>
        </section>

        <div className="grid items-start gap-8 border-t border-white/[0.06] pt-10 lg:grid-cols-[176px_minmax(0,1fr)] lg:gap-14 lg:pt-16">
          <PageNav items={SECTIONS} />

          <div className="min-w-0 space-y-20">
            <section id="tools" className="scroll-mt-8">
              <SectionHead eyebrow="Tools" title="Six tools, one sourced picture">
                Results preserve confirmed, reported and claimed statuses. Cite the source links and the status together. A claim is an attacker’s assertion.
              </SectionHead>
              <div className={cn(TILE, "mt-7 overflow-hidden")}>
                <div className="hidden grid-cols-[minmax(0,250px)_minmax(0,1fr)] gap-8 border-b border-white/[0.06] px-5 py-3 md:grid">
                  <Eyebrow>Tool</Eyebrow>
                  <Eyebrow>What you get</Eyebrow>
                </div>
                <dl className="divide-y divide-white/[0.06]">
                  {TOOLS.map((tool) => (
                    <div key={tool.name} className="grid gap-1.5 px-5 py-4 md:grid-cols-[minmax(0,250px)_minmax(0,1fr)] md:gap-8">
                      <dt className="min-w-0">
                        <span className="block font-mono text-[13px] text-ink">{tool.name}</span>
                        <span className="mt-0.5 block break-words font-mono text-[11px] leading-relaxed text-ink-4">{tool.args}</span>
                      </dt>
                      <dd className="text-[14px] leading-relaxed text-ink-2">{tool.description}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.06] px-5 py-3 text-[12px] text-ink-3">
                  <span className="text-ink-4">Every result keeps its status</span>
                  {(["confirmed", "reported", "claimed"] as const).map((status) => (
                    <span key={status} className="flex items-center gap-1.5">
                      <StatusMark status={status} size={8} />
                      {STATUS_LABEL[status]}
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-4 max-w-[640px] text-[12.5px] leading-relaxed text-ink-4">
                For stack checks, remove credentials, private registry URLs and other sensitive information before sharing input. No result is a guarantee that
                your stack is safe.
              </p>
              <div className={cn(TILE, "mt-4 space-y-2 px-5 py-4 text-[13px] leading-relaxed text-ink-3")}>
                <h3 className="font-medium text-ink-2">Limits and troubleshooting</h3>
                <p>
                  Use Streamable HTTP at the exact server URL above. Stack checks accept up to 500 KB and check at most 1,000 packages; read the coverage notes
                  in each result.
                </p>
                <p>
                  Requests are limited per IP. On HTTP 429, wait for the Retry-After interval before retrying. HTTP 503 means a service or request protection is
                  temporarily unavailable.
                </p>
                <p>
                  Confirmed, reported, claimed, precautionary and disputed are distinct statuses. An empty result means no matching record in the available
                  data, not proof of safety.
                </p>
              </div>
            </section>

            <section id="runbooks" className="scroll-mt-8">
              <SectionHead eyebrow="Runbooks" title="Fix a CVE from your coding agent">
                Point your coding agent at <code className="font-mono text-[13px] text-ink-2">/fix/&lt;CVE-ID&gt;</code>. Each runbook:
              </SectionHead>

              <ol className={cn(TILE, "mt-7 grid grid-cols-2 overflow-hidden md:grid-cols-4")}>
                {RUNBOOK_STEPS.map((step, index) => (
                  <li
                    key={step}
                    className={cn(
                      "px-4 py-4 sm:px-5",
                      index % 2 === 1 && "border-l border-white/[0.06]",
                      index >= 2 && "border-t border-white/[0.06] md:border-t-0",
                      index === 2 && "md:border-l",
                    )}
                  >
                    <span className="font-mono text-[10.5px] tabular text-ink-4">0{index + 1}</span>
                    <span className="mt-1.5 block text-[13.5px] leading-snug text-ink-2">{step}</span>
                  </li>
                ))}
              </ol>

              {example ? (
                <div className="glass-panel mt-4 rounded-[22px] p-1.5">
                  <div className="flex flex-wrap items-start justify-between gap-3 px-3.5 pb-3 pt-3">
                    <div className="min-w-0">
                      <Eyebrow>Trending now</Eyebrow>
                      <p className="mt-1.5 flex min-w-0 items-baseline gap-2.5">
                        <span className="shrink-0 font-mono text-[14px] text-ink">{example.cve}</span>
                        {exampleLabel ? <span className="min-w-0 truncate text-[13px] text-ink-3">{exampleLabel}</span> : null}
                      </p>
                    </div>
                    <Link href={`/fix/${example.cve}`} className={TEXT_LINK}>
                      Read the runbook <ArrowUpRight className="size-3.5" />
                    </Link>
                  </div>
                  <div className="px-2 pb-3">
                    <OpenInAgent cve={example.cve} />
                  </div>
                  <CodeBlock label="Prompt for your coding agent" code={repoFixPrompt(example.cve)} />
                  <p className="px-3.5 pb-2 pt-3 text-[12.5px] leading-relaxed text-ink-4">
                    The agent opens with this prompt and nothing runs until you send it. It must verify the vendor advisory, preserve your work and stop if the
                    evidence is insufficient. Runbooks never authorise exploit code, paid actions, deployment or merging.
                  </p>
                </div>
              ) : (
                <p className={cn(TILE, "mt-4 px-5 py-6 text-[14px] text-ink-3")}>
                  No trending CVE is available in the current snapshot. Use a known CVE ID with{" "}
                  <span className="font-mono text-[13px] text-ink-2">{SITE_URL}/fix/&lt;CVE-ID&gt;</span>.
                </p>
              )}
            </section>

            <div className="grid gap-14 md:grid-cols-2 md:gap-8">
              <section id="json" className="min-w-0 scroll-mt-8">
                <SectionHead eyebrow="JSON API" title="Read the snapshot">
                  The same cached picture, as JSON. Check its generation time and feed availability alongside the records.
                </SectionHead>
                <CodeBlock className="mt-6" label="Fetch the snapshot" lang="shell" code={`curl -fsSL '${SITE_URL}/api/snapshot'`} />
                <a href="/api/snapshot" className={cn(TEXT_LINK, "mt-4")}>
                  Open snapshot JSON <ArrowUpRight className="size-3.5" />
                </a>
              </section>

              <section id="valyu" className="min-w-0 scroll-mt-8">
                <SectionHead eyebrow="Go deeper" title="Research with Valyu">
                  Global Hack Map is built on Valyu’s search and DeepResearch APIs. For cited research beyond the snapshot, agents can use Valyu’s own MCP
                  server or the <code className="font-mono text-[13px] text-ink-2">valyu</code> CLI. Ask before research that costs money.
                </SectionHead>
                <CodeBlock className="mt-6" label="Valyu MCP server URL" code="https://mcp.valyu.ai/mcp" />
                <a href="https://docs.valyu.ai" target="_blank" rel="noreferrer" className={cn(TEXT_LINK, "mt-4")}>
                  Valyu documentation <ArrowUpRight className="size-3.5" />
                </a>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
