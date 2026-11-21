/**
 * Arithmetic and lookup transformers (#312, docs/spec/09, T-2). Oracle agreement for 2025 is in
 * the ratchet (oracle-compare.test.ts); these tests pin the rules around it: missing paths, null
 * inputs (DM-1b, decided 2026-11-20), divide by zero (F-24, F-25), and option validation (CS-10).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDataset, runPipeline } from "@/analysis/engine";
import { createRegistry } from "@/analysis/transformers";
import { generate } from "@/generate/synthetic";
import type { MatchScoutingConfig, PipelineEntry } from "@/config/types";
import {
  inferSumAverageCountPaths,
  legacyCountIds,
  type V1MatchScouting,
} from "@/config/convert/v1-to-v2";

const config = JSON.parse(
  readFileSync(join(process.cwd(), "config", "seasons", "2025", "match-scouting.json"), "utf8"),
) as MatchScoutingConfig;
const [performance] = generate({
  config,
  seed: "arith",
  matches: 1,
  robotsPerMatch: 1,
}).performances;
const registry = createRegistry();

/** Run one entry with `values` placed on the performance (tmp) or the team (team). */
function run(
  type: "tmp" | "team",
  values: Record<string, unknown>,
  entry: Omit<PipelineEntry, "type" | "outputPath">,
) {
  const dataset = buildDataset([performance]);
  Object.assign(type === "tmp" ? dataset.tmps[0] : Object.values(dataset.teams)[0], values);
  const result = runPipeline(dataset, [{ type, outputPath: "out", ...entry } as PipelineEntry], {
    registry,
    context: { config },
  });
  const target = type === "tmp" ? result.dataset.tmps[0] : Object.values(result.dataset.teams)[0];
  return { out: (target as Record<string, unknown>).out, problems: result.problems };
}
const value = (...args: Parameters<typeof run>) => {
  const { out, problems } = run(...args);
  expect(problems).toEqual([]);
  return out;
};

describe.each(["tmp", "team"] as const)("TR-11: %s arithmetic", (type) => {
  it("sum adds left to right; a missing path is 0; null makes the result null", () => {
    expect(
      value(
        type,
        { a: 1, b: { c: 2.5 } },
        { name: "sum", options: { addends: ["a", "b.c", "nope"] } },
      ),
    ).toBe(3.5);
    expect(
      value(type, { a: 1, b: null }, { name: "sum", options: { addends: ["a", "b"] } }),
    ).toBeNull();
  });

  it("subtract", () => {
    expect(
      value(type, { a: 5, b: 7 }, { name: "subtract", options: { minuend: "a", subtrahend: "b" } }),
    ).toBe(-2);
    expect(
      value(type, { a: 5 }, { name: "subtract", options: { minuend: "a", subtrahend: "b" } }),
    ).toBe(5);
    expect(
      value(type, { a: null }, { name: "subtract", options: { minuend: "a", subtrahend: "b" } }),
    ).toBeNull();
  });

  it("multiply: a missing factor is 1 (v5), null gives null, then times weight", () => {
    const options = { multiplicands: ["a", { path: "b" }, "missing"], weight: 0.001 };
    expect(value(type, { a: 4, b: 2500 }, { name: "multiply", options })).toBe(10);
    // 2026: average cycle time in seconds is null for a team with no cycles (v5: NaN)
    expect(value(type, { a: 4, b: null }, { name: "multiply", options })).toBeNull();
  });

  it("ratio: sums of paths and numbers; null input gives null", () => {
    const options = { numerator: ["a", 1], denominator: ["b", "c"] };
    expect(value(type, { a: 3, b: 2, c: 6 }, { name: "ratio", options })).toBe(0.5);
    expect(value(type, { a: null, b: 2, c: 6 }, { name: "ratio", options })).toBeNull();
  });

  it("F-24/F-25: divide by zero writes divByZero exactly as configured, null when unset", () => {
    const base = { numerator: ["a"], denominator: ["b"] };
    expect(value(type, { a: 0, b: 0 }, { name: "ratio", options: { ...base, divByZero: 0 } })).toBe(
      0,
    );
    expect(
      value(type, { a: 0, b: 0 }, { name: "ratio", options: { ...base, divByZero: 150000 } }),
    ).toBe(150000);
    expect(value(type, { a: 0, b: 0 }, { name: "ratio", options: base })).toBeNull();
  });

  it("weightedSum", () => {
    const options = { weightedPaths: { l1: 2, l4: 5, missing: 9 } };
    expect(value(type, { l1: 3, l4: 2 }, { name: "weightedSum", options })).toBe(16);
    expect(value(type, { l1: 3, l4: null }, { name: "weightedSum", options })).toBeNull();
  });

  it("weightedSumAverage: average weight from counts; null when nothing was counted", () => {
    const options = { weightedPaths: { r1: 1, r2: 2, r3: 3, r4: 4 } };
    expect(value(type, { r1: 1, r3: 2, r4: 1 }, { name: "weightedSumAverage", options })).toBe(
      11 / 4,
    );
    expect(value(type, { r1: 0 }, { name: "weightedSumAverage", options })).toBeNull();
  });

  it("sumAverage: combines averages by count, skipping groups with no count or no average", () => {
    const options = {
      groups: [
        { averagePath: "a.avg", countPaths: ["a.n1", "a.n2"] },
        { averagePath: "b.avg", countPaths: ["b.n"] },
        { averagePath: "c.avg", countPaths: ["c.n"] }, // no count: left out
        { averagePath: "d.avg", countPaths: ["d.n"] }, // no average: left out
      ],
    };
    const values = {
      a: { avg: 2, n1: 1, n2: 2 },
      b: { avg: 4, n: 1 },
      c: { avg: 9, n: 0 },
      d: { avg: null, n: 5 },
    };
    expect(value(type, values, { name: "sumAverage", options })).toBe((2 * 3 + 4 * 1) / 4);
    expect(value(type, { d: { avg: null, n: 5 } }, { name: "sumAverage", options })).toBeNull();
  });

  it("a value that is not a number is an error naming the path (v5 concatenated or gave NaN)", () => {
    const { problems } = run(type, { a: "N/A" }, { name: "sum", options: { addends: ["a"] } });
    expect(problems[0].message).toBe('"a" holds "N/A", which is not a number');
  });
});

describe("map", () => {
  const options = { path: "climb", map: { climb1: 4, "": "none", "3": "three", nested: { x: 1 } } };
  it("translates through the table; unknown values give null", () => {
    expect(value("tmp", { climb: "climb1" }, { name: "map", options })).toBe(4);
    expect(value("tmp", { climb: "climb9" }, { name: "map", options })).toBeNull();
    expect(value("tmp", { climb: 3 }, { name: "map", options })).toBe("three");
  });
  it("a missing path looks up the empty string (v5); own entries only", () => {
    expect(value("tmp", {}, { name: "map", options })).toBe("none");
    expect(value("tmp", { climb: "constructor" }, { name: "map", options })).toBeNull();
  });
  it("copies object values, so performances never share them", () => {
    const dataset = buildDataset([performance, { ...performance, _id: "b".repeat(24) }]);
    for (const tmp of dataset.tmps) Object.assign(tmp, { climb: "nested" });
    const { dataset: out } = runPipeline(
      dataset,
      [{ type: "tmp", name: "map", outputPath: "out", options }],
      {
        registry,
        context: { config },
      },
    );
    expect(out.tmps[0].out).toEqual({ x: 1 });
    expect(out.tmps[0].out).not.toBe(out.tmps[1].out);
  });
});

describe("threshold", () => {
  const paths = { "a.v": "Alpha", "b.v": "Bravo", "c.v": "Charlie" };
  const values = { a: { v: 3 }, b: { v: 1 }, c: { v: null } };
  it("lists the names above the threshold; null never passes", () => {
    expect(value("team", values, { name: "threshold", options: { paths, threshold: 0 } })).toEqual([
      "Alpha",
      "Bravo",
    ]);
    expect(value("team", values, { name: "threshold", options: { paths, threshold: 2 } })).toEqual([
      "Alpha",
    ]);
  });
  it("lists every name without a threshold", () => {
    expect(value("team", values, { name: "threshold", options: { paths } })).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });
  it("joins with a separator, writing `none` (or null) when nothing passes", () => {
    expect(
      value("team", values, {
        name: "threshold",
        options: { paths, threshold: 0, separator: ", " },
      }),
    ).toBe("Alpha, Bravo");
    expect(
      value("team", values, {
        name: "threshold",
        options: { paths, threshold: 9, separator: ", ", none: "-" },
      }),
    ).toBe("-");
    expect(
      value("team", values, {
        name: "threshold",
        options: { paths, threshold: 9, separator: ", " },
      }),
    ).toBeNull();
    expect(
      value("team", values, {
        name: "threshold",
        options: { paths, threshold: 9, separator: ", ", none: "" },
      }),
    ).toBe("");
  });
});

describe("CS-10: option validation", () => {
  it("sumAverage needs explicit countPaths; weightedSumAverage needs weightedPaths", () => {
    const { problems } = runPipeline(
      buildDataset([performance]),
      [
        {
          type: "tmp",
          name: "sumAverage",
          outputPath: "x",
          options: { groups: [{ averagePath: "scores.aRating" }] },
        },
        { type: "team", name: "weightedSumAverage", outputPath: "y", options: { path: "counts" } },
        { type: "tmp", name: "ratio", outputPath: "z", options: { numerator: ["a"] } },
      ],
      { registry, context: { config } },
    );
    expect(problems.map((p) => p.message)).toEqual([
      'Invalid options: options.groups.0: missing required property "countPaths"',
      'Invalid options: options: missing required property "weightedPaths"; options: unknown property "path"',
      'Invalid options: options: missing required property "denominator"',
    ]);
  });
});

describe("converter: sumAverage countPaths written out (A-39, decided 2026-11-20)", () => {
  it("reproduces v5's inference from composite-id names", () => {
    const ids = [
      "autoRatingShooting2",
      "autoRatingShooting1",
      "autoRatingPassing1",
      "teleopRatingShooting1",
      "startGame",
    ];
    expect(inferSumAverageCountPaths("scores.autoShootingRating", ids)).toEqual([
      "counts.autoRatingShooting1",
      "counts.autoRatingShooting2",
    ]);
    expect(inferSumAverageCountPaths("scores.unknownRating", ids)).toEqual([]);
    expect(inferSumAverageCountPaths("averages.autoShootingRating", ids)).toEqual([]);
  });

  it("uses every v1 button id, as v5's countActions(all) did", () => {
    const v1 = JSON.parse(
      readFileSync(join(process.cwd(), "config", "v1", "match-scouting.json"), "utf8"),
    ) as V1MatchScouting;
    const ids = legacyCountIds(v1);
    expect(ids).toContain("activeShift1RatingShooting3"); // from the hidden catalog layer
    expect(new Set(ids).size).toBe(ids.length);
  });
});
