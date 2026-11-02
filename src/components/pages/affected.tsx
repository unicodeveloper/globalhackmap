import { ShieldCheck, Target } from "@phosphor-icons/react/ssr";

import { Eyebrow } from "@/components/pages/tile";
import { explainCve } from "@/lib/patch";
import type { Vuln } from "@/lib/types";

function Line({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3.5 border-b border-white/[0.06] px-4 py-4 sm:px-5">
      <span className="mt-px flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-white/[0.04] text-ink-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <Eyebrow as="p">{label}</Eyebrow>
        <div className="mt-1.5 text-[15px] leading-snug text-ink text-pretty">{children}</div>
      </div>
    </div>
  );
}

/** "You are affected if" and "The fix", researched from the vendor advisory. Renders nothing if unavailable. */
export async function Affected({ vuln }: { vuln: Vuln }) {
  if (!vuln.vendor || !vuln.product) return null;
  // Streams inside its own Suspense boundary, so a cold answer never blocks the page around it.
  const explainer = await explainCve(vuln.cve).catch(() => null);
  if (!explainer) return null;
  return (
    <>
      <Line icon={<Target className="size-3.5" />} label="You are affected if">
        {explainer.who}
      </Line>
      <Line icon={<ShieldCheck className="size-3.5" />} label="The fix">
        {explainer.fix}
      </Line>
    </>
  );
}

/** Holds the space while the advisory is read, so the fix buttons below do not jump far. */
export function AffectedPending() {
  return (
    <div aria-busy className="border-b border-white/[0.06] px-4 py-4 sm:px-5">
      <Eyebrow as="p">Reading the vendor advisory</Eyebrow>
      <div className="mt-2.5 space-y-2" aria-hidden>
        <span className="block h-2.5 w-[88%] rounded-full bg-white/[0.06] motion-safe:animate-pulse" />
        <span className="block h-2.5 w-[64%] rounded-full bg-white/[0.06] motion-safe:animate-pulse" />
      </div>
    </div>
  );
}
