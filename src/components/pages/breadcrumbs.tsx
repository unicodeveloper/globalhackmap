import { CaretRight } from "@phosphor-icons/react/ssr";
import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="pt-2">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[12.5px] text-ink-4">
        {items.map((item, index) => (
          <li key={item.label} className="flex min-w-0 items-center gap-1">
            {index ? <CaretRight className="size-3 shrink-0 text-ink-4/70" aria-hidden /> : null}
            {item.href ? (
              <Link href={item.href} className="rounded-full px-1.5 py-0.5 transition-colors hover:bg-white/[0.05] hover:text-ink-2">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="max-w-[40ch] truncate px-1.5 text-ink-3">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
