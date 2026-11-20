/**
 * Action-sequence transformers and re-scouts (#314, docs/spec/09 TR-5, TR-6, TR-13, T-2).
 * Oracle agreement for 2025 `cycle` is in the ratchet (oracle-compare.test.ts); the 2026 checks
 * below run the transformers over the real 2026 export with v5's own id lists.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDataset, runPipeline } from "@/analysis/engine";
import { createRegistry } from "@/analysis/transformers";
import {
  actionTime,
  cycle,
  zoneActionRatingGroupings,
} from "@/analysis/transformers/actionSequence";
import { generate } from "@/generate/synthetic";
import { convertAnalysisPipeline, legacyRatingValues } from "@/config/convert/v1-to-v2";
import type { AnalysisPipelineConfig, MatchScoutingConfig, PipelineEntry } from "@/config/types";
import type { Action, TeamMatchPerformance } from "@/data/types";

const read = (...p: string[]) => JSON.parse(readFileSync(join(process.cwd(), ...p), "utf8"));
const config = read("config", "seasons", "2025", "match-scouting.json") as MatchScoutingConfig;
const [base] = generate({ config, seed: "sequence", matches: 1, robotsPerMatch: 1 }).performances;
const registry = createRegistry();

/** An action; `ts` counts down (time remaining, DM-3). */
const act = (id: string, ts: number, phase = "teleop", more: Partial<Action> = {}): Action => ({
  id,
  ts,
  phase,
  segment: null,
  segmentKind: null,
  segmentIndex: null,
  ...more,
});

const performance = (
  actions: Action[],
  more: Partial<TeamMatchPerformance> = {},
): TeamMatchPerformance => ({ ...base, actions, ...more });

function runOn(actions: Action[], entries: Omit<PipelineEntry, "type">[]) {
  const result = runPipeline(
    buildDataset([performance(actions)]),
    entries.map((e) => ({ type: "tmp", ...e }) as PipelineEntry),
    { registry, context: { config } },
  );
  return { result, tmp: result.dataset.tmps[0] as Record<string, unknown> };
}
const out = (actions: Action[], name: string, options: Record<string, unknown>) => {
  const { result, tmp } = runOn(actions, [{ name, outputPath: "out", options }]);
  expect(result.problems).toEqual([]);
  return tmp.out;
};

describe("TR-5: re-scouts (RT-14a, decided 2026-11-20)", () => {
  const first = performance([], { _id: "a".repeat(24), matchNumber: 4, superseded: true });
  const rescout = performance([], { _id: "b".repeat(24), matchNumber: 4, submittedAt: 9e12 });
  it("analysis never sees a superseded performance", () => {
    expect(buildDataset([first, rescout]).tmps.map((t) => t._id)).toEqual([rescout._id]);
  });
  it("the oracle can keep them, to reproduce v4.2.0", () => {
    expect(buildDataset([first, rescout], { includeSuperseded: true }).tmps).toHaveLength(2);
  });
  it("a pipeline that still has removeDuplicates is told why it is gone", () => {
    const { result } = runOn([], [{ name: "removeDuplicates", outputPath: "matches" }]);
    expect(result.problems[0].message).toMatch(
      /^There is no tmp transformer named "removeDuplicates"\. It is no longer needed/,
    );
  });
});

describe("TR-6: a team's performances are in match order", () => {
  it("orders by match, then submission time, then id", () => {
    const p = (id: string, matchNumber: number, submittedAt: number) =>
      performance([], { _id: id.repeat(24), matchNumber, submittedAt });
    // Match 2 was scouted from video weeks later; it still comes before match 7.
    const dataset = buildDataset([p("a", 7, 100), p("b", 2, 900), p("d", 7, 50), p("c", 7, 50)]);
    expect(dataset.tmps.map((t) => t._id[0])).toEqual(["b", "c", "d", "a"]);
  });
});

describe("actionTime", () => {
  const actions = [act("leave", 150000, "auto"), act("climb", 20000), act("climb", 10000)];
  it("is the time remaining at the first matching action, else default (null)", () => {
    expect(out(actions, "actionTime", { actionId: "climb" })).toBe(20000);
    expect(out(actions, "actionTime", { actionId: ["nope", "leave"] })).toBe(150000);
    expect(out(actions, "actionTime", { actionId: "nope" })).toBeNull();
    expect(out(actions, "actionTime", { actionId: "nope", default: 0 })).toBe(0);
  });
  it("takes period filters", () => {
    expect(out(actions, "actionTime", { actionId: "leave", phases: ["teleop"] })).toBeNull();
  });
});

describe("actionTimeFilter", () => {
  const actions = [act("a", 152000, "auto"), act("b", 135000), act("c", 0)];
  it("keeps actions within the time range, inclusive, as copies", () => {
    const kept = out(actions, "actionTimeFilter", { timeMin: 135000 }) as Action[];
    expect(kept.map((a) => a.id)).toEqual(["a", "b"]);
    expect(Object.isFrozen(kept[0])).toBe(false);
    expect((out(actions, "actionTimeFilter", {}) as Action[]).map((a) => a.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("uses a timeMax of 0 as given (v5 read 0 as not set)", () => {
    expect((out(actions, "actionTimeFilter", { timeMax: 0 }) as Action[]).map((a) => a.id)).toEqual(
      ["c"],
    );
  });
});

describe("finalActionOccurrence", () => {
  const actions = [act("park", 9000), act("onstage", 5000), act("park", 2000), act("x", 1000)];
  it("F-3: finds the last match without changing the stored actions", () => {
    const { result, tmp } = runOn(actions, [
      { name: "finalActionOccurrence", outputPath: "a", options: { ids: ["onstage"] } },
      { name: "finalActionOccurrence", outputPath: "b", options: { ids: ["onstage", "park"] } },
    ]);
    expect(result.problems).toEqual([]);
    expect(tmp.a).toMatchObject({ id: "onstage", ts: 5000 });
    // v5 reversed the list in place, so a second entry found the first occurrence instead.
    expect(tmp.b).toMatchObject({ id: "park", ts: 2000 });
    expect((tmp.actions as Action[]).map((a) => a.ts)).toEqual([9000, 5000, 2000, 1000]);
  });
  it("default when none, and another list of actions by path", () => {
    expect(out(actions, "finalActionOccurrence", { ids: ["deep"] })).toBeNull();
    expect(
      out(actions, "finalActionOccurrence", { ids: ["deep"], default: { id: "noStage" } }),
    ).toEqual({ id: "noStage" });
    const { tmp } = runOn(actions, [
      { name: "actionTimeFilter", outputPath: "early", options: { timeMin: 4000 } },
      {
        name: "finalActionOccurrence",
        outputPath: "out",
        options: { ids: ["park"], actionArrayPath: "early" },
      },
    ]);
    expect(tmp.out).toMatchObject({ id: "park", ts: 9000 });
  });
});

describe("cycle (A-38 pairing)", () => {
  const options = { startAction: ["pickup"], endAction: ["score"], misses: ["miss"] };
  const times = (c: unknown, key = "all") =>
    ((c as Record<string, { timeDifferential: number }[]>)[key] ?? []).map(
      (x) => x.timeDifferential,
    );

  it("pairs each start with the first unused end after it", () => {
    const c = out(
      [act("score", 140000), act("pickup", 130000), act("score", 127000), act("pickup", 120000)],
      "cycle",
      options,
    ) as Record<string, unknown>;
    // The end before any start is never used; the last start has no end after it.
    expect(times(c)).toEqual([3000]);
    expect(c).toMatchObject({ averageTime: 3000, cycleCount: 1, cycleCountComplete: 1 });
    expect(c.all).toEqual([
      {
        starts: act("pickup", 130000),
        ending: act("score", 127000),
        timeDifferential: 3000,
      },
    ]);
  });

  it("two starts before one end: the second waits for the next end", () => {
    const c = out(
      [act("pickup", 100), act("pickup", 90), act("score", 80), act("score", 50)],
      "cycle",
      options,
    );
    expect(times(c)).toEqual([20, 40]);
  });

  it("a miss ends a cycle but is left out of allComplete", () => {
    const c = out(
      [act("pickup", 100), act("miss", 90), act("pickup", 80), act("score", 60)],
      "cycle",
      options,
    ) as Record<string, unknown>;
    expect(times(c)).toEqual([10, 20]);
    expect(times(c, "allComplete")).toEqual([20]);
    expect(c).toMatchObject({ averageTime: 15, averageTimeComplete: 20, cycleCountComplete: 1 });
  });

  it("no cycles: empty lists, counts 0, averages null (v5: NaN)", () => {
    expect(out([act("pickup", 100)], "cycle", options)).toEqual({
      all: [],
      allComplete: [],
      averageTime: null,
      averageTimeComplete: null,
      cycleCount: 0,
      cycleCountComplete: 0,
    });
  });

  it("period filters apply to starts and ends alike", () => {
    const actions = [
      act("pickup", 150000, "auto"),
      act("score", 140000, "teleop"),
      act("pickup", 130000, "teleop"),
      act("score", 125000, "teleop"),
    ];
    expect(times(out(actions, "cycle", { ...options, phases: ["teleop"] }))).toEqual([5000]);
    expect(times(out(actions, "cycle", { ...options, phases: ["auto"] }))).toEqual([]);
  });
});

describe("countHybrid", () => {
  const options = { pickup: ["cone", "cube"], hybrid: ["low"] };
  it("counts placements under the piece last picked up; a preload is not counted", () => {
    expect(
      out(
        [act("low", 150), act("cone", 140), act("low", 130), act("low", 120), act("cube", 110)],
        "countHybrid",
        options,
      ),
    ).toEqual({ cone: 2, cube: 0 });
  });
});

describe("zoneActionRatingGroupings", () => {
  const options = {
    zones: ["AZone", "NeutralZone"],
    actions: ["Passing", "Defense"],
    ratings: { RatingPassing2: 2, RatingPassing4: 4, RatingDefense1: 1 },
  };
  it("groups zone, action and rating, and averages ratings per zone and action", () => {
    const actions = [
      act("AZone", 100),
      act("Passing", 95),
      act("RatingPassing2", 90),
      act("NeutralZone", 80),
      act("Defense", 75),
      act("RatingDefense1", 70),
      act("AZone", 60),
      act("Passing", 55),
      act("RatingPassing4", 50),
      act("NeutralZone", 40), // no action after it: the walk stops
    ];
    expect(out(actions, "zoneActionRatingGroupings", options)).toEqual({
      list: [
        { zone: "AZone", action: "Passing", rating: 2 },
        { zone: "NeutralZone", action: "Defense", rating: 1 },
        { zone: "AZone", action: "Passing", rating: 4 },
      ],
      counts: { AZone: { Passing: { 2: 1, 4: 1 } }, NeutralZone: { Defense: { 1: 1 } } },
      AZone: { Passing: 3 },
      NeutralZone: { Defense: 1 },
    });
  });

  it("ratings are an explicit map; a zone cannot be named list or counts", () => {
    const { result } = runOn(
      [],
      [
        {
          name: "zoneActionRatingGroupings",
          outputPath: "a",
          options: { ...options, ratings: ["RatingPassing2"] },
        },
        {
          name: "zoneActionRatingGroupings",
          outputPath: "b",
          options: { ...options, zones: ["list"] },
        },
      ],
    );
    expect(result.problems.map((p) => p.message)).toEqual([
      "Invalid options: options.ratings: must be object",
      'a zone cannot be named "list": that key holds other output',
    ]);
  });
});

describe("converter (#314)", () => {
  it("drops removeDuplicates and the no-op team countHybrid; writes rating values out", () => {
    const { config: converted, warnings } = convertAnalysisPipeline([
      { type: "tmp", name: "removeDuplicates", outputPath: "matches" },
      { type: "team", name: "countHybrid", outputPath: "x", options: {} },
      {
        type: "tmp",
        name: "zoneActionRatingGroupings",
        outputPath: "z",
        options: {
          zones: ["AZone"],
          actions: ["Passing"],
          ratings: ["activeShift1RatingPassing3"],
        },
      },
      { type: "tmp", name: "actionTimeFilter", outputPath: "f", options: { default: [] } },
    ]);
    expect(converted.pipeline).toEqual([
      {
        type: "tmp",
        name: "zoneActionRatingGroupings",
        outputPath: "z",
        options: {
          zones: ["AZone"],
          actions: ["Passing"],
          ratings: { activeShift1RatingPassing3: 3 },
        },
      },
      { type: "tmp", name: "actionTimeFilter", outputPath: "f" },
    ]);
    expect(warnings).toHaveLength(4);
    expect(legacyRatingValues(["RatingDefense12", "noDigits"])).toEqual({
      ratings: { RatingDefense12: 12 },
      unread: ["noDigits"],
    });
  });
});

/**
 * The real 2026 export, run with v5's own id lists from the converted configuration over v5's
 * own action lists (composite ids), compared with the golden output. This checks the
 * transformers' logic on 413 real performances; translating the ids to v6's button ids and
 * periods is #320.
 */
describe("2026 export with v5's id lists", () => {
  const golden = read("tools", "oracle", "golden", "2026mnwi_official-v5", "tmps.json") as {
    actionQueue: Action[];
    [path: string]: unknown;
  }[];
  const pipeline = (read("config", "analysis-pipeline.json") as AnalysisPipelineConfig).pipeline;
  const context = { config: read("config", "match-scouting.json") as MatchScoutingConfig };
  const nanToNull = (v: unknown) =>
    JSON.parse(JSON.stringify(v), (_k, x) => (x === "__NaN__" ? null : x)) as unknown;
  const entries = (name: string) => pipeline.filter((e) => e.name === name);
  const at = (o: Record<string, unknown>, path: string) =>
    path.split(".").reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], o);

  it("cycle: every cycle, count and average agrees", () => {
    expect(entries("cycle")).toHaveLength(5);
    for (const entry of entries("cycle")) {
      for (const tmp of golden) {
        const mine = cycle.run(
          { actions: tmp.actionQueue } as never,
          entry.options as never,
          context,
        );
        expect(mine).toEqual(nanToNull(at(tmp, entry.outputPath)));
      }
    }
  });

  it("actionTime: agrees (v5's id never occurs, so every value is null; #320)", () => {
    const [entry] = entries("actionTime");
    for (const tmp of golden) {
      expect(
        actionTime.run({ actions: tmp.actionQueue } as never, entry.options as never, context),
      ).toBe(at(tmp, entry.outputPath));
    }
  });

  it("zoneActionRatingGroupings: triples, counts and averages agree", () => {
    const [entry] = entries("zoneActionRatingGroupings");
    const o = entry.options as { zones: string[]; actions: string[]; ratings: object };
    // v5 also reduced each listed composite id to its zone or action name; with button ids
    // (CS-16) there is nothing to reduce, so do the same to the input here.
    const zone = (id: string) => id.match(/(AZone|NeutralZone|OAZone)$/)![1];
    const action = (id: string) => id.match(/(Defense|Passing|StopShooting|Storing)$/)![1];
    const options = {
      zones: [...new Set(o.zones.map(zone))],
      actions: [...new Set(o.actions.map(action))],
      ratings: o.ratings,
    };
    let triples = 0;
    for (const tmp of golden) {
      const actions = tmp.actionQueue.map((a) => ({
        ...a,
        id: o.zones.includes(a.id) ? zone(a.id) : o.actions.includes(a.id) ? action(a.id) : a.id,
      }));
      const mine = zoneActionRatingGroupings.run({ actions } as never, options as never, context);
      expect(mine).toEqual(at(tmp, entry.outputPath));
      triples += (mine as { list: unknown[] }).list.length;
    }
    expect(triples).toBeGreaterThan(500);
  });
});
