"use client";

/**
 * Compare Team Scores (#387; docs/spec/08 AN-16 to AN-18): every team as a bubble, placed by the
 * two values chosen and sized by a third, drawn again on each change.
 *
 * Changed from v5: a bubble's area follows its value, scaled so the largest is 40 px across.
 * v5's `√value × 15` px made an OPR of 200 a bubble over 200 px wide. A value of 0 or less is the
 * smallest bubble.
 */
import { useState } from "react";
import { bubbles, compareChoices, CONSTANT, type Axes } from "@/analysis/compare";
import { chartText } from "@/analysis/modules/charts";
import type { LoadedEvent } from "./data";
import { AXIS, ChartTable, Plot } from "./modules/plot";

const LARGEST_PX = 40;
const SMALLEST_PX = 6;
const CONSTANT_PX = 14;

export function CompareView({ loaded }: { loaded: LoadedEvent }) {
  const { dataset, teams } = loaded.analysis;
  const { choices, defaults } = compareChoices(dataset);
  const [chosen, setChosen] = useState<Axes | null>(null);
  const axes = chosen ?? defaults;
  const label = (path: string) => choices.find((c) => c.path === path)?.label ?? path;
  const { shown, missing } = bubbles(
    dataset,
    teams.map((t) => t.team),
    axes,
  );
  const nickname = new Map(teams.map((t) => [t.team, t.nickname]));
  const sizes = shown.map((b) => Math.max(0, b.size ?? 0));
  const largest = Math.max(0, ...sizes);

  const select = (axis: keyof Axes, name: string) => (
    <label className="flex flex-col gap-1 text-sm">
      {name}
      <select
        className="bg-background h-9 rounded-md border px-2"
        value={axes[axis]}
        onChange={(e) => setChosen({ ...axes, [axis]: e.target.value })}
      >
        {choices
          .filter((c) => axis === "size" || c.path !== CONSTANT)
          .map((c) => (
            <option key={c.path} value={c.path}>
              {c.label}
            </option>
          ))}
      </select>
    </label>
  );

  return (
    <section aria-labelledby="compare-heading" className="flex flex-col gap-4">
      <h2 id="compare-heading" className="text-2xl font-bold tracking-tight">
        Compare Team Scores
      </h2>
      <div className="flex flex-wrap gap-3">
        {select("x", "Across (x)")}
        {select("y", "Up (y)")}
        {select("size", "Bubble size")}
      </div>
      {missing.length > 0 && (
        <p className="text-muted-foreground text-sm" data-testid="compare-missing">
          {missing.length} {missing.length === 1 ? "team has" : "teams have"} no value for a choice,
          so {missing.length === 1 ? "it is" : "they are"} not shown: {missing.join(", ")}.
        </p>
      )}
      <div className="bg-card rounded-lg border p-4">
        {shown.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center italic">No Data</p>
        ) : (
          <Plot
            label="Compare Team Scores"
            className="h-[min(70vh,36rem)]"
            figure={{
              data: [
                {
                  type: "scatter",
                  mode: "text+markers",
                  x: shown.map((b) => b.x),
                  y: shown.map((b) => b.y),
                  text: shown.map((b) => b.team),
                  textposition: "bottom center",
                  hovertext: shown.map((b) =>
                    [
                      `Team ${b.team}${nickname.get(b.team) ? ` · ${nickname.get(b.team)}` : ""}`,
                      `${label(axes.x)}: ${chartText(b.x)}`,
                      `${label(axes.y)}: ${chartText(b.y)}`,
                      ...(b.size === null ? [] : [`${label(axes.size)}: ${chartText(b.size)}`]),
                    ].join("<br>"),
                  ),
                  hoverinfo: "text",
                  marker: {
                    color: "var(--chart-2)",
                    opacity: 0.8,
                    line: { color: "var(--card)", width: 1 },
                    ...(axes.size === CONSTANT || largest === 0
                      ? { size: CONSTANT_PX }
                      : {
                          size: sizes,
                          sizemode: "area",
                          sizeref: (2 * largest) / LARGEST_PX ** 2,
                          sizemin: SMALLEST_PX,
                        }),
                  },
                  showlegend: false,
                },
              ],
              layout: {
                xaxis: { ...AXIS, title: { text: label(axes.x) } },
                yaxis: { ...AXIS, title: { text: label(axes.y) }, rangemode: "tozero" },
                margin: { t: 16, r: 16, b: 16, l: 16, pad: 4 },
              },
            }}
          />
        )}
        <ChartTable
          caption="Compare Team Scores"
          columns={[
            "Team",
            label(axes.x),
            label(axes.y),
            ...(axes.size === CONSTANT ? [] : [label(axes.size)]),
          ]}
          rows={shown.map((b) => ({
            label: b.team,
            cells: [
              chartText(b.x),
              chartText(b.y),
              ...(b.size === null ? [] : [chartText(b.size)]),
            ],
          }))}
        />
      </div>
    </section>
  );
}
