"use client";

/**
 * HeatmapScatterPlot (docs/spec/09, #386): where on the field the teams' actions happened, on the
 * field picture (`imgPath`). A marker per tapped position, a trace per action, and a heat layer
 * of every position in the group. With several `actionGroups`, buttons choose the group shown,
 * the first at first; v5 drew every group's markers and the first group's heat.
 */
import { useEffect, useState } from "react";
import { heatmapGroups, heatPoints, type HeatmapOptions } from "@/analysis/modules/heatmap";
import { cn } from "@/lib/utils";
import { ModuleFrame, NoChart } from "./frame";
import { ChartTable, Plot } from "./plot";
import type { ModuleProps } from "./types";

/** v5's heat colours: clear where nothing happened, through light orange to orange. */
const HEAT_SCALE: [number, string][] = [
  [0, "rgba(255, 255, 255, 0)"],
  [0.1, "rgb(255, 147, 115)"],
  [1, "rgb(255, 59, 0)"],
];

/** Positions are percentages of the picture, so the axes run 0 to 100, y downwards. */
const HIDDEN_AXIS = {
  range: [0, 100] as [number, number],
  visible: false,
  showgrid: false,
  zeroline: false,
  fixedrange: true,
};

type Size = { width: number; height: number } | "failed";

/** The picture's own width and height, once it has loaded; null until then. */
function useImageSize(src: string): Size | null {
  const [loaded, setLoaded] = useState<{ src: string; size: Size } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    const done = (size: Size) => {
      if (!cancelled) setLoaded({ src, size });
    };
    image.onload = () =>
      done(
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : "failed",
      );
    image.onerror = () => done("failed");
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);
  return loaded?.src === src ? loaded.size : null;
}

export function HeatmapScatterPlot({ module, teams, dataset, matchScouting }: ModuleProps) {
  const options = module.options as unknown as HeatmapOptions;
  const groups = heatmapGroups(dataset, teams, options, matchScouting);
  const [chosen, setChosen] = useState(0);
  const group = groups[Math.min(chosen, groups.length - 1)];
  const src = `/${options.imgPath.replace(/^\/+/, "")}`;
  const size = useImageSize(src);

  if (!groups.some((g) => g.traces.length > 0))
    return (
      <ModuleFrame module={module}>
        <NoChart />
      </ModuleFrame>
    );

  // Without the picture, the positions still show, on a square.
  const ratio = size && size !== "failed" ? size.height / size.width : 1;
  const heat = heatPoints(group);
  return (
    <ModuleFrame module={module}>
      {groups.length > 1 && (
        <div
          role="group"
          aria-label="Actions shown"
          className="flex flex-wrap justify-center gap-2"
        >
          {groups.map((g, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={g === group}
              onClick={() => setChosen(i)}
              className={cn(
                "rounded-md border px-3 py-1 text-sm",
                g === group ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}
      {size === "failed" && (
        <p className="text-muted-foreground text-center text-sm">
          The field picture, {options.imgPath}, could not load.
        </p>
      )}
      {group.traces.length === 0 ? (
        <NoChart />
      ) : (
        size && (
          // The chart's height follows the picture's shape, plus room for the legend.
          <div className="@container">
            <Plot
              label={`${module.name}: ${group.name}`}
              className="h-auto"
              style={{ height: `calc(100cqw * ${ratio} + 4rem)` }}
              figure={{
                data: [
                  ...group.traces.map((t) => ({
                    type: "scatter" as const,
                    mode: "markers" as const,
                    name: t.label,
                    showlegend: true,
                    x: t.points.map((p) => p.x),
                    y: t.points.map((p) => p.y),
                    marker: { size: 13, line: { color: "white", width: 1 } },
                    opacity: 0.6,
                    hoverinfo: "skip" as const,
                  })),
                  {
                    type: "histogram2dcontour" as const,
                    name: "Heatmap",
                    // In the legend, as in v5, so a viewer can hide it to see the markers.
                    showlegend: true,
                    x: heat.map((p) => p.x),
                    y: heat.map((p) => p.y),
                    // Fixed bins, 8 % of the field, so the heat never rescales to the data.
                    xbins: { start: 0, end: 100, size: 8 },
                    ybins: { start: 0, end: 100, size: 8 },
                    zmin: 0,
                    colorscale: HEAT_SCALE,
                    showscale: false,
                    opacity: 0.7,
                    hoverinfo: "skip" as const,
                  },
                ],
                layout: {
                  xaxis: HIDDEN_AXIS,
                  yaxis: {
                    ...HIDDEN_AXIS,
                    range: [100, 0],
                    scaleanchor: "x",
                    scaleratio: ratio,
                  },
                  images:
                    size === "failed"
                      ? []
                      : [
                          {
                            source: src,
                            xref: "x",
                            yref: "y",
                            x: 0,
                            y: 0,
                            sizex: 100,
                            sizey: 100,
                            sizing: "stretch",
                            layer: "below",
                          },
                        ],
                  margin: { t: 8, r: 8, b: 8, l: 8, pad: 0 },
                  legend: { orientation: "h", x: 0.5, xanchor: "center", y: 0, yanchor: "top" },
                },
              }}
            />
          </div>
        )
      )}
      <ChartTable
        caption={`${module.name}: ${group.name}`}
        columns={["Action", "Positions"]}
        rows={group.traces.map((t) => ({ label: t.label, cells: [String(t.points.length)] }))}
      />
    </ModuleFrame>
  );
}
