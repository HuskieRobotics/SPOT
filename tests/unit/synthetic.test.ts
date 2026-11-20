/**
 * T-4: the synthetic data generator. A new season's features have to be verified before any
 * real matches exist, so the generator has to produce data that obeys the configuration it was
 * given, and has to produce the same data twice from the same seed.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generate, toLegacyPerformance } from "@/generate/synthetic";
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
  it("repeats exactly for the same seed and differs for another", () => {
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
  it("produces identical datasets from the same seed", () => {
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

  it("writes documents that pass the schema", () => {
    for (const p of dataset.performances)
      expect(validateDocument("team-match-performance", p).issues).toEqual([]);
    expect(validateDocument("event", dataset.event).issues).toEqual([]);
    for (const s of dataset.scouters) expect(validateDocument("scouter", s).issues).toEqual([]);
  });

  it("only produces action ids the configuration can explain", () => {
    expect(dataset.report.unknownActionIds).toEqual([]);
  });

  it("keeps every timestamp inside the match and in order", () => {
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

  it("agrees with the clock about where each action happened", () => {
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

  it("records only buttons that exist and are of type action", () => {
    const actionIds = new Set(
      config.layout.layers.flatMap((l) =>
        l.buttons.filter((b) => b.type === "action").map((b) => b.id),
      ),
    );
    for (const p of dataset.performances)
      for (const a of p.actions) expect(actionIds.has(a.id)).toBe(true);
  });

  it("renders back to legacy composite ids the configuration knows", () => {
    const known = new Set(deriveKnownActionIds(config));
    for (const p of dataset.performances) {
      const legacy = toLegacyPerformance(config, p);
      expect(legacy.actionQueue).toHaveLength(p.actions.length);
      for (const a of legacy.actionQueue) expect(known.has(a.id)).toBe(true);
    }
  });

  it("gives every match a full lineup of distinct robots", () => {
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

  it("reaches every phase, including endgame", () => {
    expect(Object.keys(report.actionsByPhase).sort()).toEqual(
      ["(pre-match)", "auto", "endgame", "teleop"].sort(),
    );
    for (const phase of ["auto", "teleop", "endgame"]) {
      expect(report.actionsByPhase[phase]).toBeGreaterThan(0);
    }
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

describe("BL-308: B robots", () => {
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
  it("fields idle robots, which play at least every sixth match and record nothing", () => {
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

  it("waits for the next phase when nothing on screen can be pressed (2022's auto starts 10 ms in)", () => {
    const v1 = JSON.parse(
      readFileSync(join(process.cwd(), "config", "v1", "match-scouting-2022.json"), "utf8"),
    );
    const config = convertMatchScouting(v1, {}).config;
    const { report } = generate({ config, seed: "2022", matches: 4 });
    expect(Object.keys(report.actionsByPhase).sort()).toEqual(["auto", "teleop"]);
  });

  it("makes TBA responses from the configured known ids, with None for an idle robot", () => {
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
