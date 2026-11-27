/**
 * config:check (#317, gate K-2; docs/spec/12 T-3). Each class of finding is tested on a small
 * change to a real configuration (2025 for a phases-only game, 2026 for segments), then the done-
 * when items: the 2026 configuration reports the attemptClimb entry (docs/spec/20 §2.2), and every
 * archived v1 season that converts gives a readable report.
 *
 * The checks of the files themselves (CC-1 to CC-8) are tested without running the pipeline on
 * generated matches; the checks that need it (CC-9 to CC-12) are in config-check-generated.test.ts.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { median } from "@/analysis/extensions/examples/median";
import { createRegistry, extensionTransformers } from "@/analysis/transformers";
import { checkConfiguration, formatReport, type CheckReport, type Finding } from "@/config/check";
import { indexPositions, locate, parseJson } from "@/config/check/json";
import { describeLocation } from "@/config/check/locations";
import { checkQr } from "@/config/check/qr";
import { Reporter } from "@/config/check/report";
import { generate } from "@/generate/synthetic";
import {
  convertAnalysisModules,
  convertAnalysisPipeline,
  convertMatchScouting,
} from "@/config/convert/v1-to-v2";
import type {
  AnalysisModulesConfig,
  AnalysisPipelineConfig,
  MatchScoutingConfig,
} from "@/config/types";
import { validateConfig, type ConfigKind } from "@/config/validate";

const root = process.cwd();
const readText = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

interface Docs {
  ms: MatchScoutingConfig;
  pipeline: AnalysisPipelineConfig;
  modules: AnalysisModulesConfig;
}

const load = (...dir: string[]): Docs => ({
  ms: JSON.parse(readText(...dir, "match-scouting.json")),
  pipeline: JSON.parse(readText(...dir, "analysis-pipeline.json")),
  modules: JSON.parse(readText(...dir, "analysis-modules.json")),
});
const season2025 = load("config", "seasons", "2025");
const season2026 = load("config");
/** The 2026 pipeline as v5 wrote it, with composite ids: the converter without its rewrite (#320). */
const v5Ids2026 = {
  ...season2026,
  pipeline: convertAnalysisPipeline(
    JSON.parse(readText("config", "v1", "analysis-pipeline.json")),
    {
      matchScouting: JSON.parse(readText("config", "v1", "match-scouting.json")),
      native: false,
    },
  ).config,
};

const sources = (d: Docs): Record<ConfigKind, string> => ({
  "match-scouting": JSON.stringify(d.ms, null, 2),
  "analysis-pipeline": JSON.stringify(d.pipeline, null, 2),
  "analysis-modules": JSON.stringify(d.modules, null, 2),
});

/** The checks of the files themselves, without running the pipeline (CC-1 to CC-8). */
const filesOnly = { generated: false } as const;
const baseline = checkConfiguration(sources(season2025));
const baselineFiles = checkConfiguration(sources(season2025), filesOnly);
const sameFinding = (a: Finding, b: Finding) => a.where === b.where && a.message === b.message;

/** Check a changed copy of a configuration; return only what the change added. */
function check(mutate: (d: Docs) => void, base: Docs = season2025, registry = createRegistry()) {
  const d = structuredClone(base);
  mutate(d);
  const report = checkConfiguration(sources(d), { registry, ...filesOnly });
  const before = base === season2025 ? baselineFiles : checkConfiguration(sources(base), filesOnly);
  return report.findings.filter((f) => !before.findings.some((b) => sameFinding(b, f)));
}

const brief = (f: Finding) => ({
  severity: f.severity,
  file: f.file,
  where: f.where,
  message: f.message,
  ...(f.hint ? { hint: f.hint } : {}),
});

describe("T-3: the archived 2025 configuration", () => {
  it("has no errors in its files; their warnings are real (two gridAreas, no knownIds)", () => {
    expect(baselineFiles.errors).toBe(0);
    expect(baselineFiles.findings.map((f) => [f.severity, f.where])).toEqual([
      ["warning", 'layer "layer-4" › button "autoMissProcessor" › gridArea'],
      ["warning", 'layer "layer-8" › button "teleopMissProcessor" › gridArea'],
      ["warning", "enrichment.tba.scoreBreakdown.enabled"],
    ]);
  });

  it("run on generated matches, shows what v4.2.0 shipped: modules reading values never written, and rankings that drop teams", () => {
    expect(baseline.findings.map((f) => [f.severity, f.where])).toEqual([
      ["warning", 'layer "layer-4" › button "autoMissProcessor" › gridArea'],
      ["warning", 'layer "layer-8" › button "teleopMissProcessor" › gridArea'],
      ["warning", "enrichment.tba.scoreBreakdown.enabled"],
      ["warning", "entry 33 (team averageArray → cycles.endgame.averageTimeComplete)"],
      ["warning", "entry 36 (team averageArray → cycles.algae.averageTime)"],
      ["warning", "entry 40 (team averageArray → cycles.coral.averageTime)"],
      ["error", 'module 11 (team Stats "Team Stats") › options.list › item 13 › path'],
      ["error", 'module 11 (team Stats "Team Stats") › options.list › item 14 › path'],
      ["error", 'module 11 (team Stats "Team Stats") › options.list › item 15 › path'],
      ["error", 'module 11 (team Stats "Team Stats") › options.list › item 16 › path'],
      ["error", 'module 17 (match ColumnDisplay "Barge Points") › options.path'],
      ["error", 'module 19 (match Stats "Alliance Stats") › options.list › item 3 › path'],
    ]);
    // "Missed Coral" read the average of a value only the team total had; the v4.2.0 golden output
    // has no averages.missCoral and no avgEndgamePoints either.
    expect(baseline.findings.find((f) => f.where.endsWith("item 13 › path"))).toMatchObject({
      message:
        'analysis-pipeline.json never writes the team value "averages.missCoral", so this module would always show No Data.',
      hint: '"averages" has no "missCoral", but there is a team value "counts.missCoral".',
    });
    expect(baseline.generated).toEqual({ matches: 120, performances: 720, teams: 49 });
  });
});

describe("CC-1: reading the files", () => {
  it("says where a JSON syntax error is, with a hint for the usual mistakes", () => {
    const text = '{\n  "version": 2,\n  "modules": [],\n}\n';
    const r = checkConfiguration({ ...sources(season2025), "analysis-modules": text }, filesOnly);
    expect(r.findings.filter((f) => f.file === "analysis-modules")).toEqual([
      expect.objectContaining({
        severity: "error",
        where: "(whole file)",
        line: 4,
        column: 1,
        hint: "JSON does not allow a comma after the last item. Delete that comma.",
      }),
    ]);
    expect(parseJson('{ "a": 1 // note\n}')).toMatchObject({
      ok: false,
      hint: expect.stringMatching(/^JSON does not allow comments/),
    });
    expect(parseJson("{ 'a': 1 }")).toMatchObject({
      ok: false,
      hint: expect.stringMatching(/double quotes/),
    });
    expect(parseJson('{ "a": 1\n  "b": 2 }')).toMatchObject({
      ok: false,
      hint: "A comma is probably missing between two items, at the end of the line before.",
      position: { line: 2 },
    });
    expect(parseJson('{ "a": [1, 2')).toMatchObject({
      ok: false,
      hint: expect.stringMatching(/ends too early/),
    });
  });

  it("reports a missing file, and a v1 file with the command that converts it", () => {
    const rest: Partial<Record<ConfigKind, string>> = sources(season2025);
    delete rest["analysis-modules"];
    expect(
      checkConfiguration(rest, filesOnly).findings.find((f) => f.file === "analysis-modules"),
    ).toMatchObject({
      message: "analysis-modules.json is missing.",
      hint: expect.stringMatching(/^A season's configuration has three files/),
    });
    const r = checkConfiguration(
      { ...sources(season2025), "match-scouting": readText("config", "v1", "match-scouting.json") },
      filesOnly,
    );
    expect(r.findings.find((f) => f.file === "match-scouting")?.hint).toMatch(
      /npm run config:convert/,
    );
  });

  it("finds the line of any value, also behind escaped strings", () => {
    const text = '{\n  "a\\"b": {\n    "list": [\n      1,\n      { "x": "y\\\\" }\n    ]\n  }\n}';
    const index = indexPositions(text);
    expect(locate(text, index, ['a"b', "list", 1, "x"])).toEqual({ line: 5, column: 9 });
    // A missing key points at the nearest value that exists.
    expect(locate(text, index, ['a"b', "list", 1, "missing"])).toEqual({ line: 5, column: 7 });
  });
});

describe("CC-2: schema messages a student can act on", () => {
  it("names the entry, suggests the option meant, and points at its line", () => {
    const [f] = check((d) => {
      const { misses, ...rest } = d.pipeline.pipeline[9].options as Record<string, unknown>;
      d.pipeline.pipeline[9].options = { ...rest, mises: misses };
    });
    expect(brief(f)).toEqual({
      severity: "error",
      file: "analysis-pipeline",
      where: "entry 10 (tmp cycle → cycles.endgame) › options.mises",
      message: 'unknown property "mises"; did you mean "misses"?',
    });
    expect(f.line).toBeGreaterThan(1);
  });

  it("F-25: an option written beside options is told to move inside it", () => {
    const [f] = check((d) => {
      Object.assign(d.pipeline.pipeline[1], { divByZero: 0 });
    });
    expect(f.where).toBe("entry 2 (tmp weightedSum → scores.auto) › divByZero");
    expect(f.hint).toBe(
      'A transformer\'s options go inside "options": move "divByZero" there (docs/spec/12 F-25).',
    );
  });

  it("an executable with a typo gets one message, not one per executable type", () => {
    const issues = (executables: unknown[]) => {
      const d = structuredClone(season2025);
      (d.ms.layout.layers[0].buttons[0] as { executables: unknown[] }).executables = executables;
      return validateConfig("match-scouting", d.ms).issues.map((i) => [i.path, i.message]);
    };
    expect(issues([{ type: "layer", too: "layer-1" }])).toEqual([
      ["layout.layers.0.buttons.0.executables.0", 'missing required property "to"'],
      ["layout.layers.0.buttons.0.executables.0", 'unknown property "too"; did you mean "to"?'],
    ]);
    expect(issues([{ type: "multiplier", count: "2" }])).toEqual([
      ["layout.layers.0.buttons.0.executables.0.count", "must be integer"],
    ]);
  });

  it("a path with a space and a countActions with neither all nor ids", () => {
    const found = check((d) => {
      d.pipeline.pipeline[4].options = { addends: ["scores.auto "] };
      d.pipeline.pipeline[0].options = {};
    });
    expect(found.map((f) => [f.where, f.message])).toEqual([
      [
        "entry 1 (tmp countActions → counts) › options",
        'needs one of these properties: "all", "ids"',
      ],
      [
        "entry 5 (tmp sum → scores.total) › options.addends › item 1",
        "must not be empty or start or end with a space",
      ],
    ]);
  });
});

describe("CC-4: transformers (TR-10, TR-14)", () => {
  it("an unknown transformer, with did-you-mean, the other type, or a retired name", () => {
    const found = check((d) => {
      d.pipeline.pipeline[1].name = "weightedSun";
      d.pipeline.pipeline[2] = { type: "tmp", name: "countMatches", outputPath: "n", options: {} };
      d.pipeline.pipeline[3].name = "removeDuplicates";
    });
    expect(found.map((f) => [f.message, f.hint])).toEqual([
      ['There is no tmp transformer named "weightedSun".', 'Did you mean "weightedSum"?'],
      [
        'There is no tmp transformer named "countMatches".',
        'There is a team transformer with that name; check "type".',
      ],
      [
        'There is no tmp transformer named "removeDuplicates".',
        expect.stringMatching(/^It is no longer needed/),
      ],
    ]);
  });

  it("an extension's options are checked against its own schema", () => {
    const registry = extensionTransformers.some((t) => t.name === "median")
      ? createRegistry()
      : createRegistry([median]);
    const found = check(
      (d) => {
        d.pipeline.pipeline.push({
          type: "team",
          name: "median",
          outputPath: "m",
          options: { pth: "x" },
        });
      },
      season2025,
      registry,
    );
    expect(found.map((f) => [f.where, f.message])).toEqual([
      ["entry 47 (team median → m) › options", 'options: missing required property "path"'],
      [
        "entry 47 (team median → m) › options.pth",
        'options: unknown property "pth"; did you mean "path"?',
      ],
    ]);
  });
});

describe("CC-5: ids that options name", () => {
  it("done when: the 2026 configuration reports the attemptClimb entry (docs/spec/20 §2.2)", () => {
    const r = checkConfiguration(sources(season2026), filesOnly);
    const f = r.findings.find((x) => x.where.includes("actionTimes.attemptClimb"));
    expect(f && brief(f)).toEqual({
      severity: "error",
      file: "analysis-pipeline",
      where: "entry 6 (tmp actionTime → actionTimes.attemptClimb) › options.actionId",
      message: '"attemptClimb" is not a button id in match-scouting.json.',
      hint: 'Did you mean "AttemptClimb"?',
    });
    // In the native 2026 pipeline (#320), that is the only id no button records.
    expect(
      r.findings
        .filter((x) => x.file === "analysis-pipeline" && x.severity === "error")
        .map((x) => x.where),
    ).toEqual([f!.where]);
  });

  it("explains a v5 id that put the period in front of the button (CS-16)", () => {
    const r = checkConfiguration(sources(v5Ids2026), filesOnly);
    const f = r.findings.find(
      (x) => x.where === "entry 8 (tmp cycle → cycle.shootingTime) › options.startAction",
    );
    expect(f?.message).toBe(
      '4 ids are not button ids in match-scouting.json: "teleopTransitionStartShooting", "activeShift1StartShooting", "activeShift2StartShooting", "endgameStartShooting".',
    );
    expect(f?.hint).toBe(
      'They are v5\'s ids for button "StartShooting" in segment "transition", "active" shift 1, "active" shift 2 and phase "endgame". v6 records the button id and the period separately: name the button, and choose periods with "phases", "segments" or "kinds" (docs/spec/20 §2.2).',
    );
  });

  it("a typo, a path, a button that is not an action, and ids TBA provides", () => {
    const found = check((d) => {
      const cycle = d.pipeline.pipeline[9].options as Record<string, string[]>;
      cycle.startAction = ["barg"];
      cycle.endAction = ["counts.shallow", "undo"];
      // Enrichment ids are known: listed ones, and any id from a configured prefix.
      cycle.misses = ["endGameRobot_Deep", "bargeFall"];
    });
    expect(found.map((f) => [f.where, f.message, f.hint])).toEqual([
      [
        "entry 10 (tmp cycle → cycles.endgame) › options.startAction",
        '"barg" is not a button id in match-scouting.json.',
        'Did you mean "barge"?',
      ],
      [
        "entry 10 (tmp cycle → cycles.endgame) › options.endAction",
        '2 ids are not button ids in match-scouting.json: "counts.shallow", "undo".',
        '"undo" is a undo button; only action buttons are recorded. "counts.shallow" is a path; the button id is "shallow".',
      ],
    ]);
  });

  it("period ids: a typo, preMatch, and a season without segments", () => {
    const found = check((d) => {
      d.pipeline.pipeline[0].options = {
        all: true,
        phases: ["telop", "preMatch"],
        segments: ["shift"],
      };
    });
    expect(found.map((f) => [f.where, f.message, f.hint])).toEqual([
      [
        "entry 1 (tmp countActions → counts) › options.phases › item 1",
        '"telop" is not a phase id in match-scouting.json.',
        'Did you mean "teleop"? "preMatch" selects actions recorded before the match starts.',
      ],
      [
        "entry 1 (tmp countActions → counts) › options.segments › item 1",
        '"shift" is not a segment id in match-scouting.json.',
        "There are no segment ids.",
      ],
    ]);
  });

  it("grouping by segment when two periods would share a key", () => {
    const found = check((d) => {
      d.ms.timing.phases[1].segments![0].id = "endgame";
      d.pipeline.pipeline[0].options = { all: true, by: "segment" };
    }, season2026);
    expect(found.map((f) => [f.where, f.hint])).toContainEqual([
      "entry 1 (tmp countActions → counts) › options.by",
      "Give those periods different ids in match-scouting.json.",
    ]);
  });

  it("module action ids and unknown modules", () => {
    const found = check((d) => {
      d.modules.modules[0].module = "PerformanceTimePlots";
      d.modules.modules.push({
        view: "team",
        module: "HeatmapScatterPlot",
        position: "main",
        name: "Shots",
        options: {
          coordinatePath: "positions",
          aggregatedActionsPath: "aggregatedActions",
          actionGroups: [{ name: "Coral", actions: ["teleopl4", "teleopL5"] }],
          actionLabels: { autol4: "L4" },
          imgPath: "/img/field.svg",
        },
      });
    });
    expect(found.map((f) => [f.severity, f.where, f.message, f.hint])).toEqual([
      [
        "warning",
        'module 1 (team PerformanceTimePlots "Performance By Each Match") › module',
        '"PerformanceTimePlots" is not a built-in module, so the dashboard shows it only if an extension provides it.',
        'Did you mean "PerformanceTimePlot"?',
      ],
      [
        "error",
        'module 20 (team HeatmapScatterPlot "Shots") › options.actionGroups › item 1 › actions',
        '"teleopL5" is not a button id in match-scouting.json.',
        'Did you mean "teleopl4"?',
      ],
    ]);
  });
});

describe("CC-6: TBA enrichment (#315)", () => {
  it("prefix phases must exist; knownIds should be listed and start with a prefix", () => {
    const found = check((d) => {
      d.pipeline.enrichment.tba.scoreBreakdown.prefixes[1].phase = "endgame";
      d.pipeline.enrichment.tba.scoreBreakdown.knownIds = ["endGameRobot_DeepCage", "barge_1"];
    });
    expect(found.map((f) => [f.severity, f.where, f.message])).toEqual([
      [
        "error",
        "enrichment.tba.scoreBreakdown.prefixes › item 2 › phase",
        '"endgame" is not a phase id in match-scouting.json, so actions from "endGame" would belong to no period that a filter or a count by phase expects.',
      ],
      [
        "warning",
        "enrichment.tba.scoreBreakdown.knownIds › item 2",
        '"barge_1" does not start with any score-breakdown prefix ("auto", "endGame"), so enrichment never produces it.',
      ],
    ]);
    // The baseline warning about empty knownIds is gone once ids are listed.
    const r = checkConfiguration(
      sources({
        ...season2025,
        pipeline: {
          ...season2025.pipeline,
          enrichment: {
            tba: {
              ...season2025.pipeline.enrichment.tba,
              scoreBreakdown: {
                ...season2025.pipeline.enrichment.tba.scoreBreakdown,
                knownIds: ["endGameRobot_DeepCage"],
              },
            },
          },
        },
      }),
      filesOnly,
    );
    expect(r.warnings).toBe(baselineFiles.warnings - 1);
  });
});

describe("CC-3: references within match-scouting.json", () => {
  it("layers, buttons, phases and variables that do not exist", () => {
    const found = check((d) => {
      d.ms.layout.initialLayer = "layer-00";
      d.ms.timing.phases[0].layer = "layer-12";
      d.ms.rules.locks[0].triggerButtons = ["aStopp"];
      d.ms.rules.locks[0].untilPhase = "tele";
      d.ms.rules.allianceRelativeButtons = [{ own: "barge", opposing: "oBarge" }];
      d.ms.timing.phases[1].conditional = { piece: { coral: ["teleopl4"] } };
    });
    expect(found.map((f) => [f.severity, f.where, f.message, f.hint ?? ""])).toEqual([
      ["error", 'phase "auto" › layer', 'There is no layer "layer-12".', 'Did you mean "layer-1"?'],
      [
        "warning",
        'phase "teleop" › conditional.piece',
        'No variable "piece" is declared or set, so these buttons are never shown.',
        "There are no variables.",
      ],
      [
        "error",
        'lock "aStop" › triggerButtons › item 1',
        'There is no button "aStopp" in any layer.',
        'Did you mean "aStop"?',
      ],
      ["error", 'lock "aStop" › untilPhase', 'There is no phase "tele".', 'Did you mean "teleop"?'],
      [
        "error",
        "rules.allianceRelativeButtons › item 1 › opposing",
        'There is no button "oBarge" in any layer.',
        'Did you mean "barge"?',
      ],
      ["error", "layout.initialLayer", 'There is no layer "layer-00".', 'Did you mean "layer-0"?'],
      [
        "warning",
        'layer "layer-0" › id',
        'Layer "layer-0" is never shown: it is not the initialLayer, and no phase, segment or button opens it.',
        "",
      ],
    ]);
  });

  it("executables: a layer that does not exist, and a type neither built in nor an extension (#362)", () => {
    const found = check((d) => {
      d.ms.layout.layers[0].buttons[0].executables = [
        { type: "layer", to: "layer-99" },
        { type: "layr", args: [] },
      ];
    });
    expect(found.map((f) => [f.severity, f.where, f.message])).toEqual([
      [
        "error",
        'layer "layer-0" › button "startGame" › executable 1 (layer) › to',
        'There is no layer "layer-99".',
      ],
      [
        "error",
        'layer "layer-0" › button "startGame" › executable 2 (layr) › type',
        'There is no executable "layr".',
      ],
    ]);
    expect(found[1].hint).toBe('Did you mean "layer"?');
  });

  it("phases and segments in match order, inside the match and their phase", () => {
    const phases = check((d) => {
      d.ms.timing.phases[0].startMs = 160000;
      d.ms.timing.phases[1].startMs = 170000;
    });
    expect(phases.map((f) => [f.where, f.message])).toEqual([
      [
        'phase "auto" › startMs',
        "The phase starts at 160000 ms, but the match lasts 153000 ms (timing.totalMs).",
      ],
      [
        'phase "teleop" › startMs',
        "The phase starts at 170000 ms, but the match lasts 153000 ms (timing.totalMs).",
      ],
      [
        'phase "teleop" › startMs',
        'Phases must be listed in match order, so this startMs must be smaller than "auto"\'s (160000 ms); it is 170000 ms.',
      ],
    ]);
    const segments = check((d) => {
      const [transition, shift] = d.ms.timing.phases[1].segments!;
      transition.startMs = 150000;
      shift.repeat = { intervalMs: 25000, count: 5 };
    }, season2026);
    expect(segments.map((f) => [f.where, f.message, f.hint ?? ""])).toEqual([
      [
        'phase "teleop" › segment "transition" › startMs',
        'The segment starts at 150000 ms, outside its phase "teleop" (140000 ms down to 30000 ms).',
        "",
      ],
      [
        'phase "teleop" › segment "shift" › repeat',
        'Repeat 5 would start at 30000 ms, after the phase "teleop" has ended (30000 ms).',
        "Use 4 repeats or a shorter interval.",
      ],
    ]);
  });

  it("segment kinds need a toggle button; ids must be unique", () => {
    const found = check((d) => {
      d.ms.timing.phases[1].segments![1].kinds![0].toggleButton = "teleopActiv";
      d.ms.timing.phases[1].segments![1].id = "transition";
      d.ms.layout.layers[2].id = "layer-1";
    }, season2026);
    expect(found.map((f) => f.message)).toEqual(
      expect.arrayContaining([
        'There is no button "teleopActiv" in any layer, so the scouter cannot select this kind.',
        'Two segments have the id "transition".',
        'Two layers have the id "layer-1".',
      ]),
    );
  });

  it("buttons: a grid area outside the grid or backwards, overlaps, and the same id twice in a layer", () => {
    const found = check((d) => {
      const buttons = d.ms.layout.layers[1].buttons;
      buttons[0].gridArea = [1, 1, 2, 12];
      buttons[1].gridArea = [3, 3, 2, 4];
      // A second "aStop" in the same cell: the same id twice, and an overlap.
      buttons.push(structuredClone(buttons[2]));
    });
    expect(found.map((f) => [f.where, f.message])).toEqual([
      [
        'layer "layer-1" › button "startGame" › gridArea',
        "gridArea [1,1,2,12]: columns 1 to 12 go past the 9-column grid (column lines 1 to 10).",
      ],
      [
        'layer "layer-1" › button "broken" › gridArea',
        "gridArea [3,3,2,4]: an end line must come after its start line; the browser shows one row.",
      ],
      ['layer "layer-1" › button "aStop" › id', 'This layer has two buttons with the id "aStop".'],
      ['layer "layer-1" › button "aStop" › gridArea', 'It overlaps button "aStop" in this layer.'],
    ]);
    expect(found[1].hint).toMatch(/Did you mean \[3,3,4,4\]\?$/);
    const overlap = check((d) => {
      const [, b, c] = d.ms.layout.layers[1].buttons;
      c.gridArea = [...b.gridArea];
    });
    expect(overlap.map((f) => f.message)).toEqual(['It overlaps button "broken" in this layer.']);
    // Buttons shown only for some value of a variable may share a cell (2023 cones and cubes).
    const conditional = check((d) => {
      const [, b, c] = d.ms.layout.layers[1].buttons;
      c.gridArea = [...b.gridArea];
      d.ms.variables = { piece: "coral" };
      d.ms.timing.phases[0].conditional = { piece: { coral: [b.id], algae: [c.id] } };
    });
    expect(conditional).toEqual([]);
  });

  it("#326: a fixed kind must be one a segment declares; alternate needs kinds and repeat", () => {
    const found = check((d) => {
      d.ms.timing.phases[0].kind = "actve";
      d.ms.timing.phases[1].segments![1].kind = "active";
      d.ms.timing.phases[1].segments![0].alternate = true;
    }, season2026);
    expect(found.map((f) => [f.severity, f.where, f.message, f.hint ?? ""])).toEqual([
      [
        "error",
        'phase "auto" › kind',
        '"actve" is not a kind any segment declares, so the phase counts as no kind.',
        'Did you mean "active"?',
      ],
      [
        "error",
        'phase "teleop" › segment "transition" › alternate',
        '"alternate" switches the selected kind at each repeat, but this segment has no "kinds".',
        'Remove "alternate", or give the segment "kinds" and "repeat".',
      ],
      [
        "error",
        'phase "teleop" › segment "shift" › kind',
        "This segment has kinds the scouter selects, so it cannot also have a fixed kind.",
        'Remove "kind"; a fixed kind is for a phase or segment without toggle buttons.',
      ],
    ]);
    const typical = check((d) => {
      d.ms.timing.phases[1].kind = "active";
    });
    expect(typical.map((f) => f.message)).toEqual([
      'No segment declares kinds, so "active" means nothing here.',
    ]);
  });
});

describe("CC-7: matches go through a QR code (#358)", () => {
  it("every season's generated matches come back from a code unchanged", () => {
    for (const d of [season2025, season2026]) {
      const r = checkConfiguration(sources(d), filesOnly);
      expect(r.findings.filter((f) => /QR code/.test(f.message))).toEqual([]);
    }
  });

  it("a match the scouting screen records but a code cannot carry is an error", () => {
    const report = new Reporter({});
    const [p] = generate({ config: season2026.ms, seed: "cc-7", matches: 1 }).performances;
    const action = { ...p.actions[0], other: { color: "red" } };
    checkQr(season2026.ms, report, [{ ...p, actions: [action] }]);
    expect(report.findings).toEqual([
      expect.objectContaining({
        severity: "error",
        file: "match-scouting",
        message: expect.stringMatching(/cannot be sent by QR code: .*color/),
      }),
    ]);
  });
});

describe("CC-8: a check that compares files waits for both to be valid", () => {
  it("skips id checks while match-scouting.json has schema errors, and says so", () => {
    const d = structuredClone(season2025);
    (d.ms.timing as { totalMs: unknown }).totalMs = "153";
    (d.pipeline.pipeline[9].options as Record<string, unknown>).startAction = ["barg"];
    const r = checkConfiguration(sources(d));
    expect(r.findings.some((f) => f.message.includes('"barg"'))).toBe(false);
    expect(r.skipped).toEqual([
      "checks within match-scouting.json, and of the ids other files name: fix the errors in match-scouting.json first.",
      "running the pipeline on generated matches: fix the errors in match-scouting.json and analysis-pipeline.json first.",
    ]);
    expect(r.generated).toBeUndefined();
  });
});

describe("the report", () => {
  it("names locations in the file's own terms", () => {
    expect(
      describeLocation("match-scouting", season2026.ms, [
        "timing",
        "phases",
        1,
        "segments",
        1,
        "kinds",
        0,
        "toggleButton",
      ]),
    ).toBe('phase "teleop" › segment "shift" › kind "active" › toggleButton');
    expect(
      describeLocation("analysis-modules", season2025.modules, [
        "modules",
        10,
        "options",
        "list",
        2,
        "path",
      ]),
    ).toBe('module 11 (team Stats "Team Stats") › options.list › item 3 › path');
    expect(describeLocation("analysis-modules", season2025.modules, [])).toBe("(whole file)");
  });

  it("prints file:line:column, where, what, what to try, and a total", () => {
    const d = structuredClone(season2025);
    (d.pipeline.pipeline[9].options as Record<string, unknown>).startAction = ["barg"];
    const text = formatReport(checkConfiguration(sources(d), filesOnly), "config/seasons/2025/");
    expect(text).toMatch(
      /^config\/seasons\/2025\/analysis-pipeline\.json:\d+:\d+ {2}error {2}entry 10 \(tmp cycle → cycles\.endgame\) › options\.startAction\n {4}"barg" is not a button id in match-scouting\.json\.\n {4}Did you mean "barge"\?$/m,
    );
    expect(text.split("\n").pop()).toBe("✗ 1 error and 3 warnings in config/seasons/2025/");
    expect(formatReport({ findings: [], errors: 0, warnings: 0, skipped: [] }, "config")).toBe(
      "✓ No errors or warnings in config/.",
    );
  });
});

describe("done when: every archived v1 season that converts gives a readable report", () => {
  const v1 = (f: string) => JSON.parse(readText("config", "v1", f));
  // 2024's v1 pipeline is not valid JSON on main (config/v1/README.md); 2024v2 replaced it.
  const seasons: Record<string, [string, string, string]> = {
    "2022": [
      "match-scouting-2022.json",
      "analysis-pipeline-2022.json",
      "analysis-modules-2022.json",
    ],
    "2023": [
      "match-scouting-2023.json",
      "analysis-pipeline-2023.json",
      "analysis-modules-2023.json",
    ],
    "2023v1": [
      "match-scouting-2023v1.json",
      "analysis-pipeline-2023v1.json",
      "analysis-modules-2023v1.json",
    ],
    "2024v2": [
      "match-scouting-2024v2.json",
      "analysis-pipeline-2024v2.json",
      "analysis-modules-2024v2.json",
    ],
    "2025": [
      "match-scouting-2025.json",
      "analysis-pipeline-2025.json",
      "analysis-modules-2025.json",
    ],
    "2025v2": [
      "match-scouting2025v2.json",
      "analysis-pipeline-2025v2.json",
      "analysis-modules-2025v2.json",
    ],
    "2026": ["match-scouting.json", "analysis-pipeline.json", "analysis-modules.json"],
  };
  const reports: Record<string, CheckReport> = {};
  for (const [name, [ms, pipeline, modules]] of Object.entries(seasons)) {
    reports[name] = checkConfiguration({
      "match-scouting": JSON.stringify(convertMatchScouting(v1(ms), {}).config, null, 2),
      "analysis-pipeline": JSON.stringify(
        convertAnalysisPipeline(v1(pipeline), { matchScouting: v1(ms) }).config,
        null,
        2,
      ),
      "analysis-modules": JSON.stringify(convertAnalysisModules(v1(modules), {}).config, null, 2),
    });
  }

  it.each(Object.keys(seasons))("%s", (name) => {
    const r = reports[name];
    // Converted files are valid, so nothing is skipped, and every finding can be found and read.
    expect(r.skipped).toEqual([]);
    for (const f of r.findings) {
      expect(f.line).toBeGreaterThan(0);
      expect(f.where).not.toMatch(/undefined|\[object|\?\)/);
      expect(`${f.message} ${f.hint ?? ""}`).not.toMatch(/undefined|\[object|NaN/);
    }
  });

  it("finds real defects in old seasons", () => {
    // 2023 ended cycles with paths, so its cycle times were always empty.
    expect(
      reports["2023"].findings
        .filter((f) => f.severity === "error" && /not button ids/.test(f.message))
        .map((f) => f.hint),
    ).toEqual([
      '4 of them are paths; a button id is the last part, such as "conePickupGrid".',
      '4 of them are paths; a button id is the last part, such as "cubePickupGrid".',
      '8 of them are paths; a button id is the last part, such as "cubePickupGrid".',
    ]);
    expect(reports["2024v2"].findings.map((f) => f.message)).toContain(
      'This layer has two buttons with the id "autoNoteWing".',
    );
    // Run on generated matches: 2023 scored platform pickups that its countHybrid never counted,
    // and 2024v2 showed a value of each match ("accuracy") where a team value belongs.
    expect(
      reports["2023"].findings.find(
        (f) => f.where === "entry 14 (tmp weightedSum → scores.auto) › options.weightedPaths",
      )?.message,
    ).toBe(
      '2 paths are written by no earlier entry, so this entry finds nothing there on any performance: "autoCounts.hybrid.conePickupPlatform", "autoCounts.hybrid.cubePickupPlatform".',
    );
    expect(
      reports["2024v2"].findings.find(
        (f) => f.where === 'module 2 (team Stats "Team Stats") › options.list › item 2 › path',
      )?.hint,
    ).toBe(
      '"accuracy" is a value of each match (entry 16 (tmp ratio → accuracy) writes it), and team entries and modules read the team\'s values. Combine it per team first, with a team entry such as average whose "path" is "accuracy".',
    );
  });
});

describe("npm run config:check", () => {
  const run = (dir: string) => {
    try {
      return {
        code: 0,
        out: execFileSync("npx", ["tsx", "scripts/config-check.ts", dir], { encoding: "utf8" }),
      };
    } catch (error) {
      const e = error as { status: number; stdout: string };
      return { code: e.status, out: e.stdout };
    }
  };

  it("exits 0 with warnings only, and 1 with errors", () => {
    // The archived 2025 set without the module lines that read values v4.2.0 never wrote.
    const dir = mkdtempSync(join(tmpdir(), "spot-config-check-"));
    const d = structuredClone(season2025);
    const stats = d.modules.modules[10].options as { list: { path: string }[] };
    stats.list = stats.list.filter((s) => !/^averages\.(miss|drop)/.test(s.path));
    d.modules.modules = d.modules.modules.filter(
      (m) => !JSON.stringify(m).includes("avgEndgamePoints"),
    );
    for (const [kind, text] of Object.entries(sources(d)))
      writeFileSync(join(dir, `${kind}.json`), text);
    try {
      const ok = run(dir);
      expect(ok.code).toBe(0);
      expect(ok.out.trim().split("\n").slice(-2)).toEqual([
        "Ran the pipeline on 120 generated matches (720 performances of 49 teams, one of which never did anything).",
        `✓ No errors in ${relative(root, dir)}/, but 6 warnings to look at.`,
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(run("config").code).toBe(1);
  }, 30000);
});
