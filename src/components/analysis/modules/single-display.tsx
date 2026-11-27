"use client";

/**
 * SingleDisplay (docs/spec/09): one value for the teams shown, summed or averaged. Its
 * `percentChanceOfWinning`, which compares two alliances, comes with Simulate Match (#389).
 */
import { shownValue, type ValueOptions } from "@/analysis/modules/values";
import { ModuleFrame, Value } from "./frame";
import type { ModuleProps } from "./types";

export function SingleDisplay({ module, teams, dataset }: ModuleProps) {
  const options = module.options as unknown as ValueOptions;
  if (options.aggrMethod === "percentChanceOfWinning" || !options.path) {
    return (
      <ModuleFrame module={module}>
        <p className="text-muted-foreground text-center text-sm">
          The chance of winning is shown when two alliances are compared, in Simulate Match.
        </p>
      </ModuleFrame>
    );
  }
  // Never ranked: a SingleDisplay shows the teams together (v5 did not rank it either).
  const shown = shownValue(dataset, teams, { ...options, sort: 0 });
  return (
    <ModuleFrame module={module}>
      <p className="text-center text-3xl font-semibold">
        <Value shown={shown} />
      </p>
    </ModuleFrame>
  );
}
