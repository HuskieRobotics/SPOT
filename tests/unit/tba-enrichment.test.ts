/**
 * TBA enrichment (#315; docs/spec/03 DM-11, DM-13; docs/spec/08 AN-7, AN-9; CS-12; T-2), and the
 * rule that analysis code fetches nothing and runs in the browser (ADR 0005).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { runPipeline } from "@/analysis/engine";
import {
  allianceSlot,
  attachComponentOprs,
  buildEnrichedDataset,
  eventScoreBreakdownIds,
  scoreBreakdownActions,
  type TbaEnrichment,
  type TbaMatch,
} from "@/analysis/enrichment/tba";
import { createRegistry } from "@/analysis/transformers";
import { generate } from "@/generate/synthetic";
import { convertAnalysisPipeline } from "@/config/convert/v1-to-v2";
import type { MatchScoutingConfig } from "@/config/types";
import type { TeamMatchPerformance } from "@/data/types";
import { compareGoldenSet } from "../../tools/oracle/compare";
import { goldenSets } from "../../tools/oracle/sets";

const read = (...p: string[]) => JSON.parse(readFileSync(join(process.cwd(), ...p), "utf8"));
const config = read("config", "seasons", "2025", "match-scouting.json") as MatchScoutingConfig;
const [base] = generate({ config, seed: "tba", matches: 1, robotsPerMatch: 1 }).performances;

const prefixes = [
  { prefix: "auto", phase: "auto" },
  { prefix: "endGame", phase: "teleop" },
];
const enrichment: TbaEnrichment = {
  scoreBreakdown: { enabled: true, prefixes, knownIds: ["endGameRobot_DeepCage"] },
  componentOprs: ["totalPoints"],
};

const match = (n: number, red: string[], blue: string[], level = "qm"): TbaMatch => ({
  comp_level: level,
  match_number: n,
  alliances: { red: { team_keys: red }, blue: { team_keys: blue } },
  score_breakdown: {
    red: {
      autoLineRobot1: "Yes",
      autoLineRobot2: "No",
      autoLineRobot3: "Yes",
      endGameRobot1: "None",
      endGameRobot2: "Parked",
      endGameRobot3: "ShallowCage",
      autoPoints: 12,
      autoBonus11: true,
    },
    blue: {
      autoLineRobot1: "No",
      autoLineRobot2: "No",
      autoLineRobot3: "No",
      endGameRobot1: "None",
      endGameRobot2: "None",
      endGameRobot3: "Parked",
    },
  },
});
const matches = [
  match(1, ["frc3061", "frc2338B", "frc111"], ["frc254", "frc1678", "frc4414"]),
  match(1, ["frc9999", "frc3061", "frc111"], ["frc254", "frc1678", "frc4414"], "sf"),
];
const tba = { matches, coprs: { totalPoints: { frc3061: 41.5, frc2338b: 12 } } };

describe("DM-11: score-breakdown actions", () => {
  it("finds the alliance and slot by team key, qualification matches only (B teams: BL-308)", () => {
    expect(allianceSlot(matches, 1, "2338B")).toMatchObject({ alliance: "red", slot: 2 });
    expect(allianceSlot(matches, 1, "4414")).toMatchObject({ alliance: "blue", slot: 3 });
    expect(allianceSlot(matches, 1, "9999")).toBeNull(); // only in a playoff match
    expect(allianceSlot(matches, 2, "3061")).toBeNull();
  });

  it("turns keys with the prefix and the robot's slot into actions in the prefix's phase", () => {
    expect(scoreBreakdownActions(matches, 1, "2338B", prefixes)).toEqual([
      {
        id: "autoLineRobot_No",
        ts: 0,
        phase: "auto",
        segment: null,
        segmentKind: null,
        segmentIndex: null,
      },
      {
        id: "endGameRobot_Parked",
        ts: 0,
        phase: "teleop",
        segment: null,
        segmentKind: null,
        segmentIndex: null,
      },
    ]);
  });

  it("matches the whole slot number, so slot 1 never takes a key ending in 11", () => {
    const ids = scoreBreakdownActions(matches, 1, "3061", prefixes).map((a) => a.id);
    expect(ids).toEqual(["autoLineRobot_Yes", "endGameRobot_None"]);
  });

  it("lists every id reported for any robot at the event", () => {
    expect(eventScoreBreakdownIds(matches, prefixes)).toEqual([
      "autoLineRobot_Yes",
      "endGameRobot_None",
      "autoLineRobot_No",
      "endGameRobot_Parked",
      "endGameRobot_ShallowCage",
    ]);
  });
});

describe("buildEnrichedDataset", () => {
  const performance = (team: string, id: string): TeamMatchPerformance => ({
    ...base,
    _id: id.repeat(24),
    matchNumber: 1,
    team,
  });
  const performances = [performance("3061", "a"), performance("2338B", "b"), performance("7", "c")];

  it("adds the actions after the recorded ones, before the stored fields are frozen", () => {
    const dataset = buildEnrichedDataset(performances, enrichment, tba);
    const tmp = dataset.tmps.find((t) => t.team === "3061")!;
    expect(tmp.actions.slice(-2).map((a) => a.id)).toEqual([
      "autoLineRobot_Yes",
      "endGameRobot_None",
    ]);
    expect(tmp.actions.length).toBe(base.actions.length + 2);
    expect(Object.isFrozen(tmp.actions)).toBe(true);
    // A team not in the TBA match gets nothing.
    expect(dataset.tmps.find((t) => t.team === "7")!.actions.length).toBe(base.actions.length);
  });

  it("DM-13: attaches component OPRs by team key, null when TBA has none", () => {
    const { teams } = buildEnrichedDataset(performances, enrichment, tba);
    expect(teams["3061"].opr).toEqual({ totalPoints: 41.5 });
    expect(teams["2338B"].opr).toEqual({ totalPoints: 12 });
    expect(teams["7"].opr).toEqual({ totalPoints: null });
  });

  it("countActions(all) starts knownIds and the event's ids at 0", () => {
    const dataset = buildEnrichedDataset(performances, enrichment, tba);
    expect(dataset.extraActionIds).toEqual([
      "endGameRobot_DeepCage",
      ...eventScoreBreakdownIds(matches, prefixes),
    ]);
    const { dataset: out } = runPipeline(
      dataset,
      [{ type: "tmp", name: "countActions", outputPath: "counts", options: { all: true } }],
      { registry: createRegistry(), context: { config } },
    );
    expect(out.tmps.find((t) => t.team === "3061")!.counts).toMatchObject({
      autoLineRobot_Yes: 1,
      autoLineRobot_No: 0,
      endGameRobot_None: 1,
      endGameRobot_DeepCage: 0,
    });
  });

  it("without TBA data: no actions, no ids at 0 (unknown is No Data), OPRs null", () => {
    const dataset = buildEnrichedDataset(performances, enrichment, null);
    expect(dataset.tmps[0].actions.length).toBe(base.actions.length);
    expect(dataset.extraActionIds).toBeUndefined();
    expect(dataset.teams["3061"].opr).toEqual({ totalPoints: null });
  });

  it("disabled score breakdown still attaches OPRs", () => {
    const off = { ...enrichment, scoreBreakdown: { ...enrichment.scoreBreakdown, enabled: false } };
    const dataset = buildEnrichedDataset(performances, off, tba);
    expect(dataset.tmps[0].actions.length).toBe(base.actions.length);
    expect(dataset.teams["3061"].opr).toEqual({ totalPoints: 41.5 });
  });

  it("an OPR name is a path segment, so names with spaces work", () => {
    const teams = { "3061": {} as Record<string, unknown> };
    attachComponentOprs(teams, ["Hub Total Fuel Count"], {
      "Hub Total Fuel Count": { frc3061: 99 },
    });
    expect(teams["3061"]).toEqual({ opr: { "Hub Total Fuel Count": 99 } });
  });
});

describe("converter (#315)", () => {
  const v1 = (f: string) => read("config", "v1", f);
  it("2026: phases auto and endgame; v5's hidden-layer ids become knownIds", () => {
    const { config: c } = convertAnalysisPipeline(v1("analysis-pipeline.json"), {
      matchScouting: v1("match-scouting.json"),
    });
    expect(c.enrichment.tba.scoreBreakdown).toEqual({
      enabled: true,
      prefixes: [
        { prefix: "auto", phase: "auto" },
        { prefix: "endGame", phase: "endgame" },
      ],
      knownIds: [
        "autoTowerRobot_Level1",
        "endGameTowerRobot_Level1",
        "endGameTowerRobot_Level2",
        "endGameTowerRobot_Level3",
      ],
    });
  });
  it("2025 has no endgame phase: endGame results go in the last phase, with a warning", () => {
    const { config: c, warnings } = convertAnalysisPipeline(
      v1("analysis-pipeline-2025-v4.2.0.json"),
      { matchScouting: v1("match-scouting2025v2.json") },
    );
    expect(c.enrichment.tba.scoreBreakdown.prefixes[1]).toEqual({
      prefix: "endGame",
      phase: "teleop",
    });
    expect(warnings).toContain(
      'enrichment: no endgame phase; endGame score-breakdown actions go in "teleop"',
    );
  });
});

describe("2026 export: TBA-derived values agree with v5 (DM-11, DM-13)", () => {
  const set = goldenSets.find((s) => s.name === "2026mnwi_official-v5")!;
  const comparison = compareGoldenSet(set, { keep: Number.MAX_SAFE_INTEGER });
  const tbaPath = /^(counts|averages)\.(auto|endGame)TowerRobot_|^opr\./;

  it("score-breakdown counts, their team averages, and component OPRs", () => {
    const differing = comparison.differences.filter((d) => tbaPath.test(d.path));
    expect(differing).toEqual([]);
    // The values the check covers really are there: 402 of 413 performances have TBA actions.
    expect(comparison.accepted["tba-ids-start-at-zero-2026"]).toBeGreaterThan(0);
  });
});

describe("ADR 0005: analysis code runs in the browser", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : [];
    });
  it("nothing under src/analysis imports Node, reads files, or fetches", () => {
    const offending = files(join(process.cwd(), "src", "analysis")).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [
        /from "node:/,
        /from "(fs|path|child_process|os)"/,
        /\brequire\(/,
        /\bfetch\(/,
        /\bprocess\./,
      ]
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${file}: ${pattern}`);
    });
    expect(offending).toEqual([]);
  });
});
