"use client";

/** Bar (docs/spec/09): a bar per named value, the teams combined (MO-3), in the accent colour. */
import { barValues, chartText, hasData, type NamedPath } from "@/analysis/modules/charts";
import { ModuleFrame, NoChart } from "./frame";
import { AXIS, ChartTable, Plot } from "./plot";
import type { ModuleProps } from "./types";

export function Bar({ module, teams, dataset }: ModuleProps) {
  const chart = barValues(dataset, teams, (module.options.bars ?? []) as NamedPath[]);
  const [bars] = chart.series;
  return (
    <ModuleFrame module={module}>
      {hasData(chart) ? (
        <>
          <Plot
            label={module.name}
            figure={{
              data: [
                {
                  type: "bar",
                  x: chart.labels,
                  y: bars.values,
                  marker: { color: "var(--primary)" },
                  hovertemplate: "%{x}: %{y:.2~f}<extra></extra>",
                },
              ],
              layout: { xaxis: AXIS, yaxis: { ...AXIS, rangemode: "tozero" }, showlegend: false },
            }}
          />
          <ChartTable
            caption={module.name}
            columns={["Bar", "Value"]}
            rows={chart.labels.map((label, i) => ({
              label,
              cells: [chartText(bars.values[i])],
            }))}
          />
        </>
      ) : (
        <NoChart />
      )}
    </ModuleFrame>
  );
}
