"use client";

/**
 * SingleDisplay (docs/spec/09): one value for the teams shown, summed or averaged. Its
 * `percentChanceOfWinning`, with `wholeMatch`, is the alliance's chance of beating the other one in
 * Simulate Match (#389, AN-23, `src/analysis/win-chance.ts`); elsewhere it says where to see it.
 */
import { displayValue, NO_DATA } from "@/analysis/modules/display";
import { shownValue, type ValueOptions } from "@/analysis/modules/values";
import { chanceOfWinning } from "@/analysis/win-chance";
import { ModuleFrame, Value } from "./frame";
import type { ModuleProps } from "./types";

export function SingleDisplay({ module, teams, opponents, dataset }: ModuleProps) {
  const options = module.options as unknown as ValueOptions;
  if (options.aggrMethod === "percentChanceOfWinning") {
    if (!opponents)
      return (
        <ModuleFrame module={module}>
          <p className="text-muted-foreground text-center text-sm">
            The chance of winning is shown when two alliances are compared, in Simulate Match.
          </p>
        </ModuleFrame>
      );
    const chance = chanceOfWinning(dataset, teams, opponents);
    // As v5: a percentage, two decimals unless `decimals` says otherwise.
    const shown = displayValue(chance === null ? null : chance * 100, {
      decimals: options.decimals ?? 2,
      unit: "%",
    });
    return (
      <ModuleFrame module={module}>
        <p className="text-center text-3xl font-semibold" data-testid="chance">
          <Value shown={shown} />
        </p>
      </ModuleFrame>
    );
  }
  // Never ranked: a SingleDisplay shows the teams together (v5 did not rank it either). Without a
  // path there is nothing to show.
  const shown = options.path
    ? shownValue(dataset, teams, { ...options, sort: 0 })
    : { text: NO_DATA, value: null };
  return (
    <ModuleFrame module={module}>
      <p className="text-center text-3xl font-semibold">
        <Value shown={shown} />
      </p>
    </ModuleFrame>
  );
}
