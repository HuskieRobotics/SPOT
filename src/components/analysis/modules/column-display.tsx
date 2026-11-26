"use client";

/** ColumnDisplay (docs/spec/09): one column per team, its value, number and rank (MO-4). */
import { columns, type ValueOptions } from "@/analysis/modules/values";
import { ModuleFrame, RankBadge, Value } from "./frame";
import type { ModuleProps } from "./types";

export function ColumnDisplay({ module, teams, dataset }: ModuleProps) {
  const shown = columns(dataset, teams, module.options as unknown as ValueOptions);
  return (
    <ModuleFrame module={module}>
      <div className="flex flex-wrap justify-around gap-3">
        {shown.map((c) => (
          <div key={c.team} data-team={c.team} className="flex flex-col items-center gap-0.5">
            <span className="text-2xl font-semibold">
              <Value shown={c} />
            </span>
            <span className="text-muted-foreground text-sm">{c.team}</span>
            {c.rank && <RankBadge rank={c.rank} />}
          </div>
        ))}
      </div>
    </ModuleFrame>
  );
}
