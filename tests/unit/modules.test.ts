/**
 * The text modules (#384; docs/spec/09 MO-3, MO-4, MO-4a, F-18, F-27): Stats, ColumnDisplay,
 * SingleDisplay, Grid and Divider, as the dashboard computes them (`src/analysis/modules/values.ts`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Dataset } from "@/analysis/engine";
import { displayValue, NO_DATA } from "@/analysis/modules/display";
import {
  columns,
  combined,
  gridCells,
  rankBand,
  shownValue,
  teamValue,
  type ValueOptions,
} from "@/analysis/modules/values";
import { BUILT_IN_MODULES } from "@/components/analysis/modules";
import { builtInModules } from "@/config/check/references";
import type { AnalysisModulesConfig } from "@/config/types";

/** Five teams; 9999 has no values at all. */
const dataset = {
  tmps: [],
  teams: {
    "111": { avg: { score: 30 }, rate: 0.5, name: "WildStang" },
    "254": { avg: { score: 50 }, rate: 0.75 },
    "2338B": { avg: { score: 50 }, rate: null },
    "3061": { avg: { score: 40 }, rate: 0.25 },
    "9999": {},
  },
} as unknown as Dataset;

describe("MO-3, F-27: a value, after multiplier and addend, or No Data", () => {
  it("reads the team's value; a missing or null value, or hideIfValue, is No Data", () => {
    expect(shownValue(dataset, ["3061"], { path: "avg.score" })).toEqual({ value: 40, text: "40" });
    expect(
      shownValue(dataset, ["3061"], { path: "rate", multiplier: 100, decimals: 0, unit: "%" }).text,
    ).toBe("25%");
    expect(shownValue(dataset, ["9999"], { path: "avg.score" }).text).toBe(NO_DATA);
    expect(shownValue(dataset, ["2338B"], { path: "rate" }).text).toBe(NO_DATA);
    expect(shownValue(dataset, ["3061"], { path: "avg.score", hideIfValue: 40 }).text).toBe(
      NO_DATA,
    );
    expect(teamValue(dataset, "9999", "avg.score")).toBeNull();
  });

  it("string: the raw text, for ColumnDisplay's names", () => {
    expect(shownValue(dataset, ["111"], { path: "name", string: true }).text).toBe("WildStang");
    expect(shownValue(dataset, ["254"], { path: "name", string: true }).text).toBe(NO_DATA);
  });
});

describe("MO-3: several teams combined (an alliance in Simulate Match, #389)", () => {
  it("averages, or sums with aggrMethod sum, over the teams that have a value", () => {
    const alliance = ["111", "3061", "9999"];
    expect(combined(dataset, alliance, "avg.score")).toBe(35); // 9999 has none, so not 70 / 3
    expect(combined(dataset, alliance, "avg.score", "sum")).toBe(70);
    expect(combined(dataset, ["9999"], "avg.score")).toBeNull();
  });

  it("a combined value is never ranked", () => {
    expect(
      shownValue(dataset, ["111", "3061"], { path: "avg.score", sort: 1 }).rank,
    ).toBeUndefined();
  });
});

describe("MO-4, MO-4a: rank among every team at the event with a value", () => {
  it("ties share a rank, and the next skips; teams with No Data are not ranked", () => {
    const options: ValueOptions = { path: "avg.score", sort: 1 };
    expect(shownValue(dataset, ["254"], options).rank).toMatchObject({ rank: 1, of: 4 });
    expect(shownValue(dataset, ["2338B"], options).rank).toMatchObject({ rank: 1, of: 4 });
    expect(shownValue(dataset, ["3061"], options).rank).toMatchObject({ rank: 3, of: 4 });
    expect(shownValue(dataset, ["9999"], options).rank).toBeUndefined();
    // sort -1: lower is better.
    expect(shownValue(dataset, ["111"], { ...options, sort: -1 }).rank?.rank).toBe(1);
    // No sort, no rank.
    expect(shownValue(dataset, ["254"], { path: "avg.score" }).rank).toBeUndefined();
  });

  it("v5's colour bands: the top 5 %, 25 % and 50 %, rounded as v5 rounded them", () => {
    const of = 48;
    expect([1, 2, 3, 12, 13, 24, 25, 48].map((rank) => rankBand({ rank, of }))).toEqual([
      "top5",
      "top5",
      "top25",
      "top25",
      "top50",
      "top50",
      "top100",
      "top100",
    ]);
  });
});

describe("ColumnDisplay: one column per team, each ranked", () => {
  it("each team's value and rank, No Data unranked", () => {
    expect(
      columns(dataset, ["3061", "254", "9999"], { path: "avg.score", sort: 1 }).map((c) => [
        c.team,
        c.text,
        c.rank?.rank,
      ]),
    ).toEqual([
      ["3061", "40", 3],
      ["254", "50", 1],
      ["9999", NO_DATA, undefined],
    ]);
  });
});

describe("Grid: cells coloured between min and max", () => {
  const options = {
    rows: 1,
    cols: 3,
    decimals: 0,
    min: 0,
    max: 100,
    cells: [
      { x: 1, y: 1, path: "avg.score", hex: "#30a2ff" },
      { x: 2, y: 1, path: "rate", hex: "#30a2ff" },
      { x: 3, y: 1, path: "missing", hex: "#30a2ff" },
    ],
  };

  it("sums over the teams; alpha from 30 at min to 255 at max, and No Data faint", () => {
    const cells = gridCells(dataset, ["111", "3061"], options);
    expect(cells.map((c) => c.text)).toEqual(["70", "1", NO_DATA]);
    expect(cells.map((c) => c.color)).toEqual(["#30a2ffbb", "#30a2ff1f", "#30a2ff1e"]);
  });

  it("an alpha stays between 30 and 255, and min and max have defaults (v5 broke the colour)", () => {
    const below = gridCells(dataset, ["3061"], { ...options, min: 60 });
    expect(below[0].color).toBe("#30a2ff1e");
    const defaults = gridCells(dataset, ["3061"], { ...options, min: undefined, max: undefined });
    expect(defaults[0].color).toBe("#30a2ffff"); // the largest value is the full colour
  });
});

describe("F-18: a module changes nothing it is given", () => {
  it("the teams and the dataset are the same afterwards", () => {
    const teams = Object.freeze(["111", "3061"]);
    const frozen = structuredClone(dataset);
    const deepFreeze = (o: unknown): void => {
      if (o && typeof o === "object") {
        Object.freeze(o);
        Object.values(o).forEach(deepFreeze);
      }
    };
    deepFreeze(frozen);
    expect(() => {
      shownValue(frozen, teams, { path: "avg.score", sort: 1 });
      columns(frozen, teams, { path: "avg.score", sort: 1 });
      gridCells(frozen, teams, {
        rows: 1,
        cols: 1,
        cells: [{ x: 1, y: 1, path: "rate", hex: "#000000" }],
      });
    }).not.toThrow();
    expect(teams).toEqual(["111", "3061"]);
  });
});

describe("the module registry (MO-2 is replaced)", () => {
  it("knows every built-in module the schema names", () => {
    expect(Object.keys(BUILT_IN_MODULES).sort()).toEqual(builtInModules().sort());
  });

  it("a name every object has, such as toString, is not a module", () => {
    expect(Object.hasOwn(BUILT_IN_MODULES, "toString")).toBe(false);
  });

  it("every stat of the 2025 and 2026 configurations shows as display.ts formats it", () => {
    for (const dir of ["config", "config/seasons/2025"]) {
      const modules = JSON.parse(
        readFileSync(join(process.cwd(), dir, "analysis-modules.json"), "utf8"),
      ) as AnalysisModulesConfig;
      for (const m of modules.modules.filter((x) => x.module === "Stats")) {
        for (const stat of m.options.list as ValueOptions[]) {
          expect(shownValue(dataset, ["3061"], stat).text).toBe(
            displayValue(teamValue(dataset, "3061", stat.path), stat).text,
          );
        }
      }
    }
  });
});
