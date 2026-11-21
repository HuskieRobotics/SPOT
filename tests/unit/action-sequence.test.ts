/**
 * Action-sequence transformers and re-scouts (#314, docs/spec/09 TR-5, TR-6, TR-13, T-2).
 * Oracle agreement for 2025 `cycle` is in the ratchet (oracle-compare.test.ts); the 2026 checks
 * below run the transformers over the real 2026 export with v5's own id lists.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { buildDataset, runPipeline } from "@/analysis/engine";
import { createRegistry } from "@/analysis/transformers";
import {
  actionTime,
  cycle,
  zoneActionRatingGroupings,
} from "@/analysis/transformers/actionSequence";
import { generate } from "@/generate/synthetic";
import { convertAnalysisPipeline, legacyRatingValues } from "@/config/convert/v1-to-v2";
import type { MatchScoutingConfig, PipelineEntry } from "@/config/types";
import type { Action, TeamMatchPerformance } from "@/data/types";

const read = (...p: string[]) => JSON.parse(readFileSync(join(process.cwd(), ...p), "utf8"));
const config = read("config", "seasons", "2025", "match-scouting.json") as MatchScoutingConfig;
const [base] = generate({ config, seed: "sequence", matches: 1, robotsPerMatch: 1 }).performances;
const registry = createRegistry();
// Measured on the 2026 export (#320): see the 2026 tests at the end.
const UNENDED_2026 = 177;
const ZONES_2026 = { mine: 1843, legacy: 1321, same: 120 };

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

describe("cycle: pairing without a queue (decided 2026-11-21, F-28)", () => {
  const options = { startAction: ["pickup"], endAction: ["score"], misses: ["miss"] };
  const times = (c: unknown, key = "all") =>
    ((c as Record<string, { timeDifferential: number }[]>)[key] ?? []).map(
      (x) => x.timeDifferential,
    );

  it("pairs each end with the open start before it", () => {
    const c = out(
      [act("score", 140000), act("pickup", 130000), act("score", 127000), act("pickup", 120000)],
      "cycle",
      options,
    ) as Record<string, unknown>;
    // The end before any start is not used; the last start never got an end.
    expect(times(c)).toEqual([3000]);
    expect(c).toMatchObject({
      averageTime: 3000,
      cycleCount: 1,
      cycleCountComplete: 1,
      unendedCount: 1,
    });
    expect(c.all).toEqual([
      {
        starts: act("pickup", 130000),
        ending: act("score", 127000),
        timeDifferential: 3000,
      },
    ]);
  });

  it("two starts before one end: the newer is timed, the older never got an end", () => {
    const c = out(
      [act("pickup", 100), act("pickup", 90), act("score", 80), act("score", 50)],
      "cycle",
      options,
    );
    expect(times(c)).toEqual([10]);
    expect(c).toMatchObject({ unendedCount: 1 });
  });

  it("a start left without an end does not shift the later cycles", () => {
    // A drop nobody recorded at 100: every later cycle is 5 s. v5 paired each start with the
    // first unused end after it, which gave 15 s for every cycle after the drop.
    const actions = [
      act("pickup", 100),
      act("pickup", 90),
      act("score", 85),
      act("pickup", 80),
      act("score", 75),
      act("pickup", 70),
      act("score", 65),
    ];
    for (const capacity of [1, 2]) {
      const c = out(actions, "cycle", { ...options, capacity });
      expect(times(c)).toEqual([5, 5, 5]);
      expect(c).toMatchObject({ unendedCount: 1 });
    }
  });

  it("capacity: a robot holding two pieces; each end pairs with the newest open start", () => {
    const actions = [act("pickup", 100), act("pickup", 90), act("score", 80), act("score", 50)];
    const c = out(actions, "cycle", { ...options, capacity: 2 });
    // Which piece scored first can't be known; the average is the same either way: (10+50)/2.
    expect(times(c)).toEqual([10, 50]);
    expect(c).toMatchObject({ averageTime: 30, unendedCount: 0 });
    // A third start while two are open drops the oldest.
    const full = out(
      [act("pickup", 100), ...actions.map((a) => ({ ...a, ts: a.ts - 5 }))],
      "cycle",
      {
        ...options,
        capacity: 2,
      },
    );
    expect(times(full)).toEqual([10, 50]);
    expect(full).toMatchObject({ unendedCount: 1 });
  });

  it("an end at the same time as its start does not pair (as in v5)", () => {
    // 2025: a scouter recorded the climb and its result after the clock ran out.
    expect(out([act("pickup", 0), act("score", 0)], "cycle", options)).toMatchObject({
      cycleCount: 0,
      unendedCount: 1,
    });
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
      unendedCount: 1,
    });
  });

  it("pairs over the whole match, then a filter keeps cycles that start or end in the period", () => {
    // 2026: shooting that starts before the hub activates, a stop pressed just after it
    // deactivates, and shooting wholly inside an inactive shift.
    const shift = (kind: string, segmentIndex: number) => ({
      segment: "shift",
      segmentKind: kind,
      segmentIndex,
    });
    const actions = [
      act("pickup", 108000, "teleop", shift("inactive", 1)),
      act("score", 103000, "teleop", shift("active", 2)),
      act("pickup", 84000, "teleop", shift("active", 2)),
      act("score", 78000, "teleop", shift("inactive", 3)),
      act("pickup", 70000, "teleop", shift("inactive", 3)),
      act("score", 66000, "teleop", shift("inactive", 3)),
      act("pickup", 50000, "teleop", shift("active", 4)),
      act("score", 45000, "teleop", shift("active", 4)),
    ];
    expect(times(out(actions, "cycle", { ...options, kinds: ["active"] }))).toEqual([
      5000, 6000, 5000,
    ]);
    // Filtering first would have paired the start at 84000 with the stop at 45000 (39 s).
    expect(times(out(actions, "cycle", { ...options, kinds: ["inactive"] }))).toEqual([
      5000, 6000, 4000,
    ]);
    expect(times(out(actions, "cycle", options))).toEqual([5000, 6000, 4000, 5000]);
    // A start that never got an end counts in its own period.
    const unended = [...actions, act("pickup", 30000, "endgame")];
    expect(out(unended, "cycle", { ...options, phases: ["endgame"] })).toMatchObject({
      unendedCount: 1,
    });
    expect(out(unended, "cycle", { ...options, kinds: ["active"] })).toMatchObject({
      unendedCount: 0,
    });
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
  it("a filter counts a placement when it or its pickup is in the period", () => {
    const actions = [act("cone", 150, "auto"), act("low", 140, "teleop"), act("low", 130)];
    expect(out(actions, "countHybrid", { ...options, phases: ["auto"] })).toEqual({
      cone: 2,
      cube: 0,
    });
    expect(
      out([act("cube", 150, "auto"), act("low", 140, "auto"), act("low", 130)], "countHybrid", {
        ...options,
        phases: ["teleop"],
      }),
    ).toEqual({ cone: 0, cube: 1 });
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
      act("NeutralZone", 40), // nothing after it
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

  it("a zone holds until the next zone press; an unrated action shifts nothing (F-28)", () => {
    const actions = [
      act("Passing", 110), // before any zone press: zone unknown, left out
      act("RatingPassing2", 108),
      act("AZone", 100),
      act("Passing", 95), // never rated
      act("Defense", 75),
      act("RatingDefense1", 70),
      act("Passing", 65),
      act("RatingPassing4", 60),
      act("NeutralZone", 50),
      act("Passing", 45),
      act("RatingPassing2", 40),
    ];
    // v5 gave each zone press one action, the first unused after it: AZone/Passing/1, and the
    // rest shifted.
    expect(out(actions, "zoneActionRatingGroupings", options)).toEqual({
      list: [
        { zone: "AZone", action: "Defense", rating: 1 },
        { zone: "AZone", action: "Passing", rating: 4 },
        { zone: "NeutralZone", action: "Passing", rating: 2 },
      ],
      counts: {
        AZone: { Defense: { 1: 1 }, Passing: { 4: 1 } },
        NeutralZone: { Passing: { 2: 1 } },
      },
      AZone: { Defense: 1, Passing: 4 },
      NeutralZone: { Passing: 2 },
    });
  });

  it("a filter keeps the triples whose action or rating is in the period", () => {
    const actions = [
      act("AZone", 100, "teleop"),
      act("Passing", 95, "teleop"),
      act("RatingPassing2", 90, "endgame"),
      act("NeutralZone", 80, "endgame"),
      act("Defense", 75, "endgame"),
      act("RatingDefense1", 70, "endgame"),
    ];
    const triples = (phases: string[]) =>
      (out(actions, "zoneActionRatingGroupings", { ...options, phases }) as { list: unknown[] })
        .list;
    expect(triples(["teleop"])).toEqual([{ zone: "AZone", action: "Passing", rating: 2 }]);
    expect(triples(["endgame"])).toHaveLength(2);
    // The zone is where the robot is, not an event: pressed in teleop, it holds in endgame.
    const held = [
      act("AZone", 100, "teleop"),
      act("Defense", 25, "endgame"),
      act("RatingDefense1", 20, "endgame"),
    ];
    const kept = (phases: string[]) =>
      (out(held, "zoneActionRatingGroupings", { ...options, phases }) as { list: unknown[] }).list;
    expect(kept(["teleop"])).toEqual([]);
    expect(kept(["endgame"])).toEqual([{ zone: "AZone", action: "Defense", rating: 1 }]);
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
    expect(warnings.filter((w) => w.startsWith("pipeline["))).toHaveLength(4);
    expect(legacyRatingValues(["RatingDefense12", "noDigits"])).toEqual({
      ratings: { RatingDefense12: 12 },
      unread: ["noDigits"],
    });
  });
});

/**
 * The real 2026 export, run with v5's own id lists (the v1 pipeline converted without the native
 * rewrite, #320) over v5's own action lists (composite ids), compared with the golden output.
 * This checks the transformers' logic on 413 real performances. Pairing differs from v5 on
 * purpose where an action was left without its end (F-28); everywhere else it agrees.
 */
describe("2026 export with v5's id lists", () => {
  const golden = read("tools", "oracle", "golden", "2026mnwi_official-v5", "tmps.json") as {
    actionQueue: Action[];
    [path: string]: unknown;
  }[];
  const { pipeline } = convertAnalysisPipeline(read("config", "v1", "analysis-pipeline.json"), {
    matchScouting: read("config", "v1", "match-scouting.json"),
    native: false,
  }).config;
  const context = { config: read("config", "match-scouting.json") as MatchScoutingConfig };
  const nanToNull = (v: unknown) =>
    JSON.parse(JSON.stringify(v), (_k, x) => (x === "__NaN__" ? null : x)) as unknown;
  const entries = (name: string) => pipeline.filter((e) => e.name === name);
  const at = (o: Record<string, unknown>, path: string) =>
    path.split(".").reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], o);

  it("cycle: agrees wherever every start got its end (F-28 elsewhere)", () => {
    expect(entries("cycle")).toHaveLength(5);
    let unended = 0;
    for (const entry of entries("cycle")) {
      for (const tmp of golden) {
        const { unendedCount, ...mine } = cycle.run(
          { actions: tmp.actionQueue } as never,
          entry.options as never,
          context,
        ) as { unendedCount: number };
        if (unendedCount === 0) expect(mine).toEqual(nanToNull(at(tmp, entry.outputPath)));
        else unended++;
      }
    }
    // Performance-entry pairs with a start left without an end; they are compared through the
    // native configuration in the oracle (oracle-compare.test.ts).
    expect(unended).toBe(UNENDED_2026);
  });

  it("actionTime: agrees (v5's id never occurs, so every value is null; #320)", () => {
    const [entry] = entries("actionTime");
    for (const tmp of golden) {
      expect(
        actionTime.run({ actions: tmp.actionQueue } as never, entry.options as never, context),
      ).toBe(at(tmp, entry.outputPath));
    }
  });

  it("zoneActionRatingGroupings: each action rated in a zone counts, not one per zone press", () => {
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
    let mine = 0;
    let legacy = 0;
    let same = 0;
    for (const tmp of golden) {
      const actions = tmp.actionQueue.map((a) => ({
        ...a,
        id: o.zones.includes(a.id) ? zone(a.id) : o.actions.includes(a.id) ? action(a.id) : a.id,
      }));
      const result = zoneActionRatingGroupings.run({ actions } as never, options as never, context);
      const v5 = at(tmp, entry.outputPath) as { list: unknown[] };
      mine += (result as { list: unknown[] }).list.length;
      legacy += v5.list.length;
      if (isDeepStrictEqual(result, v5)) same++;
    }
    // v5 paired each zone press with one action; scouters pressed a zone when the robot moved
    // and rated several actions there (decided 2026-11-21).
    expect({ mine, legacy, same }).toEqual(ZONES_2026);
  });
});
