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
        const { config } = convertAnalysisPipeline(v1(s.pipeline!) as V1PipelineEntry[]);
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

  it("qr converts and widens the id field", () => {
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

  it("drops the hidden catalog layer and keeps the 12 real layers", () => {
    expect(config.layout.layers).toHaveLength(12);
    expect(warnings.some((w) => w.includes("removed catalog layer 12"))).toBe(true);
    expect(config.layout.layers.every((l) => l.buttons.length < 20)).toBe(true);
  });

  it("derives the three analysis phases in milliseconds", () => {
    expect(config.timing.totalMs).toBe(160000);
    expect(config.timing.phases.map((p) => [p.id, p.prefix, p.startMs])).toEqual([
      ["auto", "auto", 159999],
      ["teleop", "teleop", 140000],
      ["endgame", "endgame", 30000],
    ]);
    // endgame is a phase of its own so analysis can separate it from the rest of teleop
    expect(config.timing.phases[2].layer).toBeUndefined();
  });

  it("folds the teleop transition and the shifts into segments of the teleop phase", () => {
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

  it("moves the undo guard, the A-Stop lock and the alliance-relative zones into rules", () => {
    expect(config.rules.undo.minQueueLength).toBe(2);
    expect(config.variables).toEqual({});
    expect(config.rules.locks).toHaveLength(1);
    expect(config.rules.locks[0].triggerButtons).toEqual(["aStop"]);
    expect(config.rules.locks[0].untilPhase).toBe("teleop");
    expect(config.rules.allianceRelativeButtons).toEqual([{ own: "AZone", opposing: "OAZone" }]);
  });

  it("gives every colored button an explicit color", () => {
    const buttons = config.layout.layers.flatMap((l) => l.buttons);
    const colored = buttons.filter(
      (b) => b.legacyClass && !/^(timer|border|button-padding)$/.test(b.legacyClass),
    );
    expect(colored.length).toBeGreaterThan(20);
    for (const b of colored) expect(b.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("explains every id the 2026 oracle found in real data except TBA synthetic ids", () => {
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
  it("renames legacy option spellings", () => {
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

  it("carries TBA OPR strings into enrichment", () => {
    const { config } = convertAnalysisPipeline(v1("analysis-pipeline.json") as V1PipelineEntry[], {
      oprStrings: { string_1: "Hub Total Fuel Count", string_2: "minorFoulCount" },
    });
    expect(config.enrichment.tba.componentOprs).toEqual(["Hub Total Fuel Count", "minorFoulCount"]);
    expect(config.enrichment.tba.scoreBreakdown.enabled).toBe(true);
  });
});
