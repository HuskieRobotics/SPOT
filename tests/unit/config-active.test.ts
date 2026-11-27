/**
 * T-3: every v2 configuration set committed under config/ must validate against the schemas and
 * must equal the converter's output from config/v1, so a converter change cannot silently drift
 * away from the files people read and edit. When a set is first hand-edited, drop its drift
 * check and keep the rest.
 *
 * Sets: config/ is the active 2026 REBUILT configuration; config/seasons/<year>/ are archived
 * seasons kept as worked examples and as inputs for the behavioral oracle (docs/spec/17).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  convertAnalysisModules,
  convertAnalysisPipeline,
  convertMatchScouting,
  type ConvertOptions,
} from "@/config/convert/v1-to-v2";
import { actionButtonIds, deriveKnownActionIds } from "@/config/knownActionIds";
import { validateConfig, type ConfigKind } from "@/config/validate";

const root = process.cwd();
const kinds: ConfigKind[] = ["match-scouting", "analysis-pipeline", "analysis-modules"];
const read = (...p: string[]) => JSON.parse(readFileSync(join(root, ...p), "utf8"));
const v1 = (f: string) => read("config", "v1", f);
const oprStrings = read("tools", "oracle", "fixtures", "opr-strings", "2026mnwi.json") as Record<
  string,
  string
>;

interface ConfigSet {
  /** Directory, relative to the repository root. */
  dir: string[];
  /** Legacy source file per kind, in config/v1. */
  sources: Record<ConfigKind, string>;
  opts: ConvertOptions;
  /** What was set by hand on top of the converter's output, which v1 has no way to say. */
  edit?: (kind: ConfigKind, converted: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * 2025 as a worked example of Simulate Match and the Auto Pick List (#389): v4.2.0 shipped it with
 * both on (v5 turned them off in its code for 2026), and the chance of winning, which the 2023
 * configurations had, leads its match-view modules.
 */
const CHANCE_OF_WINNING = {
  view: "match",
  module: "SingleDisplay",
  name: "Chance of Winning",
  wholeMatch: true,
  options: { aggrMethod: "percentChanceOfWinning", decimals: 1 },
  position: "main",
};
function edit2025(kind: ConfigKind, converted: Record<string, unknown>) {
  if (kind !== "analysis-modules") return converted;
  const modules = [...(converted.modules as { view: string }[])];
  modules.splice(
    modules.findIndex((m) => m.view === "match"),
    0,
    CHANCE_OF_WINNING,
  );
  return { ...converted, simulateMatch: true, autoPickList: true, modules };
}

const sets: Record<string, ConfigSet> = {
  "active 2026 (config/)": {
    dir: ["config"],
    sources: {
      "match-scouting": "match-scouting.json",
      "analysis-pipeline": "analysis-pipeline.json",
      "analysis-modules": "analysis-modules.json",
    },
    opts: { oprStrings, schemaBase: "../src/config/schema" },
  },
  "archived 2025 (config/seasons/2025/)": {
    dir: ["config", "seasons", "2025"],
    sources: {
      "match-scouting": "match-scouting2025v2.json",
      // The pipeline v4.2.0 shipped, which produced the 2025 golden output (#310).
      "analysis-pipeline": "analysis-pipeline-2025-v4.2.0.json",
      "analysis-modules": "analysis-modules-2025v2.json",
    },
    opts: { schemaBase: "../../../src/config/schema" },
    edit: edit2025,
  },
};

const convert = (kind: ConfigKind, set: ConfigSet) => {
  const source = v1(set.sources[kind]);
  if (kind === "match-scouting") return convertMatchScouting(source, set.opts).config;
  if (kind === "analysis-pipeline")
    return convertAnalysisPipeline(source, {
      ...set.opts,
      matchScouting: v1(set.sources["match-scouting"]),
    }).config;
  return convertAnalysisModules(source, {
    ...set.opts,
    matchScouting: v1(set.sources["match-scouting"]),
    pipeline: v1(set.sources["analysis-pipeline"]),
  }).config;
};

for (const [name, set] of Object.entries(sets)) {
  describe(name, () => {
    const file = (kind: ConfigKind) => read(...set.dir, `${kind}.json`);

    for (const kind of kinds) {
      it(`${kind}.json is valid v2`, () => {
        expect(validateConfig(kind, file(kind)).issues).toEqual([]);
      });
    }

    it("matches the converter output for config/v1 (drift check)", () => {
      for (const kind of kinds) {
        const converted = convert(kind, set) as unknown as Record<string, unknown>;
        expect(file(kind)).toEqual(set.edit ? set.edit(kind, converted) : converted);
      }
    });

    it("points $schema at the schema files", () => {
      for (const kind of kinds) {
        const ref = file(kind).$schema as string;
        expect(ref.endsWith(`/${kind}.schema.json`)).toBe(true);
        expect(() => readFileSync(join(root, ...set.dir, ref))).not.toThrow();
      }
    });

    it("has no qr.json: the QR layout is derived (#358)", () => {
      expect(existsSync(join(root, ...set.dir, "qr.json"))).toBe(false);
    });
  });
}

describe("archived 2025 configuration as a typical-season example", () => {
  const ms = read("config", "seasons", "2025", "match-scouting.json");

  it("records raw button ids, with no prefixes and no segments", () => {
    expect(ms.timing.phases.map((p: { id: string; prefix: string }) => [p.id, p.prefix])).toEqual([
      ["auto", ""],
      ["teleop", ""],
    ]);
    expect(ms.timing.phases.every((p: { segments?: unknown }) => p.segments === undefined)).toBe(
      true,
    );
    // with no prefixes, the derived id set is exactly the action buttons: no catalog needed
    expect(deriveKnownActionIds(ms)).toEqual([...actionButtonIds(ms)].sort());
    expect(ms.extraActionIds).toEqual([]);
    // 2025 hand-wrote the period into the button id, which is what prefixes replaced in 2026
    expect(actionButtonIds(ms)).toContain("teleopGroundPickupCoral");
  });

  it("still picks up the A-Stop lock and the undo guard", () => {
    expect(ms.rules.locks[0].triggerButtons).toEqual(["aStop"]);
    expect(ms.rules.locks[0].untilPhase).toBe("teleop");
    expect(ms.rules.undo.minQueueLength).toBe(2);
  });
});
