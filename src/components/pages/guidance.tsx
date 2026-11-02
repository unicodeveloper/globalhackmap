"use client";

import { useId, useState } from "react";

import { Segmented } from "@/components/kit/segmented";
import { Checklist } from "@/components/pages/checklist";
import { EYEBROW, TILE } from "@/components/pages/styles";
import { cn } from "@/lib/utils";

type Audience = "people" | "teams";

/**
 * What to do, for a customer or for a company that buys from them. Both lists are in the HTML
 * so search engines and agents read both; the switch only chooses which one shows.
 */
export function Guidance({ people, teams, children }: { people: string[]; teams: string[]; children?: React.ReactNode }) {
  const [audience, setAudience] = useState<Audience>("people");
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} className={cn(TILE, "overflow-hidden")}>
      <div className="flex flex-col gap-3 px-4 pt-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <h2 id={`${id}-title`} className={EYEBROW}>
          What to do
        </h2>
        <Segmented<Audience>
          kind="tab"
          label="Who is asking"
          value={audience}
          onChange={setAudience}
          className="sm:w-[300px]"
          options={[
            { value: "people", label: "I'm a customer" },
            { value: "teams", label: "They're my supplier" },
          ]}
        />
      </div>
      <div role="tabpanel" aria-label="If you're a customer" hidden={audience !== "people"} className="px-4 pb-5 pt-4 sm:px-5">
        <Checklist items={people} />
      </div>
      <div role="tabpanel" aria-label="If they're your supplier" hidden={audience !== "teams"} className="px-4 pb-5 pt-4 sm:px-5">
        <Checklist items={teams} />
      </div>
      {children ? <div className="border-t border-white/[0.06] px-4 py-4 sm:px-5">{children}</div> : null}
    </section>
  );
}
