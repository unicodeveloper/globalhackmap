import { PageShell } from "@/components/pages/page-shell";

const BAR = "block rounded-full bg-white/[0.06] motion-safe:animate-pulse";
const PANEL = "block rounded-[18px] bg-white/[0.028] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]";

/** The instant shell for a page whose data is still streaming in: the real chrome, with placeholders in the layout's shape. */
export function PageFallback({ label }: { label: string }) {
  return (
    <PageShell>
      <div aria-busy aria-label={label} className="mt-6 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <span className={`${BAR} h-3 w-32`} />
          <span className={`${BAR} h-10 w-3/4`} />
          <span className={`${BAR} h-4 w-2/3`} />
          <span className={`${PANEL} mt-6 h-48`} />
          <span className={`${PANEL} h-32`} />
        </div>
        <div className="hidden space-y-3 lg:block">
          <span className={`${PANEL} h-40`} />
          <span className={`${PANEL} h-44`} />
        </div>
      </div>
    </PageShell>
  );
}
