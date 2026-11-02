import { cn } from "@/lib/utils";

/** Numbered steps. The number sits in a small inset ring so the step text carries the weight. */
export function Checklist({ items, className }: { items: string[]; className?: string }) {
  return (
    <ol className={cn("space-y-3.5", className)}>
      {items.map((line, index) => (
        <li key={line} className="flex gap-3.5 text-[14.5px] leading-snug text-ink-2">
          <span
            aria-hidden
            className="mt-[-1px] flex size-[22px] shrink-0 items-center justify-center rounded-full font-mono text-[10.5px] tabular text-ink-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)]"
          >
            {index + 1}
          </span>
          <span className="text-pretty">{line}</span>
        </li>
      ))}
    </ol>
  );
}
