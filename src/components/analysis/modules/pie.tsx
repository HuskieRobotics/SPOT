"use client";

/**
 * Pie (docs/spec/09): a ring with a slice per named value, the teams combined (MO-3). Each slice
 * shows its value with `decimals` and `unit`.
 */
import { pieSlices, type PieOptions } from "@/analysis/modules/charts";
import { ModuleFrame, NoChart } from "./frame";
import { ChartTable, Plot } from "./plot";
import type { ModuleProps } from "./types";

export function Pie({ module, teams, dataset }: ModuleProps) {
  const options = module.options as unknown as PieOptions;
  const pie = pieSlices(dataset, teams, { ...options, slices: options.slices ?? [] });
  return (
    <ModuleFrame module={module}>
      {pie ? (
        <>
          <Plot
            label={module.name}
            figure={{
              data: [
                {
                  type: "pie",
                  hole: 0.4,
                  labels: pie.labels,
                  values: pie.sizes,
                  text: pie.texts,
                  textinfo: "text",
                  textposition: "inside",
                  hovertemplate: "%{label}: %{text} (%{percent})<extra></extra>",
                  sort: false,
                  marker: { line: { color: "var(--card)", width: 2 } },
                },
              ],
            }}
          />
          <ChartTable
            caption={module.name}
            columns={["Slice", "Value"]}
            rows={pie.labels.map((label, i) => ({ label, cells: [pie.texts[i]] }))}
          />
        </>
      ) : (
        <NoChart />
      )}
    </ModuleFrame>
  );
}
