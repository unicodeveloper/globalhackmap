"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/** "On this page": a sticky rail on wide screens, a scrolling row on small ones. Marks the section in view. */
export function PageNav({ items }: { items: { id: string; label: string }[] }) {
  const [current, setCurrent] = useState(items[0]?.id);

  useEffect(() => {
    const sections = items.map((item) => document.getElementById(item.id)).filter((node): node is HTMLElement => Boolean(node));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="On this page" className="min-w-0 lg:sticky lg:top-8">
      <p className="mb-3 hidden font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-4 lg:block">On this page</p>
      <ul className="-mx-1 flex gap-0.5 overflow-x-auto px-1 scrollbar-none max-lg:pr-10 max-lg:[mask-image:linear-gradient(to_right,#000_85%,transparent)] lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:border-l lg:border-white/[0.07] lg:px-0">
        {items.map((item) => {
          const on = item.id === current;
          return (
            <li key={item.id} className="shrink-0">
              <a
                href={`#${item.id}`}
                aria-current={on ? "location" : undefined}
                onClick={() => setCurrent(item.id)}
                className={cn(
                  "press flex h-8 items-center whitespace-nowrap rounded-full px-3 text-[13px] transition-colors duration-200",
                  "lg:-ml-px lg:h-auto lg:rounded-none lg:border-l lg:py-1.5 lg:pl-4 lg:active:scale-100",
                  on ? "bg-white/[0.06] text-ink lg:border-ink lg:bg-transparent" : "text-ink-3 hover:text-ink-2 lg:border-transparent",
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
