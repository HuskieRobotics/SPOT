/**
 * The heatmap (#386; docs/spec/09 HeatmapScatterPlot, A-20, SC-28, F-18): the positions it draws,
 * folded or not, picked by action and period (#320). The browser test draws 2026mnwi's
 * (`analysis.spec.ts`).
 */
import { describe, expect, it } from "vitest";
import type { Dataset } from "@/analysis/engine";
import {
  heatmapGroups,
  heatPoints,
  transformPoint,
  type HeatmapOptions,
} from "@/analysis/modules/heatmap";
import type { MatchScoutingConfig } from "@/config/types";

describe("A-20: the half-field fold is an option", () => {
  it('"none", or no option, draws a position as stored (SC-28: stored the same way round)', () => {
    for (const x of [0, 30, 50, 70, 100]) {
      expect(transformPoint({ x, y: 25 })).toEqual({ x, y: 25 });
      expect(transformPoint({ x, y: 25 }, "none")).toEqual({ x, y: 25 });
    }
  });

  it("foldHalfField: the near third doubles, the far third is turned onto it, the middle goes", () => {
    const fold = (x: number, y: number) => transformPoint({ x, y }, "foldHalfField");
    expect(fold(0, 10)).toEqual({ x: 0, y: 10 });
    expect(fold(15, 10)).toEqual({ x: 30, y: 10 });
    expect(fold(30, 10)).toEqual({ x: 60, y: 10 });
    expect(fold(100, 10)).toEqual({ x: 0, y: 90 });
    expect(fold(85, 10)).toEqual({ x: 30, y: 90 });
    expect(fold(70, 10)).toEqual({ x: 60, y: 90 });
    // A half turn, not a mirror: near the far driver's right (top of the picture, y 10) lands
    // near the near driver's right (bottom, y 90).
    expect(fold(90, 10)).toEqual({ x: 20, y: 90 });
    // The edges of the middle third, as v5 drew them: 30.5 and 69.5 are left out.
    for (const x of [30.5, 31, 50, 69, 69.5]) expect(fold(x, 10)).toBeNull();
  });
});

const action = (id: string, phase: string, x: number | null, extra: object = {}) => ({
  id,
  ts: 0,
  phase,
  segment: null,
  segmentKind: null,
  segmentIndex: null,
  ...(x === null ? {} : { other: { pos: { x, y: 50 } } }),
  ...extra,
});

const dataset = {
  tmps: [],
  teams: {
    "3061": {
      actions: [
        action("Shoot", "auto", 10),
        action("Shoot", "teleop", 20),
        action("Shoot", "teleop", null), // no position
        action("Shoot", "teleop", 50), // the middle third, when folded
        action("Pass", "teleop", 80),
        action("Shoot", "teleop", 25, { segment: "shift", segmentKind: "inactive" }),
      ],
    },
    "254": { actions: [action("Shoot", "teleop", 5)] },
    "9999": {},
  },
} as unknown as Dataset;

const options: HeatmapOptions = {
  coordinatePath: "other.pos",
  aggregatedActionsPath: "actions",
  actionGroups: [
    { name: "Teleop", actions: ["Shoot", "Pass"], phases: ["teleop"] },
    { name: "Auto", actions: ["Shoot"], phases: ["auto"] },
  ],
  actionLabels: { Shoot: "Start Shooting" },
  imgPath: "img/field.svg",
};

const xs = (points: { x: number }[]) => points.map((p) => p.x);

describe("HeatmapScatterPlot: positions by group, action and period (#320)", () => {
  it("a trace per action with a position, named from actionLabels, else by id", () => {
    const [teleop, auto] = heatmapGroups(dataset, ["3061"], options);
    expect(teleop.name).toBe("Teleop");
    expect(teleop.traces.map((t) => [t.id, t.label, xs(t.points)])).toEqual([
      ["Shoot", "Start Shooting", [20, 50, 25]],
      ["Pass", "Pass", [80]],
    ]);
    expect(xs(heatPoints(teleop))).toEqual([20, 50, 25, 80]);
    expect(auto.traces.map((t) => xs(t.points))).toEqual([[10]]);
  });

  it("with the fold, a position in the middle third is left out", () => {
    const [teleop] = heatmapGroups(dataset, ["3061"], {
      ...options,
      coordinateTransform: "foldHalfField",
    });
    expect(teleop.traces.map((t) => xs(t.points))).toEqual([[40, 50], [40]]);
  });

  it("a kinds filter reads the configuration's fixed kinds", () => {
    const config = {
      timing: { phases: [{ id: "auto", kind: "active" }, { id: "teleop" }] },
    } as unknown as MatchScoutingConfig;
    const active = { name: "Active", actions: ["Shoot"], kinds: ["active"] };
    const inactive = { name: "Inactive", actions: ["Shoot"], kinds: ["inactive"] };
    const groups = heatmapGroups(
      dataset,
      ["3061"],
      { ...options, actionGroups: [active, inactive] },
      config,
    );
    expect(groups.map((g) => xs(heatPoints(g)))).toEqual([[10], [25]]);
  });

  it("several teams together; a team without the list adds nothing; nothing is changed", () => {
    const frozen = structuredClone(dataset);
    const deepFreeze = (o: unknown): void => {
      if (o && typeof o === "object") {
        Object.freeze(o);
        Object.values(o).forEach(deepFreeze);
      }
    };
    deepFreeze(frozen);
    const [teleop] = heatmapGroups(frozen, ["3061", "254", "9999"], options);
    expect(xs(teleop.traces[0].points)).toEqual([20, 50, 25, 5]);
    expect(heatmapGroups(frozen, ["9999"], options).map((g) => g.traces)).toEqual([[], []]);
  });
});
