"use client";

/** Stats (docs/spec/09): a list of named values, each ranked when one team is shown (MO-4). */
import { shownValue, type ValueOptions } from "@/analysis/modules/values";
import { ModuleFrame, RankBadge, Value } from "./frame";
import type { ModuleProps } from "./types";

type Stat = ValueOptions & { name: string };

export function Stats({ module, teams, dataset }: ModuleProps) {
  const list = (module.options.list ?? []) as Stat[];
  return (
    <ModuleFrame module={module}>
      <ul className="flex flex-col gap-1">
        {list.map((stat, i) => {
          const shown = shownValue(dataset, teams, stat);
          return (
            <li key={i} data-stat={stat.name}>
              <strong>
                {shown.rank && (
                  <>
                    <RankBadge rank={shown.rank} />{" "}
                  </>
                )}
                {stat.name}:
              </strong>{" "}
              <Value shown={shown} />
            </li>
          );
        })}
      </ul>
    </ModuleFrame>
  );
}
