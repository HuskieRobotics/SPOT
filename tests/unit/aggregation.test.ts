/**
 * Team aggregation transformers (#313, docs/spec/09 TR-12, T-2). Oracle agreement for 2025 is in
 * the ratchet (oracle-compare.test.ts).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDataset, runPipeline, type Dataset } from "@/analysis/engine";
import { createRegistry } from "@/analysis/transformers";
import { generate } from "@/generate/synthetic";
import type { MatchScoutingConfig, PipelineEntry } from "@/config/types";
import type { TeamMatchPerformance } from "@/data/types";

const config = JSON.parse(
  readFileSync(join(process.cwd(), "config", "seasons", "2025", "match-scouting.json"), "utf8"),
) as MatchScoutingConfig;
const [base] = generate({ config, seed: "aggregate", matches: 1, robotsPerMatch: 1 }).performances;
const registry = createRegistry();

/** One team, one performance per entry of `values`, in match order. */
function teamDataset(values: Record<string, unknown>[], matchNumbers?: number[]): Dataset {
  const performances: TeamMatchPerformance[] = values.map((_, i) => ({
    ...base,
    _id: String(i).padStart(24, "0"),
    matchNumber: matchNumbers?.[i] ?? i + 1,
    submittedAt: base.submittedAt + i,
  }));
  const dataset = buildDataset(performances);
  dataset.tmps.forEach((tmp, i) => Object.assign(tmp, values[i]));
  return dataset;
}

function runOn(dataset: Dataset, entry: Omit<PipelineEntry, "outputPath">) {
  const result = runPipeline(dataset, [{ outputPath: "out", ...entry } as PipelineEntry], {
    registry,
    context: { config },
  });
  return { result, team: Object.values(result.dataset.teams)[0] };
}
const teamValue = (values: Record<string, unknown>[], entry: Omit<PipelineEntry, "outputPath">) => {
  const { result, team } = runOn(teamDataset(values), entry);
  expect(result.problems).toEqual([]);
  return team.out;
};

describe.each(["average", "averageTime"])("TR-12: %s", (name) => {
  it("averages a number over the matches that have one, skipping No Data", () => {
    expect(
      teamValue([{ r: 2 }, { r: null }, {}, { r: 4 }], {
        type: "team",
        name,
        options: { path: "r" },
      }),
    ).toBe(3);
  });

  it("with nothing to average: null, or ifNone when configured", () => {
    expect(teamValue([{ r: null }, {}], { type: "team", name, options: { path: "r" } })).toBeNull();
    expect(
      teamValue([{ r: null }], { type: "team", name, options: { path: "r", ifNone: 150000 } }),
    ).toBe(150000);
  });

  it("averages objects key by key over every key any match has (v5: the first match's keys)", () => {
    const out = teamValue(
      [{ counts: { l1: 1, l4: 2 } }, { counts: { l1: 3, l4: null, late: 4 } }],
      { type: "team", name, options: { path: "counts" } },
    );
    expect(out).toEqual({ l1: 2, l4: 2, late: 4 });
  });

  it("averages nested objects too, such as counts grouped by phase (#311)", () => {
    const out = teamValue(
      [
        { counts: { auto: { l4: 1 }, teleop: { l4: 4 } } },
        { counts: { auto: { l4: 3 }, teleop: { l4: 6 } } },
      ],
      { type: "team", name, options: { path: "counts", ifNone: 0 } },
    );
    expect(out).toEqual({ auto: { l4: 2 }, teleop: { l4: 5 } });
  });

  it("refuses values that are not numbers", () => {
    const { result } = runOn(teamDataset([{ r: "N/A" }]), {
      type: "team",
      name,
      options: { path: "r" },
    });
    expect(result.problems[0].message).toBe('"r" holds "N/A", which is not a number');
  });
});

describe("deepAverage (kept as v5 had it)", () => {
  it("sums lists, adds across matches, and divides by the matches that had a value", () => {
    const out = teamValue(
      [{ z: { a: { x: 2 }, list: [1, 2] } }, { z: { a: { x: 4, y: 6 }, list: [3] } }, { z: null }],
      { type: "team", name: "deepAverage", options: { path: "z" } },
    );
    // y appears in one of the two matches with values, so it counts as 0 in the other: 6 / 2.
    expect(out).toEqual({ a: { x: 3, y: 3 }, list: 3 });
  });
  it("is null when no match has a numeric value", () => {
    expect(
      teamValue([{ z: { s: "text" } }, {}], {
        type: "team",
        name: "deepAverage",
        options: { path: "z" },
      }),
    ).toBeNull();
  });
});

describe("aggregateArray", () => {
  it("joins the lists in match order and skips No Data", () => {
    expect(
      teamValue([{ c: [1, 2] }, { c: null }, { c: [3] }], {
        type: "team",
        name: "aggregateArray",
        options: { path: "c" },
      }),
    ).toEqual([1, 2, 3]);
  });
  it("copies items, so the team's list never shares objects with a match's output", () => {
    const { team, result } = runOn(teamDataset([{ c: [{ t: 1 }] }]), {
      type: "team",
      name: "aggregateArray",
      options: { path: "c" },
    });
    expect(team.out).toEqual([{ t: 1 }]);
    expect((team.out as unknown[])[0]).not.toBe((result.dataset.tmps[0].c as unknown[])[0]);
  });
  it("refuses a value that is not a list, and a missing path", () => {
    const { result } = runOn(teamDataset([{ c: 5 }]), {
      type: "team",
      name: "aggregateArray",
      options: { path: "c" },
    });
    expect(result.problems[0].message).toBe('"c" holds 5, which is not a list');
    const missing = runOn(teamDataset([{}]), {
      type: "team",
      name: "aggregateArray",
      options: { path: "c" },
    });
    expect(missing.result.problems[0].message).toBe('path "c" does not exist');
  });
});

describe("averageArray", () => {
  const options = { arrayPath: "cycles", valuePath: "time" };
  it("F-2: the tmp variant works and keeps the pipeline going", () => {
    const dataset = teamDataset([{ cycles: [{ time: 2 }, { time: 4 }] }]);
    const { result } = runOn(dataset, { type: "tmp", name: "averageArray", options });
    expect(result.problems).toEqual([]);
    expect(result.dataset.tmps[0].out).toBe(3);
  });
  it("team: averages one value across the list, skipping No Data", () => {
    const { team } = runOn(
      (() => {
        const d = teamDataset([{}]);
        Object.assign(Object.values(d.teams)[0], {
          cycles: [{ time: 1 }, { time: null }, { time: 5 }],
        });
        return d;
      })(),
      { type: "team", name: "averageArray", options },
    );
    expect(team.out).toBe(3);
  });
  it("an empty list gives null, or ifNone: a team that never cycled can rank last", () => {
    const d = () => {
      const ds = teamDataset([{}]);
      Object.assign(Object.values(ds.teams)[0], { cycles: [] });
      return ds;
    };
    expect(runOn(d(), { type: "team", name: "averageArray", options }).team.out).toBeNull();
    expect(
      runOn(d(), { type: "team", name: "averageArray", options: { ...options, ifNone: 150000 } })
        .team.out,
    ).toBe(150000);
  });
});

describe("countMatches", () => {
  it("counts distinct matches, times the weight as given (v5 turned 0 into 1)", () => {
    const dataset = () => teamDataset([{}, {}, {}], [3, 3, 7]);
    expect(runOn(dataset(), { type: "team", name: "countMatches" }).team.out).toBe(2);
    expect(
      runOn(dataset(), { type: "team", name: "countMatches", options: { weight: 150000 } }).team
        .out,
    ).toBe(300000);
    expect(
      runOn(dataset(), { type: "team", name: "countMatches", options: { weight: 0 } }).team.out,
    ).toBe(0);
  });
});

describe("standardDeviation", () => {
  it("is the population standard deviation, skipping No Data", () => {
    expect(
      teamValue(
        [
          { s: 2 },
          { s: 4 },
          { s: 4 },
          { s: 4 },
          { s: 5 },
          { s: 5 },
          { s: 7 },
          { s: 9 },
          { s: null },
        ],
        {
          type: "team",
          name: "standardDeviation",
          options: { path: "s" },
        },
      ),
    ).toBe(2);
    expect(
      teamValue([{ s: null }], { type: "team", name: "standardDeviation", options: { path: "s" } }),
    ).toBeNull();
  });
});
