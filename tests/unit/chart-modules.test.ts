/**
 * The chart modules (#385; docs/spec/09 MO-3, MO-5, TR-6, DV-17, F-18, F-27): Bar, Pie,
 * PerformanceTimePlot and RadarChart, as the dashboard computes them
 * (`src/analysis/modules/charts.ts`). The browser test draws them on Plotly (`analysis.spec.ts`).
 */
import { describe, expect, it } from "vitest";
import type { Dataset } from "@/analysis/engine";
import {
  barValues,
  chartText,
  hasData,
  performanceLines,
  pieSlices,
  radarLines,
} from "@/analysis/modules/charts";
import { NO_DATA } from "@/analysis/modules/display";
import { resolveColors } from "@/components/analysis/modules/plot";

const tmp = (team: string, level: "qual" | "playoff", matchNumber: number, extra: object) => ({
  _id: `${team}-${level}-${matchNumber}`,
  team,
  level,
  matchNumber,
  submittedAt: matchNumber,
  ...extra,
});

/** 9999 has no values; 3061's matches are stored out of order, a playoff first. */
const dataset = {
  tmps: [
    tmp("3061", "playoff", 2, { scores: { total: 90 } }),
    tmp("3061", "qual", 12, { scores: { total: 40 } }),
    tmp("254", "qual", 3, { scores: { total: 70 } }),
    tmp("3061", "qual", 3, { scores: { total: 30, auto: 6 } }),
    tmp("9999", "qual", 4, {}),
  ],
  teams: {
    "254": { counts: { l1: 4, l2: 2 }, rating: { auto: 3, teleop: 2 }, time: { a: 6, b: -2 } },
    "3061": { counts: { l1: 1, l2: 5 }, rating: { auto: 2.5, teleop: 6 }, time: { a: 1, b: 2 } },
    "9999": {},
  },
} as unknown as Dataset;

describe("Bar (MO-3, F-27): a bar per value, the teams combined", () => {
  const bars = [
    { name: "L1", path: "counts.l1" },
    { name: "L2", path: "counts.l2", aggrMethod: "sum" as const },
    { name: "L3", path: "counts.l3" },
  ];

  it("one team's values; a missing value is No Data, not 0", () => {
    const chart = barValues(dataset, ["3061"], bars);
    expect(chart.labels).toEqual(["L1", "L2", "L3"]);
    expect(chart.series[0].values).toEqual([1, 5, null]);
    expect(hasData(chart)).toBe(true);
  });

  it("several teams averaged, or summed, over the teams that have a value", () => {
    expect(barValues(dataset, ["3061", "254", "9999"], bars).series[0].values).toEqual([
      2.5,
      7,
      null,
    ]);
  });

  it("a team with no values has nothing to draw: No Data", () => {
    expect(hasData(barValues(dataset, ["9999"], bars))).toBe(false);
  });
});

describe("Pie (MO-3): a slice per value, with decimals and unit", () => {
  const slices = [
    { name: "A", path: "time.a" },
    { name: "B", path: "time.b" },
    { name: "C", path: "time.c" },
  ];

  it("a negative value or No Data is an empty slice; the text keeps the value", () => {
    expect(pieSlices(dataset, ["254"], { slices, unit: "s" })).toEqual({
      labels: ["A", "B", "C"],
      sizes: [6, 0, 0],
      texts: ["6s", "-2s", NO_DATA],
    });
  });

  it("decimals fixes the places; without it, at most two", () => {
    const teams = ["3061", "254"];
    expect(pieSlices(dataset, teams, { slices })?.texts).toEqual(["3.5", "0", NO_DATA]);
    expect(pieSlices(dataset, teams, { slices, decimals: 2 })?.texts.slice(0, 2)).toEqual([
      "3.50",
      "0.00",
    ]);
  });

  it("nothing to draw, every slice empty, is null: the module shows No Data", () => {
    expect(pieSlices(dataset, ["9999"], { slices })).toBeNull();
    expect(pieSlices(dataset, ["254"], { slices: [slices[1]] })).toBeNull();
  });
});

describe("PerformanceTimePlot (TR-6, DV-17): a team's matches in order, a line per value", () => {
  it("qualifications by number, then playoffs, named as the field names them", () => {
    const chart = performanceLines(dataset, "3061", ["scores.total", "scores.auto"]);
    expect(chart.labels).toEqual(["Qual 3", "Qual 12", "Playoff 2"]);
    expect(chart.short).toEqual(["Q3", "Q12", "P2"]);
    expect(chart.series).toEqual([
      { name: "scores.total", values: [30, 40, 90] },
      { name: "scores.auto", values: [6, null, null] },
    ]);
  });

  it("a team with no values in its matches has nothing to draw", () => {
    expect(hasData(performanceLines(dataset, "9999", ["scores.total"]))).toBe(false);
    expect(hasData(performanceLines(dataset, "1", ["scores.total"]))).toBe(false);
  });
});

describe("RadarChart: a closed line per entry, from 0 to 4", () => {
  const options = {
    sections: [{ name: "Auto" }, { name: "Teleop" }, { name: "Endgame" }],
    lines: [
      {
        name: "Shooting",
        times: [
          { name: "Auto", path: "rating.auto" },
          { name: "Teleop", path: "rating.teleop" },
          { name: "Endgame", path: "none" },
        ],
      },
    ],
  };

  it('closes each line on its first section; "none" is 0, a missing value is No Data', () => {
    const chart = radarLines(dataset, ["254"], options);
    expect(chart.labels).toEqual(["Auto", "Teleop", "Endgame", "Auto"]);
    expect(chart.series).toEqual([{ name: "Shooting", values: [3, 2, 0, 3] }]);
    expect(chart.max).toBe(4);
  });

  it("a configuration that repeats the first section, as v5 needed, is drawn the same", () => {
    const repeated = {
      sections: [...options.sections, { name: "Auto" }],
      lines: [
        { ...options.lines[0], times: [...options.lines[0].times, options.lines[0].times[0]] },
      ],
    };
    expect(radarLines(dataset, ["254"], repeated)).toEqual(radarLines(dataset, ["254"], options));
  });

  it("a value above 4 stretches the axis; several teams are a line each, named by team", () => {
    const chart = radarLines(dataset, ["254", "3061"], options);
    expect(chart.max).toBe(6);
    expect(chart.series.map((s) => s.name)).toEqual(["254 Shooting", "3061 Shooting"]);
  });

  it('a team with no values has nothing to draw, though "none" is 0', () => {
    const chart = radarLines(dataset, ["9999"], options);
    expect(chart.series[0].values).toEqual([null, null, 0, null]);
    expect(chart.measured).toBe(false);
  });
});

describe("F-18: a chart changes nothing it is given", () => {
  it("the dataset is the same afterwards, the tmps in their stored order", () => {
    const frozen = structuredClone(dataset);
    const deepFreeze = (o: unknown): void => {
      if (o && typeof o === "object") {
        Object.freeze(o);
        Object.values(o).forEach(deepFreeze);
      }
    };
    deepFreeze(frozen);
    expect(() => {
      barValues(frozen, ["3061"], [{ name: "L1", path: "counts.l1" }]);
      pieSlices(frozen, ["3061"], { slices: [{ name: "A", path: "time.a" }] });
      performanceLines(frozen, "3061", ["scores.total"]);
      radarLines(frozen, ["3061"], { sections: [{ name: "A" }], lines: [] });
    }).not.toThrow();
    expect(frozen.tmps.map((t) => t.matchNumber)).toEqual([2, 12, 3, 3, 4]);
  });
});

describe("MO-5: a chart in the theme's colours", () => {
  it("every var(--name) string becomes that colour; nothing else changes", () => {
    const figure = {
      data: [{ type: "bar", y: [1, null], marker: { color: "var(--primary)" } }],
      layout: { colorway: ["var(--chart-1)", "#123456"], title: "var is not a colour" },
    };
    const resolved = resolveColors(figure, (name) => `rgb(${name})`);
    expect(resolved).toEqual({
      data: [{ type: "bar", y: [1, null], marker: { color: "rgb(--primary)" } }],
      layout: { colorway: ["rgb(--chart-1)", "#123456"], title: "var is not a colour" },
    });
    expect(figure.data[0].marker.color).toBe("var(--primary)");
  });

  it("a value in a chart's table: at most two decimals, or No Data", () => {
    expect([1, 2.5, 1 / 3, null].map(chartText)).toEqual(["1", "2.5", "0.33", NO_DATA]);
  });
});
