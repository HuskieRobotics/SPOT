"use client";

/**
 * RadarChart (docs/spec/09): a closed, filled line per entry of `lines`, a point per section,
 * clockwise from the top. The radial axis runs from 0 to 4, or further for a larger value.
 */
import { chartText, radarLines, type RadarOptions } from "@/analysis/modules/charts";
import { ModuleFrame, NoChart } from "./frame";
import { ChartTable, Plot } from "./plot";
import type { ModuleProps } from "./types";

const POLAR_AXIS = {
  linecolor: "var(--muted-foreground)",
  gridcolor: "var(--border)",
  tickfont: { size: 13 },
} as const;

export function RadarChart({ module, teams, dataset }: ModuleProps) {
  const options = module.options as unknown as RadarOptions;
  const chart = radarLines(dataset, teams, {
    sections: options.sections ?? [],
    lines: options.lines ?? [],
  });
  // The table leaves out the point that closes each line.
  const sections = chart.labels.slice(0, -1);
  return (
    <ModuleFrame module={module}>
      {chart.measured ? (
        <>
          <Plot
            label={module.name}
            className="h-96"
            figure={{
              data: chart.series.map((s) => ({
                type: "scatterpolar",
                name: s.name,
                r: s.values,
                theta: chart.labels,
                fill: "toself",
                connectgaps: true,
                hovertemplate: "%{theta}: %{r:.2~f}",
              })),
              layout: {
                polar: {
                  bgcolor: "var(--card)",
                  // Five numbers at most along the top spoke, so they stay readable.
                  radialaxis: { ...POLAR_AXIS, range: [0, chart.max], angle: 90, nticks: 5 },
                  angularaxis: { ...POLAR_AXIS, direction: "clockwise", rotation: 90 },
                },
                // Room beside the circle for the sections' names, which Plotly does not make.
                margin: { t: 32, r: 72, b: 16, l: 72, pad: 4 },
              },
            }}
          />
          <ChartTable
            caption={module.name}
            columns={["Section", ...chart.series.map((s) => s.name)]}
            rows={sections.map((label, i) => ({
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
