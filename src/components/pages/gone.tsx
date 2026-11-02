import { ArrowRight, Newspaper } from "@phosphor-icons/react/ssr";
import Link from "next/link";

import { PageShell } from "@/components/pages/page-shell";
import { PRIMARY, SECONDARY } from "@/components/pages/styles";
import { Eyebrow } from "@/components/pages/tile";

/** A 404 that explains itself and gives the reader somewhere to go. */
export function Gone({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <PageShell>
      <div className="mx-auto max-w-[600px] py-24 sm:py-32">
        <Eyebrow as="p">Not found</Eyebrow>
        <h1 className="mt-3 font-semicondensed text-[clamp(34px,5vw,48px)] font-bold leading-[1.02] tracking-[-0.02em] text-ink text-balance">{title}</h1>
        <div className="mt-4 max-w-[56ch] space-y-3 text-[15px] leading-relaxed text-ink-3 text-pretty">{children}</div>
        <div className="mt-8 grid gap-2 sm:flex">
          <Link href="/" className={PRIMARY}>
            Open the live map <ArrowRight className="size-3.5" />
          </Link>
          <Link href="/brief" className={SECONDARY}>
            <Newspaper className="size-3.5" /> What broke today
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
