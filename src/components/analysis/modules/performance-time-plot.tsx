"use client";

/**
 * PerformanceTimePlot (docs/spec/09): a team's values match by match, a line per tracked value,
 * qualifications before playoffs (TR-6, DV-17). It shows one team: v5 threw for several.
 */
import { chartText, hasData, performanceLines } from "@/analysis/modules/charts";
import { ModuleFrame, NoChart } from "./frame";
import { AXIS, ChartTable, Plot } from "./plot";
import type { ModuleProps } from "./types";

export function PerformanceTimePlot({ module, teams, dataset }: ModuleProps) {
  if (teams.length !== 1)
    return (
      <ModuleFrame module={module}>
        <p className="text-muted-foreground text-center text-sm">Shown for one team at a time.</p>
      </ModuleFrame>
    );
  const chart = performanceLines(
    dataset,
    teams[0],
    (module.options.trackedStats ?? []) as string[],
  );
  return (
    <ModuleFrame module={module}>
      {hasData(chart) ? (
        <>
          <Plot
            label={module.name}
            figure={{
              data: chart.series.map((s) => ({
                type: "scatter",
                mode: "lines+markers",
                name: s.name,
                x: chart.short,
                y: s.values,
                customdata: chart.labels,
                hovertemplate: "%{customdata}: %{y:.2~f}",
              })),
              layout: { xaxis: { ...AXIS, type: "category" }, yaxis: AXIS },
            }}
          />
          <ChartTable
            caption={module.name}
            columns={["Match", ...chart.series.map((s) => s.name)]}
            rows={chart.labels.map((label, i) => ({
              label,
              cells: chart.series.map((s) => chartText(s.values[i])),
            }))}
          />
        </>
      ) : (
        <NoChart />
      )}
    </ModuleFrame>
  );
}
