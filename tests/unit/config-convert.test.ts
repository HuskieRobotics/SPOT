/**
 * T-3: the v1 -> v2 configuration converter (src/config/convert) must turn every archived
 * legacy configuration set in config/v1 into a valid v2 document, and the converted 2026
 * configuration must explain every action id the 2026 oracle saw in real data
 * (docs/spec/17 "oracle findings", docs/spec/12 F-4).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  convertAnalysisModules,
  convertAnalysisPipeline,
  convertMatchScouting,
  convertQr,
  type V1MatchScouting,
  type V1Module,
  type V1PipelineEntry,
  type V1Qr,
} from "@/config/convert/v1-to-v2";
import {
  describeKeys,
  nativeCountPath,
  nativeCountPaths,
  nativeIds,
  periodFilterFor,
} from "@/config/convert/native";
import { deriveKnownActionIds, derivePrefixes } from "@/config/knownActionIds";
import { validateConfig } from "@/config/validate";

const v1 = (f: string) => JSON.parse(readFileSync(join(process.cwd(), "config", "v1", f), "utf8"));
const report = JSON.parse(
  readFileSync(
    join(process.cwd(), "tools", "oracle", "golden", "2026mnwi_official-v5", "report.json"),
    "utf8",
  ),
) as { unknownActionIds: { id: string; count: number }[] };

/** Archived season sets. analysis-pipeline-2024.json is known-invalid JSON (config/v1/README.md). */
const sets: { name: string; ms: string; pipeline?: string; modules: string }[] = [
  {
    name: "2022",
    ms: "match-scouting-2022.json",
    pipeline: "analysis-pipeline-2022.json",
    modules: "analysis-modules-2022.json",
  },
  {
    name: "2023",
    ms: "match-scouting-2023.json",
    pipeline: "analysis-pipeline-2023.json",
    modules: "analysis-modules-2023.json",
  },
  {
    name: "2023v1",
    ms: "match-scouting-2023v1.json",
    pipeline: "analysis-pipeline-2023v1.json",
    modules: "analysis-modules-2023v1.json",
  },
  { name: "2024", ms: "match-scouting-2024.json", modules: "analysis-modules-2024.json" },
  {
    name: "2024v2",
    ms: "match-scouting-2024v2.json",
    pipeline: "analysis-pipeline-2024v2.json",
    modules: "analysis-modules-2024v2.json",
  },
  {
    name: "2025",
    ms: "match-scouting-2025.json",
    pipeline: "analysis-pipeline-2025.json",
    modules: "analysis-modules-2025.json",
  },
  {
    name: "2025v2",
    ms: "match-scouting2025v2.json",
    pipeline: "analysis-pipeline-2025v2.json",
    modules: "analysis-modules-2025v2.json",
  },
  {
    name: "2025 at v4.2.0",
    ms: "match-scouting2025v2.json",
    pipeline: "analysis-pipeline-2025-v4.2.0.json",
    modules: "analysis-modules-2025v2.json",
  },
  {
    name: "2026",
    ms: "match-scouting.json",
    pipeline: "analysis-pipeline.json",
    modules: "analysis-modules.json",
  },
];

describe("v1 -> v2 converter on every archived season", () => {
  for (const s of sets) {
    it(`${s.name} match-scouting converts to a valid v2 document`, () => {
      const { config } = convertMatchScouting(v1(s.ms) as V1MatchScouting);
      const r = validateConfig("match-scouting", config);
      expect(r.issues).toEqual([]);
      expect(r.ok).toBe(true);
      // every executable target must name a layer that exists
      const layerIds = new Set(config.layout.layers.map((l) => l.id));
      for (const layer of config.layout.layers)
        for (const b of layer.buttons)
          for (const e of b.executables) if ("to" in e) expect(layerIds.has(e.to)).toBe(true);
      for (const p of config.timing.phases) if (p.layer) expect(layerIds.has(p.layer)).toBe(true);
    });
    if (s.pipeline) {
      it(`${s.name} analysis-pipeline converts to a valid v2 document`, () => {
        const { config } = convertAnalysisPipeline(v1(s.pipeline!) as V1PipelineEntry[], {
          matchScouting: v1(s.ms) as V1MatchScouting,
        });
        const r = validateConfig("analysis-pipeline", config);
        expect(r.issues).toEqual([]);
      });
    }
    it(`${s.name} analysis-modules converts to a valid v2 document`, () => {
      const { config } = convertAnalysisModules(v1(s.modules) as V1Module[]);
      const r = validateConfig("analysis-modules", config);
      expect(r.issues).toEqual([]);
    });
  }

  it("CS-14: qr converts and widens the id field", () => {
    const { config, warnings } = convertQr(v1("qr.json") as V1Qr);
    expect(validateConfig("qr", config).ok).toBe(true);
    expect(config.actionSchema).toEqual([
      { key: "id", bits: 16 },
      { key: "ts", bits: 32 },
    ]);
    expect(warnings).toHaveLength(1);
  });
});

describe("converted 2026 match-scouting configuration", () => {
  const { config, warnings } = convertMatchScouting(v1("match-scouting.json") as V1MatchScouting);

  it("CS-5: drops the hidden catalog layer and keeps the 12 real layers", () => {
    expect(config.layout.layers).toHaveLength(12);
    expect(warnings.some((w) => w.includes("removed catalog layer 12"))).toBe(true);
    expect(config.layout.layers.every((l) => l.buttons.length < 20)).toBe(true);
  });

  it("CS-1, CS-2: derives the three analysis phases in milliseconds", () => {
    expect(config.timing.totalMs).toBe(160000);
    expect(config.timing.phases.map((p) => [p.id, p.prefix, p.startMs])).toEqual([
      ["auto", "auto", 159999],
      ["teleop", "teleop", 140000],
      ["endgame", "endgame", 30000],
    ]);
    // endgame is a phase of its own so analysis can separate it from the rest of teleop
    expect(config.timing.phases[2].layer).toBeUndefined();
  });

  it("CS-4: folds the teleop transition and the shifts into segments of the teleop phase", () => {
    const teleop = config.timing.phases[1];
    expect(teleop.segments?.map((s) => [s.id, s.startMs])).toEqual([
      ["transition", 140000],
      ["shift", 130000],
    ]);
    const [transition, shift] = teleop.segments!;
    // the transition keeps the layer the phase starts on; the shifts switch to the shift layer
    expect(transition.prefix).toBe("teleopTransition");
    expect(transition.layer).toBeUndefined();
    expect(teleop.layer).toBe("layer-7");
    expect(shift.layer).toBe("layer-2");
    expect(shift.repeat).toEqual({ intervalMs: 25000, count: 4 });
    expect(shift.kinds?.map((k) => [k.prefix, k.toggleButton])).toEqual([
      ["activeShift", "teleopActive"],
      ["inactiveShift", "teleopInactive"],
    ]);
    // the four shifts end exactly where the endgame phase begins
    expect(shift.startMs - shift.repeat!.intervalMs * shift.repeat!.count).toBe(
      config.timing.phases[2].startMs,
    );
  });

  it("#326: shifts alternate, and the periods outside them count as kind active", () => {
    const [auto, teleop, endgame] = config.timing.phases;
    const [transition, shift] = teleop.segments!;
    expect(shift.alternate).toBe(true);
    expect([auto.kind, transition.kind, endgame.kind, teleop.kind, shift.kind]).toEqual([
      "active",
      "active",
      "active",
      undefined,
      undefined,
    ]);
    expect(warnings).toContain(
      'periods auto, transition, endgame count as kind "active" (2026: the hub was active for both alliances outside the shifts); verify',
    );
    // A typical game has no shift toggles, so no kinds at all.
    const typical = convertMatchScouting(v1("match-scouting2025v2.json") as V1MatchScouting).config;
    expect(JSON.stringify(typical.timing)).not.toMatch(/"kind"|alternate/);
  });

  it("derives one prefix per phase, segment, shift index and kind", () => {
    const prefixes = derivePrefixes(config);
    expect(prefixes).toContain("");
    expect(prefixes).toContain("auto");
    expect(prefixes).toContain("teleop");
    expect(prefixes).toContain("teleopTransition");
    expect(prefixes).toContain("endgame");
    expect(prefixes).toContain("activeShift3");
    expect(prefixes).toContain("inactiveShift4");
    expect(prefixes).not.toContain("activeShift5");
    // "" + auto + teleop + teleopTransition + endgame + 4 active + 4 inactive shifts
    expect(prefixes).toHaveLength(13);
  });

  it("CS-9: moves the undo guard, the A-Stop lock and the alliance-relative zones into rules", () => {
    expect(config.rules.undo.minQueueLength).toBe(2);
    expect(config.variables).toEqual({});
    expect(config.rules.locks).toHaveLength(1);
    expect(config.rules.locks[0].triggerButtons).toEqual(["aStop"]);
    expect(config.rules.locks[0].untilPhase).toBe("teleop");
    expect(config.rules.allianceRelativeButtons).toEqual([{ own: "AZone", opposing: "OAZone" }]);
  });

  it("CS-8: gives every colored button an explicit color", () => {
    const buttons = config.layout.layers.flatMap((l) => l.buttons);
    const colored = buttons.filter(
      (b) => b.legacyClass && !/^(timer|border|button-padding)$/.test(b.legacyClass),
    );
    expect(colored.length).toBeGreaterThan(20);
    for (const b of colored) expect(b.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("CS-5: explains every id the 2026 oracle found in real data except TBA synthetic ids", () => {
    const known = new Set(deriveKnownActionIds(config));
    const seen = report.unknownActionIds.map((u) => u.id);
    expect(seen.length).toBeGreaterThan(20);
    const stillUnknown = seen.filter((id) => !known.has(id));
    expect(stillUnknown).toEqual(["autoTowerRobot_None", "endGameTowerRobot_None"]);
  });

  it("keeps catalog ids that the derivation cannot explain as extraActionIds", () => {
    expect(config.extraActionIds).toContain("endGameTowerRobot_Level3");
    expect(config.extraActionIds).toContain("activeShift1Fall");
    expect(config.extraActionIds.length).toBeLessThan(15);
  });
});

describe("converted analysis-pipeline configurations", () => {
  it("CS-11: renames legacy option spellings", () => {
    const { config, warnings } = convertAnalysisPipeline(
      v1("analysis-pipeline-2024v2.json") as V1PipelineEntry[],
    );
    const names = config.pipeline.map((e) => e.name);
    expect(names).toContain("finalActionOccurrence");
    expect(names).not.toContain("finalActionOccurence");
    const cycle = config.pipeline.find((e) => e.name === "cycle")!;
    expect(cycle.options).toHaveProperty("startAction");
    expect(cycle.options).not.toHaveProperty("pickups");
    const ratios = config.pipeline.filter((e) => e.name === "ratio");
    for (const r of ratios) expect(r.options).toHaveProperty("divByZero");
    expect(warnings.some((w) => w.includes("moved into options"))).toBe(true);
  });

  it("reads v6's actions where v1 read actionQueue (docs/spec/21 DV-11)", () => {
    const { config, warnings } = convertAnalysisPipeline(
      v1("analysis-pipeline.json") as V1PipelineEntry[],
    );
    const aggregate = config.pipeline.find((e) => e.outputPath === "aggregatedActions")!;
    expect(aggregate.options).toEqual({ path: "actions" });
    expect(JSON.stringify(config)).not.toContain("actionQueue");
    expect(warnings.some((w) => w.includes('now reads "actions"'))).toBe(true);
  });

  it("CS-12: carries TBA OPR strings into enrichment", () => {
    const { config } = convertAnalysisPipeline(v1("analysis-pipeline.json") as V1PipelineEntry[], {
      oprStrings: { string_1: "Hub Total Fuel Count", string_2: "minorFoulCount" },
    });
    expect(config.enrichment.tba.componentOprs).toEqual(["Hub Total Fuel Count", "minorFoulCount"]);
    expect(config.enrichment.tba.scoreBreakdown.enabled).toBe(true);
  });
});

/**
 * CS-16, docs/spec/20 §2.2 item 5 (#320): a configuration that recorded composite ids converts to
 * the native form, button ids with period filters and counts grouped by period, all derived from
 * the configuration's own prefixes.
 */
describe("CS-16: native ids and paths (#320)", () => {
  const ms2026 = convertMatchScouting(v1("match-scouting.json") as V1MatchScouting).config;
  const ids = nativeIds(ms2026, [{ prefix: "endGame", phase: "endgame" }], ["preloadFuel"]);
  const opts = {
    matchScouting: v1("match-scouting.json") as V1MatchScouting,
    pipeline: v1("analysis-pipeline.json") as V1PipelineEntry[],
  };
  const pipeline = convertAnalysisPipeline(opts.pipeline, opts);
  const entry = (outputPath: string, type = "tmp") =>
    pipeline.config.pipeline.find((e) => e.outputPath === outputPath && e.type === type)!;

  it("splits a composite id into button and period, from the prefixes", () => {
    // v5 numbered a kind's shifts (#326): the second active shift is clock slot 3 or 4.
    expect(ids.split("activeShift2StopShooting")).toMatchObject({
      button: "StopShooting",
      key: "active3",
      keys: ["active3", "active4"],
      period: { phase: "teleop", segment: "shift", segmentKind: "active", segmentIndex: 3 },
    });
    expect(ids.split("teleopTransitionRatingStoring1")).toMatchObject({ key: "transition" });
    expect(ids.split("StopShooting")).toBeNull();
    expect(ids.split("endgameFall")).toBeNull(); // the button is "fall"
    expect(nativeCountPath(ids, ["counts"], "counts.autoRatingPassing1")).toBe(
      "counts.auto.RatingPassing1",
    );
    expect(nativeCountPath(ids, ["counts"], "counts.endGameTowerRobot_Level2")).toBe(
      "counts.endgame.endGameTowerRobot_Level2",
    );
    expect(nativeCountPath(ids, ["counts"], "counts.preloadFuel")).toBe(
      "counts.preMatch.preloadFuel",
    );
    expect(nativeCountPath(ids, ["counts"], "counts.shooting")).toBe("counts.shooting");
    expect(nativeCountPaths(ids, ["counts"], "counts.inactiveShift1Defense")).toEqual([
      "counts.inactive1.Defense",
      "counts.inactive2.Defense",
    ]);
    expect(nativeCountPath(ids, ["counts"], "scores.autoRatingPassing1")).toBe(
      "scores.autoRatingPassing1",
    );
  });

  it("chooses the simplest period filter, and says which periods it adds", () => {
    const at = (...composite: string[]) =>
      periodFilterFor(
        ms2026,
        composite.flatMap((c) => ids.split(`${c}Passing`)!.periods),
      );
    expect(at("auto")).toEqual({ filter: { phases: ["auto"] }, added: [] });
    // "active" alone would take in auto, the transition and endgame, which are fixed as active.
    expect(at("activeShift1", "activeShift2")).toEqual({
      filter: { segments: ["shift"], kinds: ["active"] },
      added: [],
    });
    const wide = at("teleopTransition", "activeShift1", "inactiveShift2", "endgame");
    expect(wide.filter).toEqual({ phases: ["teleop", "endgame"] });
    expect(describeKeys(wide.added)).toBe("teleop, shift1–4, inactive1–2, active3–4");
  });

  it("rewrites the 2026 pipeline: grouped counts, button ids with filters", () => {
    expect(entry("counts").options).toEqual({ all: true, by: "segment" });
    expect(entry("counts", "team").options).toEqual({ all: true, by: "segment" });
    // v1's activeShift1 and activeShift2 are every active shift: clock slots 1 to 4 (#326).
    expect((entry("counts.shooting").options as { addends: string[] }).addends).toEqual([
      "counts.auto.StopShooting",
      "counts.transition.StopShooting",
      "counts.active1.StopShooting",
      "counts.active2.StopShooting",
      "counts.active3.StopShooting",
      "counts.active4.StopShooting",
      "counts.inactive1.StopShooting",
      "counts.inactive2.StopShooting",
      "counts.inactive3.StopShooting",
      "counts.inactive4.StopShooting",
      "counts.endgame.StopShooting",
    ]);
    expect(
      Object.keys(
        (entry("scores.activeShift2DefenseRating").options as { weightedPaths: object })
          .weightedPaths,
      ),
    ).toEqual([
      "counts.active3.RatingDefense1",
      "counts.active4.RatingDefense1",
      "counts.active3.RatingDefense2",
      "counts.active4.RatingDefense2",
      "counts.active3.RatingDefense3",
      "counts.active4.RatingDefense3",
      "counts.active3.RatingDefense4",
      "counts.active4.RatingDefense4",
    ]);
    expect(entry("cycle.autoShootingTime").options).toEqual({
      startAction: ["StartShooting"],
      endAction: ["StopShooting"],
      phases: ["auto"],
    });
    expect(entry("cycle.defenseTime").options).toEqual({
      startAction: ["Defense"],
      endAction: ["RatingDefense1", "RatingDefense2", "RatingDefense3", "RatingDefense4"],
      phases: ["teleop", "endgame"],
    });
    expect(entry("zoneActionRating").options).toMatchObject({
      zones: ["AZone", "NeutralZone", "OAZone"],
      actions: ["Defense", "Passing", "StopShooting", "Storing"],
      phases: ["teleop", "endgame"],
    });
    expect(
      Object.keys((entry("zoneActionRating").options as { ratings: object }).ratings),
    ).toHaveLength(16);
    // Not a composite id (the button is "AttemptClimb"): kept, so config:check reports it.
    expect(entry("actionTimes.attemptClimb").options).toEqual({ actionId: ["attemptClimb"] });
    expect(pipeline.warnings).toContain(
      "pipeline[8] tmp/cycle -> cycle.shootingTime: composite ids replaced by button ids with phases teleop, endgame; v1 left out teleop, shift1–4, which this also includes",
    );
  });

  it("rewrites the 2026 modules: count paths, and the heatmap's ids with a filter", () => {
    const { config, warnings } = convertAnalysisModules(
      v1("analysis-modules.json") as V1Module[],
      opts,
    );
    const options = (name: string) => config.modules.find((m) => m.name === name)!.options;
    expect(options("Pre-Loads")).toMatchObject({
      slices: [{ path: "counts.preMatch.preloadFuel" }, { path: "counts.preMatch.preloadNone" }],
    });
    expect(options("TBA Climb Levels")).toMatchObject({
      bars: [
        { path: "counts.endgame.endGameTowerRobot_Level1" },
        { path: "counts.endgame.endGameTowerRobot_Level2" },
        { path: "counts.endgame.endGameTowerRobot_Level3" },
      ],
    });
    expect(options("Teleop Shooting Heatmap")).toMatchObject({
      actionGroups: [
        {
          name: "Teleop Start Shooting",
          actions: ["StartShooting"],
          phases: ["teleop", "endgame"],
        },
      ],
      actionLabels: { StartShooting: "StartShooting" },
    });
    expect(warnings.some((w) => w.includes("one trace for StartShooting"))).toBe(true);
    expect(validateConfig("analysis-modules", config).ok).toBe(true);
  });

  it("leaves a configuration without prefixes alone, and keeps v1 ids when asked", () => {
    const opts2025 = {
      matchScouting: v1("match-scouting2025v2.json") as V1MatchScouting,
      pipeline: v1("analysis-pipeline-2025-v4.2.0.json") as V1PipelineEntry[],
    };
    expect(convertAnalysisPipeline(opts2025.pipeline, opts2025).config).toEqual(
      convertAnalysisPipeline(opts2025.pipeline, { ...opts2025, native: false }).config,
    );
    const asV5 = convertAnalysisPipeline(opts.pipeline, { ...opts, native: false }).config;
    expect(asV5.pipeline.find((e) => e.outputPath === "cycle.autoShootingTime")!.options).toEqual({
      startAction: ["autoStartShooting"],
      endAction: ["autoStopShooting"],
    });
    const modules = convertAnalysisModules(v1("analysis-modules.json") as V1Module[], {
      matchScouting: opts.matchScouting,
    });
    expect(modules.warnings).toContain(
      "modules: composite ids and count paths left as they are; pass the v1 pipeline to rewrite them",
    );
  });
});
