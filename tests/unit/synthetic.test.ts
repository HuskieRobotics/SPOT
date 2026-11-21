/**
 * T-4: the synthetic data generator. A new season's features have to be verified before any
 * real matches exist, so the generator has to produce data that obeys the configuration it was
 * given, and has to produce the same data twice from the same seed.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generate, kindAt, legacyShiftNumbers, toLegacyPerformance } from "@/generate/synthetic";
import { migrate, type V5Performance } from "@/migrate/v5-to-v6";
import { generateTba } from "@/generate/synthetic-tba";
import { buildEnrichedDataset } from "@/analysis/enrichment/tba";
import { convertAnalysisPipeline, convertMatchScouting } from "@/config/convert/v1-to-v2";
import type { AnalysisPipelineConfig } from "@/config/types";
import { Random } from "@/generate/random";
import { deriveKnownActionIds } from "@/config/knownActionIds";
import { compositeActionId, placeAt } from "@/data/phase";
import { validateDocument } from "@/data/validate";
import type { MatchScoutingConfig } from "@/config/types";

const load = (...p: string[]) =>
  JSON.parse(readFileSync(join(process.cwd(), ...p), "utf8")) as MatchScoutingConfig;
const config2026 = load("config", "match-scouting.json");
const config2025 = load("config", "seasons", "2025", "match-scouting.json");

const run = (config: MatchScoutingConfig, seed = "test-seed", matches = 12) =>
  generate({ config, seed, matches });

describe("seeded randomness", () => {
  it("SY-1: repeats exactly for the same seed and differs for another", () => {
    const a = Array.from({ length: 8 }, () => new Random("alpha").next());
    const b = Array.from({ length: 8 }, () => new Random("alpha").next());
    expect(a).toEqual(b);
    expect(new Random("alpha").next()).not.toBe(new Random("beta").next());
  });

  it("stays inside its bounds", () => {
    const r = new Random(7);
    for (let i = 0; i < 500; i++) {
      const n = r.int(3, 9);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
    }
  });
});

describe("generated data is reproducible", () => {
  it("SY-1: produces identical datasets from the same seed", () => {
    expect(run(config2026)).toEqual(run(config2026));
  });

  it("produces different datasets from different seeds", () => {
    expect(run(config2026, "one")).not.toEqual(run(config2026, "two"));
  });
});

describe.each([
  ["2026", config2026],
  ["2025", config2025],
])("generated data obeys the %s configuration", (_name, config) => {
  const dataset = run(config, "shared-seed", 16);

  it("SY-2: writes documents that pass the schema", () => {
    for (const p of dataset.performances)
      expect(validateDocument("team-match-performance", p).issues).toEqual([]);
    expect(validateDocument("event", dataset.event).issues).toEqual([]);
    for (const s of dataset.scouters) expect(validateDocument("scouter", s).issues).toEqual([]);
  });

  it("SY-4: only produces action ids the configuration can explain", () => {
    expect(dataset.report.unknownActionIds).toEqual([]);
  });

  it("SY-5: keeps every timestamp inside the match and in order", () => {
    for (const p of dataset.performances) {
      let previous = Number.POSITIVE_INFINITY;
      for (const a of p.actions) {
        expect(a.ts).toBeGreaterThanOrEqual(0);
        expect(a.ts).toBeLessThanOrEqual(config.timing.totalMs);
        expect(a.ts).toBeLessThanOrEqual(previous);
        previous = a.ts;
      }
    }
  });

  it("SY-4: agrees with the clock about where each action happened", () => {
    for (const p of dataset.performances) {
      for (const a of p.actions) {
        const clock = placeAt(config, a.ts);
        // Pre-match actions are recorded before the clock starts, so they have no phase.
        if (a.phase === null) continue;
        expect(a.phase).toBe(clock.phase);
        expect(a.segment).toBe(clock.segment);
        expect(a.segmentIndex).toBe(clock.segmentIndex);
      }
    }
  });

  it("SY-3: records only buttons that exist and are of type action", () => {
    const actionIds = new Set(
      config.layout.layers.flatMap((l) =>
        l.buttons.filter((b) => b.type === "action").map((b) => b.id),
      ),
    );
    for (const p of dataset.performances)
      for (const a of p.actions) expect(actionIds.has(a.id)).toBe(true);
  });

  it("SY-4: renders back to legacy composite ids the configuration knows", () => {
    const known = new Set(deriveKnownActionIds(config));
    for (const p of dataset.performances) {
      const legacy = toLegacyPerformance(config, p);
      expect(legacy.actionQueue).toHaveLength(p.actions.length);
      for (const a of legacy.actionQueue) expect(known.has(a.id)).toBe(true);
    }
  });

  it("SY-6: gives every match a full lineup of distinct robots", () => {
    const byMatch = new Map<number, string[]>();
    for (const p of dataset.performances) {
      byMatch.set(p.matchNumber, [...(byMatch.get(p.matchNumber) ?? []), p.team]);
    }
    for (const robots of byMatch.values()) {
      expect(robots).toHaveLength(6);
      expect(new Set(robots).size).toBe(6);
    }
  });
});

describe("2026 coverage, since a fixture is only useful if it exercises the season", () => {
  const { report, performances } = run(config2026, "coverage", 40);
  const actions = performances.flatMap((p) => p.actions);

  it("SY-7: reaches every phase, including endgame", () => {
    expect(Object.keys(report.actionsByPhase).sort()).toEqual(
      ["(pre-match)", "auto", "endgame", "teleop"].sort(),
    );
    for (const phase of ["auto", "teleop", "endgame"]) {
      expect(report.actionsByPhase[phase]).toBeGreaterThan(0);
    }
  });

  it("SY-11 (#326): the selected kind alternates at the clock's shift boundaries", () => {
    // Without a later toggle press, a performance's shifts run active, inactive, active, ... or
    // the other way round from the slot the kind was selected in.
    let alternating = 0;
    let checked = 0;
    for (const p of performances) {
      const bySlot = new Map<number, Set<string>>();
      for (const a of p.actions) {
        if (a.segment !== "shift" || !a.segmentKind) continue;
        bySlot.set(a.segmentIndex!, (bySlot.get(a.segmentIndex!) ?? new Set()).add(a.segmentKind));
      }
      const slots = [...bySlot].sort((a, b) => a[0] - b[0]);
      if (slots.length < 2 || slots.some(([, k]) => k.size > 1)) continue;
      checked++;
      const [first, firstKinds] = slots[0];
      const start = [...firstKinds][0];
      const expected = (slot: number) =>
        (slot - first) % 2 === 0 ? start : start === "active" ? "inactive" : "active";
      if (slots.every(([slot, k]) => k.has(expected(slot)))) alternating++;
    }
    expect(checked).toBeGreaterThan(performances.length / 3);
    expect(alternating).toBe(checked);
  });

  it("SY-11 (#326): kindAt moves an alternating segment's kind on by one per repeat", () => {
    const shift = config2026.timing.phases[1].segments![1];
    expect([1, 2, 3, 4].map((i) => kindAt(shift, { kind: "active", index: 1 }, i))).toEqual([
      "active",
      "inactive",
      "active",
      "inactive",
    ]);
    // A press in slot 3 overrides from there on.
    expect([3, 4].map((i) => kindAt(shift, { kind: "active", index: 3 }, i))).toEqual([
      "active",
      "inactive",
    ]);
    expect(kindAt(shift, undefined, 2)).toBeNull();
    expect(kindAt({ ...shift, alternate: false }, { kind: "active", index: 1 }, 4)).toBe("active");
  });

  it("SY-11 (#326): the legacy export numbers a kind's shifts as v5 did, and migrates back exactly", () => {
    const act = (id: string, kind: string | null, slot: number) => ({
      id,
      ts: 130000 - (slot - 1) * 25000 - 1000,
      phase: "teleop",
      segment: "shift",
      segmentKind: kind,
      segmentIndex: slot,
    });
    // Selected inactive in slot 2 after an action with no kind; slot 4 has no actions.
    const actions = [
      act("Passing", null, 1),
      act("Passing", "inactive", 2),
      act("Storing", "active", 3),
    ];
    expect(legacyShiftNumbers(config2026, actions)).toEqual([1, 1, 1]);
    // Selected in slot 1 with no action there: slot 1 still counts as the first active shift.
    expect(
      legacyShiftNumbers(config2026, [act("Passing", "inactive", 2), act("Storing", "active", 3)]),
    ).toEqual([1, 2]);
    // The whole generated event survives the round trip through v5 ids.
    const legacy = performances.map((p) => toLegacyPerformance(config2026, p));
    const back = migrate(
      { performances: legacy as unknown as V5Performance[], events: [] },
      { config: config2026, now: 0 },
    );
    back.performances.forEach((p, i) => {
      // An action before any kind was selected had no prefix of its own in v5 (`teleop…`), so
      // it comes back without its segment; every other action keeps its kind and clock slot.
      expect(p.actions.map((a) => [a.segmentKind, a.segmentIndex])).toEqual(
        performances[i].actions.map((a) => [a.segmentKind, a.segmentKind ? a.segmentIndex : null]),
      );
    });
  });

  it("uses both shift kinds and every shift index", () => {
    const kinds = new Set(actions.map((a) => a.segmentKind).filter(Boolean));
    expect(kinds).toEqual(new Set(["active", "inactive"]));
    const indexes = new Set(
      actions.filter((a) => a.segment === "shift").map((a) => a.segmentIndex),
    );
    expect(indexes).toEqual(new Set([1, 2, 3, 4]));
  });

  it("captures field positions where the configuration asks for them", () => {
    expect(actions.filter((a) => a.other?.pos).length).toBeGreaterThan(0);
  });

  it("covers a large share of the ids the configuration can produce", () => {
    const produced = new Set(actions.map((a) => compositeActionId(config2026, a.id, a)));
    const known = deriveKnownActionIds(config2026);
    expect(produced.size / known.length).toBeGreaterThan(0.5);
  });
});

describe("2025 coverage, a season with no segments and no prefixes", () => {
  const { report, performances } = run(config2025, "coverage", 20);

  it("reaches both phases and never invents a segment", () => {
    expect(report.actionsByPhase.auto).toBeGreaterThan(0);
    expect(report.actionsByPhase.teleop).toBeGreaterThan(0);
    expect(performances.flatMap((p) => p.actions).every((a) => a.segment === null)).toBe(true);
  });

  it("adds no prefix, because 2025 configures none", () => {
    // 2025 wrote the period into the button id by hand ("autoCoralDrop"), so the legacy id is
    // the button id unchanged. Nothing may be prepended to it.
    for (const p of performances) {
      const legacy = toLegacyPerformance(config2025, p);
      expect(legacy.actionQueue.map((a) => a.id)).toEqual(p.actions.map((a) => a.id));
    }
  });
});

describe("SY-6, BL-308: B robots", () => {
  const config = config2026;
  const dataset = generate({ config, seed: "b-teams", matches: 40, bTeams: 4 });

  it("fields suffixed robots that validate as team keys", () => {
    const teams = new Set(dataset.performances.map((p) => p.team));
    expect([...teams].some((t) => t.endsWith("B"))).toBe(true);
    for (const p of dataset.performances) {
      expect(validateDocument("team-match-performance", p).issues).toEqual([]);
    }
  });

  it("refuses to render a B robot in the v5 shape, which cannot store one", () => {
    const b = dataset.performances.find((p) => p.team.endsWith("B"))!;
    expect(() => toLegacyPerformance(config, b)).toThrow(/BL-308/);
  });
});

describe("#317: what config:check needs from the generator", () => {
  it("SY-8: fields idle robots, which play at least every sixth match and record nothing", () => {
    const { performances } = generate({
      config: config2025,
      seed: "idle",
      matches: 30,
      idleTeams: ["9999"],
    });
    const idle = performances.filter((p) => p.team === "9999");
    const matches = new Set(idle.map((p) => p.matchNumber));
    for (let m = 1; m <= 30; m += 6) expect(matches.has(m)).toBe(true);
    expect(idle.every((p) => p.actions.length === 0)).toBe(true);
    expect(performances.filter((p) => p.team !== "9999").every((p) => p.actions.length > 0)).toBe(
      true,
    );
  });

  it("SY-9: waits for the next phase when nothing on screen can be pressed (2022's auto starts 10 ms in)", () => {
    const v1 = JSON.parse(
      readFileSync(join(process.cwd(), "config", "v1", "match-scouting-2022.json"), "utf8"),
    );
    const config = convertMatchScouting(v1, {}).config;
    const { report } = generate({ config, seed: "2022", matches: 4 });
    expect(Object.keys(report.actionsByPhase).sort()).toEqual(["auto", "teleop"]);
  });

  it("SY-10: makes TBA responses from the configured known ids, with None for an idle robot", () => {
    const v1 = JSON.parse(
      readFileSync(join(process.cwd(), "config", "v1", "analysis-pipeline.json"), "utf8"),
    );
    const v1ms = JSON.parse(
      readFileSync(join(process.cwd(), "config", "v1", "match-scouting.json"), "utf8"),
    );
    const pipeline: AnalysisPipelineConfig = convertAnalysisPipeline(v1, {
      matchScouting: v1ms,
      oprStrings: ["Hub Total Fuel Count"],
    }).config;
    const enrichment = pipeline.enrichment.tba;
    const { performances } = generate({
      config: config2026,
      seed: "tba",
      matches: 12,
      idleTeams: ["9999"],
    });
    const tba = generateTba(performances, { enrichment, seed: "tba", idleTeams: ["9999"] });
    expect(tba.matches).toHaveLength(12);
    expect(Object.keys(tba.matches[0].score_breakdown!.red).sort()).toEqual([
      "autoTowerRobot1",
      "autoTowerRobot2",
      "autoTowerRobot3",
      "endGameTowerRobot1",
      "endGameTowerRobot2",
      "endGameTowerRobot3",
    ]);
    expect(tba.coprs["Hub Total Fuel Count"].frc9999).toBe(0);

    const dataset = buildEnrichedDataset(performances, enrichment, tba);
    const added = dataset.tmps.flatMap((t) =>
      t.actions.filter((a) => a.id.startsWith("endGameTowerRobot_")).map((a) => [t.team, a]),
    );
    const ids = new Set(added.map(([, a]) => (a as { id: string }).id));
    expect([...ids].sort()).toEqual([
      "endGameTowerRobot_Level1",
      "endGameTowerRobot_Level2",
      "endGameTowerRobot_Level3",
      "endGameTowerRobot_None",
    ]);
    for (const [team, a] of added) {
      expect((a as { phase: string }).phase).toBe("endgame");
      if (team === "9999") expect((a as { id: string }).id).toBe("endGameTowerRobot_None");
    }
  });
});
