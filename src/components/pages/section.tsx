import { EYEBROW } from "@/components/pages/styles";
import { cn } from "@/lib/utils";

/** A page section headed by an eyebrow, with an optional count or note on the right. */
export function PageSection({
  title,
  aside,
  children,
  className,
  id,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={cn("scroll-mt-6 pt-12", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-x-4 gap-y-1 border-b border-white/[0.06] pb-2.5">
        <h2 id={id ? `${id}-title` : undefined} className={cn(EYEBROW, "text-ink-3")}>
          {title}
        </h2>
        {aside ? <span className={EYEBROW}>{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}
