/**
 * config:check run on generated matches (#317; docs/spec/20 §4, CC-9 to CC-12): a path no
 * earlier entry writes, an entry that fails, a module path the pipeline never writes, a value
 * that is empty for everyone, and a ranking that a team that never did anything drops out of.
 * Each is tested on a small change to the archived 2025 configuration (2026 for v5 paths).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkConfiguration, type Finding } from "@/config/check";
import type {
  AnalysisModulesConfig,
  AnalysisPipelineConfig,
  MatchScoutingConfig,
  ModuleEntry,
  PipelineEntry,
} from "@/config/types";
import type { ConfigKind } from "@/config/validate";
import { convertAnalysisPipeline } from "@/config/convert/v1-to-v2";

interface Docs {
  ms: MatchScoutingConfig;
  pipeline: AnalysisPipelineConfig;
  modules: AnalysisModulesConfig;
}

const read = (...p: string[]) => JSON.parse(readFileSync(join(process.cwd(), ...p), "utf8"));
const load = (...dir: string[]): Docs => ({
  ms: read(...dir, "match-scouting.json"),
  pipeline: read(...dir, "analysis-pipeline.json"),
  modules: read(...dir, "analysis-modules.json"),
});
const season2025 = load("config", "seasons", "2025");
const season2026 = load("config");
/** The 2026 pipeline as v5 wrote it, with composite ids: the converter without its rewrite (#320). */
const v5Ids2026 = {
  ...season2026,
  pipeline: convertAnalysisPipeline(read("config", "v1", "analysis-pipeline.json"), {
    matchScouting: read("config", "v1", "match-scouting.json"),
    native: false,
  }).config,
};

const sources = (d: Docs): Record<ConfigKind, string> => ({
  "match-scouting": JSON.stringify(d.ms, null, 2),
  "analysis-pipeline": JSON.stringify(d.pipeline, null, 2),
  "analysis-modules": JSON.stringify(d.modules, null, 2),
});

const same = (a: Finding, b: Finding) => a.where === b.where && a.message === b.message;
const baselines = new Map<Docs, Finding[]>();

/** Check a changed copy of a configuration; return only what the change added. */
function check(mutate: (d: Docs) => void, base: Docs = season2025): Finding[] {
  if (!baselines.has(base)) baselines.set(base, checkConfiguration(sources(base)).findings);
  const d = structuredClone(base);
  mutate(d);
  const before = baselines.get(base) ?? [];
  return checkConfiguration(sources(d)).findings.filter((f) => !before.some((b) => same(b, f)));
}

/** And what the change removed. */
function removed(mutate: (d: Docs) => void, base: Docs = season2025): Finding[] {
  const d = structuredClone(base);
  mutate(d);
  const after = checkConfiguration(sources(d)).findings;
  return (baselines.get(base) ?? checkConfiguration(sources(base)).findings).filter(
    (b) => !after.some((f) => same(b, f)),
  );
}

const brief = (f: Finding) => [f.severity, f.where, f.message, f.hint];
const entry = (e: PipelineEntry) => e;
const statsModule = (name: string, list: { name: string; path: string; sort?: number }[]) =>
  ({ view: "team", module: "Stats", name, options: { list } }) as ModuleEntry;

describe("CC-9: a path no earlier entry writes", () => {
  it("a typo, with the path meant", () => {
    const found = check((d) => {
      (d.pipeline.pipeline[4].options as { addends: string[] }).addends[0] = "scores.atuo";
    });
    expect(found.map(brief)).toEqual([
      [
        "error",
        "entry 5 (tmp sum → scores.total) › options.addends",
        'No earlier entry writes "scores.atuo", so this entry finds nothing there on any performance.',
        'Did you mean "scores.auto"?',
      ],
    ]);
  });

  it("a path a later entry writes: entries run in order", () => {
    const found = check((d) => {
      const [endgame, total] = d.pipeline.pipeline.splice(3, 2);
      d.pipeline.pipeline.splice(3, 0, total, endgame);
    });
    expect(found.map(brief)).toEqual([
      [
        "error",
        "entry 4 (tmp sum → scores.total) › options.addends",
        'No earlier entry writes "scores.endgame", so this entry finds nothing there on any performance.',
        "Entry 5 (tmp weightedSum → scores.endgame) writes it, but entries run in order: move this entry below that one.",
      ],
    ]);
  });

  it("a value of each match read by a team entry, and v5's actionQueue", () => {
    const found = check((d) => {
      d.pipeline.pipeline.push(
        entry({
          type: "team",
          name: "sum",
          outputPath: "best",
          options: { addends: ["scores.total"] },
        }),
        entry({
          type: "team",
          name: "aggregateArray",
          outputPath: "aggregatedActions",
          options: { path: "actionQueue" },
        }),
      );
    });
    // The aggregateArray also fails on every team, but the missing path already says why.
    expect(found.map(brief)).toEqual([
      [
        "error",
        "entry 47 (team sum → best) › options.addends",
        'No earlier entry writes "scores.total", so this entry finds nothing there on any team.',
        '"scores.total" is a value of each match (entry 5 (tmp sum → scores.total) writes it), and team entries and modules read the team\'s values. Combine it per team first, with a team entry such as average whose "path" is "scores.total".',
      ],
      [
        "error",
        "entry 48 (team aggregateArray → aggregatedActions) › options.path",
        'No earlier entry writes "actionQueue", so this entry finds nothing there on any performance.',
        'v5 called the list of actions "actionQueue"; v6 calls it "actions" (docs/spec/21 DV-11).',
      ],
    ]);
  });

  it("explains a path that ends in a v5 id (the 2026 pipeline as v5 wrote it)", () => {
    const r = checkConfiguration(sources(v5Ids2026));
    const f = r.findings.find((x) => x.where.startsWith("entry 2 (tmp sum → counts.shooting)"));
    expect(f && brief(f)).toEqual([
      "error",
      "entry 2 (tmp sum → counts.shooting) › options.addends",
      '7 paths are written by no earlier entry, so this entry finds nothing there on any performance: "counts.autoStopShooting", "counts.teleopTransitionStopShooting", "counts.activeShift1StopShooting", "counts.activeShift2StopShooting", "counts.inactiveShift1StopShooting" and 2 more.',
      'Their last parts are v5\'s ids for button "StopShooting" in phase "auto", segment "transition", "active" shift 1, "active" shift 2, "inactive" shift 1, "inactive" shift 2 and phase "endgame". v6 counts a button under its own id and records the period beside it: count it per period with a countActions entry that has "phases", "segments" or "by", then read the button id from that output (docs/spec/20 §2.2).',
    ]);
  });

  it("an entry that fails on the generated matches", () => {
    const found = check((d) => {
      d.pipeline.pipeline.push(
        entry({
          type: "team",
          name: "aggregateArray",
          outputPath: "allScores",
          options: { path: "scores.total" },
        }),
      );
    });
    expect(found).toEqual([
      expect.objectContaining({
        severity: "error",
        where: "entry 47 (team aggregateArray → allScores)",
        message: expect.stringMatching(
          /^On the generated matches this entry failed for 49 of 49 teams \(first: team \d+\): "scores\.total" holds \d+, which is not a list$/,
        ),
      }),
    ]);
  });
});

describe("CC-10: what modules show", () => {
  it("a team value the pipeline never writes, with the path meant", () => {
    const found = check((d) => {
      const pie = d.modules.modules[1].options as { slices: { path: string }[] };
      pie.slices[0].path = "counts.groundPickupCorals";
    });
    expect(found.map(brief)).toEqual([
      [
        "error",
        'module 2 (team Pie "Coral Pickup Distribution") › options.slices › item 1 › path',
        'analysis-pipeline.json never writes the team value "counts.groundPickupCorals", so this module would always show No Data.',
        'Did you mean "counts.groundPickupCoral"?',
      ],
    ]);
  });

  it("a performance plot reads values of each match; RadarChart's none is not a path", () => {
    const found = check((d) => {
      (d.modules.modules[0].options as { trackedStats: string[] }).trackedStats[0] =
        "averageScores.auto";
      d.modules.modules.push({
        view: "team",
        module: "RadarChart",
        name: "Shape",
        options: {
          sections: [{ name: "Auto" }, { name: "Teleop" }, { name: "Auto" }],
          lines: [
            {
              name: "Average",
              times: [
                { name: "Auto", path: "averageScores.auto" },
                { name: "Teleop", path: "none" },
                { name: "Auto", path: "averageScores.auto" },
              ],
            },
          ],
        },
      });
    });
    expect(found.map(brief)).toEqual([
      [
        "error",
        'module 1 (team PerformanceTimePlot "Performance By Each Match") › options.trackedStats › item 1',
        'analysis-pipeline.json never writes the value of each match "averageScores.auto", so this module would always show No Data.',
        '"averageScores.auto" is a team value (entry 46 (team average → averageScores) writes it); this module shows the values of each match.',
      ],
    ]);
  });

  it("win probability reads averageScores.total and standardDeviation", () => {
    const found = check((d) => {
      d.pipeline.pipeline.splice(43, 1); // standardDeviation
      d.modules.modules.push({
        view: "match",
        module: "SingleDisplay",
        name: "Win Chance",
        wholeMatch: true,
        options: { aggrMethod: "percentChanceOfWinning" },
      });
    });
    expect(found.map(brief)).toEqual([
      [
        "error",
        'module 19 (match SingleDisplay "Win Chance") › options.aggrMethod',
        '"percentChanceOfWinning" reads the team value "standardDeviation", which analysis-pipeline.json never writes.',
        undefined,
      ],
    ]);
  });

  it("a heatmap coordinate no listed action has", () => {
    // The native 2026 heatmap names StartShooting in teleop and endgame (#320).
    const found = check((d) => {
      (d.modules.modules[2].options as { coordinatePath: string }).coordinatePath =
        "other.position";
    }, season2026);
    expect(found.map(brief)).toEqual([
      [
        "warning",
        'module 3 (team HeatmapScatterPlot "Teleop Shooting Heatmap") › options.coordinatePath',
        'No item of "aggregatedActions" has "other.position" in the generated matches, so this module would have nothing to show.',
        'Check the path, and that the buttons whose actions it lists record it (a "position" executable records "other.pos").',
      ],
    ]);
  });
});

describe("CC-11: a value that is empty for everyone", () => {
  it("a count of a button in a period it cannot be pressed in, reported once where it starts", () => {
    const found = check((d) => {
      d.pipeline.pipeline.push(
        entry({
          type: "tmp",
          name: "countActions",
          outputPath: "preMatchScores",
          options: { ids: ["autol4"], phases: ["preMatch"] },
        }),
        entry({
          type: "team",
          name: "average",
          outputPath: "preMatchAverages",
          options: { path: "preMatchScores" },
        }),
      );
      d.modules.modules.push(
        statsModule("Before the match", [{ name: "L4", path: "preMatchAverages.autol4" }]),
      );
    });
    expect(found.map(brief)).toEqual([
      [
        "warning",
        "entry 47 (tmp countActions → preMatchScores)",
        expect.stringMatching(
          /^"preMatchScores" is 0 for every one of the \d+ performances in 120 generated matches\. Entry 48 \(team average → preMatchAverages\) and module 19 \(team Stats "Before the match"\) via "preMatchAverages\.autol4" read it\.$/,
        ),
        'In the generated matches "autol4" was recorded only in phases "auto" and "teleop", never in "preMatch". The generated matches press what match-scouting.json shows on screen at each moment, so check this entry\'s options and which layers show these buttons when.',
      ],
    ]);
  });

  it("a value that is always 0 is reported only when something uses it", () => {
    const autoOnly = (d: Docs) =>
      d.pipeline.pipeline.push(
        entry({
          type: "tmp",
          name: "countActions",
          outputPath: "autoOnly",
          options: { ids: ["autol4", "teleopl4"], phases: ["auto"] },
        }),
        entry({
          type: "team",
          name: "average",
          outputPath: "autoOnlyAverages",
          options: { path: "autoOnly" },
        }),
      );
    // teleopl4 is never pressed in auto, but nothing reads that count.
    expect(check(autoOnly)).toEqual([]);
    const found = check((d) => {
      autoOnly(d);
      d.modules.modules.push(
        statsModule("Auto", [{ name: "Teleop L4", path: "autoOnlyAverages.teleopl4" }]),
      );
    });
    expect(found.map(brief)).toEqual([
      [
        "warning",
        "entry 47 (tmp countActions → autoOnly)",
        expect.stringMatching(
          /^"autoOnly\.teleopl4" is 0 for every one of the \d+ performances in 120 generated matches, yet module 19 \(team Stats "Auto"\) via "autoOnlyAverages\.teleopl4" reads it\.$/,
        ),
        expect.stringMatching(
          /^In the generated matches "teleopl4" was recorded only in phase "teleop", never in "auto"\./,
        ),
      ],
    ]);
  });

  it("reports nothing that follows from a mistake already reported", () => {
    const found = check((d) => {
      (d.pipeline.pipeline[1].options as { weightedPaths: Record<string, number> }).weightedPaths =
        { "counts.autoL9": 3 };
    });
    // scores.auto, scores.total, the team averages and the ranking by them are all empty now; the
    // one finding is the path no entry writes.
    expect(found.map((f) => [f.severity, f.where])).toEqual([
      ["error", "entry 2 (tmp weightedSum → scores.auto) › options.weightedPaths"],
    ]);
  });
});

describe("CC-12: rankings and the team that never did anything (docs/spec/12 F-24)", () => {
  const baseline = checkConfiguration(sources(season2025)).findings;

  it("an average with no ifNone that a ranking sorts by", () => {
    const f = baseline.find(
      (x) => x.where === "entry 36 (team averageArray → cycles.algae.averageTime)",
    );
    expect(f && brief(f)).toEqual([
      "warning",
      "entry 36 (team averageArray → cycles.algae.averageTime)",
      'A team that never does this gets null ("No Data") here, so it drops out of the ranking by "cycles.algae.averageTime" in module 11 (team Stats "Team Stats") instead of ranking last.',
      'Set "ifNone" to the worst value on purpose so such a team ranks last. The ranking puts lower values first, so the worst value is a high one, such as the full match time (153000) for a time. Leave it unset only when "never did it" really means "unknown" (docs/spec/12 F-24).',
    ]);
  });

  it("goes away with a worst value, or with null set on purpose", () => {
    const where = "entry 36 (team averageArray → cycles.algae.averageTime)";
    for (const ifNone of [153000, null]) {
      const gone = removed((d) => {
        (d.pipeline.pipeline[35].options as Record<string, unknown>).ifNone = ifNone;
      });
      expect(gone.map((f) => f.where)).toEqual([where]);
    }
  });

  it("a ratio with no divByZero that a ranking sorts by", () => {
    const found = check((d) => {
      delete (d.pipeline.pipeline[27].options as Record<string, unknown>).divByZero;
    });
    expect(found.map(brief)).toEqual([
      [
        "warning",
        "entry 28 (team ratio → algaeAccuracy)",
        'A team that never does this gets null ("No Data") here, so it drops out of the ranking by "algaeAccuracy" in module 11 (team Stats "Team Stats") instead of ranking last.',
        'Set "divByZero" to the worst value on purpose so such a team ranks last. The ranking puts higher values first, so the worst value is a low one, such as 0. Leave it unset only when "never did it" really means "unknown" (docs/spec/12 F-24).',
      ],
    ]);
  });
});

describe("the generated matches", () => {
  it("can be turned off, for callers that only want the file checks", () => {
    const r = checkConfiguration(sources(season2025), { generated: false });
    expect(r.generated).toBeUndefined();
    expect(r.errors).toBe(0);
  });
});
