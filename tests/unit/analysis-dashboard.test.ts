/**
 * The analysis dashboard's work in the browser (#383; docs/spec/08 AN-7, AN-9, AN-10, AN-12 to
 * AN-15, AN-18a; TR-9): running the analysis as the oracle does, searching the team list, a
 * team's notes, and where its modules go.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAnalysis, teamNotes, teamViewModules } from "@/analysis/dashboard";
import { searchTeams } from "@/analysis/search";
import type { ListedTeam } from "@/analysis/teams";
import type {
  AnalysisModulesConfig,
  AnalysisPipelineConfig,
  MatchScoutingConfig,
} from "@/config/types";
import { NOT_FLAGGED, PRIVATE_PERFORMANCE_FIELDS, type PublicPerformance } from "@/data/types";
import { migrate, type V5Event, type V5Performance } from "@/migrate/v5-to-v6";
import { goldenSets } from "../../tools/oracle/sets";
import { runGoldenSet } from "../../tools/oracle/compare";

const read = (...p: string[]) => JSON.parse(readFileSync(join(process.cwd(), ...p), "utf8"));

describe("TR-9, AN-7, AN-9, AN-10: the analysis in the browser is the oracle's", () => {
  const set = goldenSets.find((s) => s.name === "2026mnwi_official-v5")!;
  const matchScouting = read(set.configDir, "match-scouting.json") as MatchScoutingConfig;
  const pipeline = read(set.configDir, "analysis-pipeline.json") as AnalysisPipelineConfig;
  const migrated = migrate(
    {
      performances: read(set.performances) as V5Performance[],
      events: read(set.events) as V5Event[],
    },
    { config: matchScouting, now: 0 },
  );
  const event = migrated.events.find((e) => e.code === set.event)!;
  // What `GET /api/analysis/dataset` sends: current records, without scouter ids (#382).
  const performances: PublicPerformance[] = migrated.performances
    .filter((p) => p.eventId === event._id && !p.superseded)
    .map((p) => {
      const copy: Record<string, unknown> = { ...p };
      for (const f of PRIVATE_PERFORMANCE_FIELDS) delete copy[f];
      return copy as unknown as PublicPerformance;
    });
  const tba = {
    matches: read(set.tbaDir!, "matches.json"),
    coprs: read(set.tbaDir!, "coprs.json"),
    teams: (read(set.tbaDir!, "teams.json") as { key: string; nickname: string }[]).map((t) => ({
      team: t.key.slice(3),
      nickname: t.nickname,
    })),
  };
  const analysis = runAnalysis({ performances, tba, pipeline, matchScouting });

  it("every team's values are what npm run oracle:compare computes", () => {
    const oracle = runGoldenSet(set);
    expect(analysis.dataset.teams).toEqual(oracle.dataset.teams);
    expect(analysis.problems).toEqual(oracle.problems);
  });

  it("AN-12, A-37: the team list is every team with data, named by TBA", () => {
    const withData = new Set(performances.map((p) => p.team));
    expect(analysis.teams.map((t) => t.team).sort()).toEqual([...withData].sort());
    expect(analysis.teams).toContainEqual({ team: "111", nickname: "WildStang" });
  });

  it("without TBA data, the same records still run, with no TBA results or OPRs", () => {
    const bare = runAnalysis({ performances, tba: null, pipeline, matchScouting });
    expect(bare.teams.map((t) => t.team)).toEqual(analysis.teams.map((t) => t.team));
    expect(bare.teams.every((t) => t.nickname === null)).toBe(true);
    expect(bare.dataset.scoreBreakdownIds ?? []).toEqual([]);
  });
});

describe("AN-13: searching the team list", () => {
  const teams: ListedTeam[] = [
    { team: "111", nickname: "WildStang" },
    { team: "1114", nickname: "Simbotics" },
    { team: "2338", nickname: "Gear It Forward" },
    { team: "2338B", nickname: null },
    { team: "3061", nickname: "Huskie Robotics" },
    { team: "3110", nickname: null },
  ];
  const find = (q: string) => searchTeams(teams, q).map((t) => t.team);

  it("an empty query lists every team in team order", () => {
    expect(find("")).toEqual(["111", "1114", "2338", "2338B", "3061", "3110"]);
    expect(find("   ")).toEqual(find(""));
  });

  it("by number: the exact team first, then numbers that start with it, then any that contain it", () => {
    expect(find("111")).toEqual(["111", "1114"]);
    expect(find("2338b")).toEqual(["2338B"]);
    expect(find("11")).toEqual(["111", "1114", "3110"]);
  });

  it("by name: the start of the name, the start of a word, then anywhere", () => {
    expect(find("huskie")).toEqual(["3061"]);
    expect(find("robotics")).toEqual(["3061"]);
    expect(find("forward")).toEqual(["2338"]);
  });

  it("forgives a typo, as v5's fuzzysort did", () => {
    expect(find("wildtsang")).toEqual(["111"]); // swapped
    expect(find("simbotcs")).toEqual(["1114"]); // dropped
    expect(find("huskei")).toEqual(["3061"]); // swapped, at the start of the name
    expect(find("wldstng")).toEqual(["111"]); // letters in order
    expect(find("zzzz")).toEqual([]);
  });
});

describe("AN-18a, RT-34, RT-36: what a team's data says about itself", () => {
  it("counts its matches, the flagged ones and the partial ones", () => {
    const p = (team: string, flagged: boolean, coverage: "full" | "partial") =>
      ({ team, flag: { ...NOT_FLAGGED, flagged }, coverage }) as PublicPerformance;
    const records = [
      p("3061", false, "full"),
      p("3061", true, "full"),
      p("3061", true, "partial"),
      p("111", true, "full"),
    ];
    expect(teamNotes(records, "3061")).toEqual({ matches: 3, flagged: 2, partial: 1 });
    expect(teamNotes(records, "254")).toEqual({ matches: 0, flagged: 0, partial: 0 });
  });
});

describe("AN-14, AN-15: the team view's columns", () => {
  it("team modules only; a side column only when a module asks for it", () => {
    const modules = read("config", "analysis-modules.json") as AnalysisModulesConfig;
    const { main, side } = teamViewModules(modules);
    // In the file's order, which is the order on the page.
    expect(main).toEqual(modules.modules.filter((m) => m.view === "team" && m.position !== "side"));
    expect(main.map((m) => m.module).sort()).toEqual([
      "Bar",
      "Bar",
      "HeatmapScatterPlot",
      "PerformanceTimePlot",
      "Pie",
      "Pie",
      "RadarChart",
    ]);
    expect(side.map((m) => m.module)).toEqual(["Stats"]);
    expect([...main, ...side].every((m) => m.view === "team")).toBe(true);
    const noSide = teamViewModules({
      ...modules,
      modules: modules.modules.filter((m) => m.position !== "side"),
    });
    expect(noSide.side).toEqual([]);
  });
});
