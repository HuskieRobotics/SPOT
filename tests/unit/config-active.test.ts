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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  convertAnalysisModules,
  convertAnalysisPipeline,
  convertMatchScouting,
  convertQr,
  type ConvertOptions,
} from "@/config/convert/v1-to-v2";
import { actionButtonIds, deriveKnownActionIds } from "@/config/knownActionIds";
import { validateConfig, type ConfigKind } from "@/config/validate";

const root = process.cwd();
const kinds: ConfigKind[] = ["match-scouting", "analysis-pipeline", "analysis-modules", "qr"];
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
}

const sets: Record<string, ConfigSet> = {
  "active 2026 (config/)": {
    dir: ["config"],
    sources: {
      "match-scouting": "match-scouting.json",
      "analysis-pipeline": "analysis-pipeline.json",
      "analysis-modules": "analysis-modules.json",
      qr: "qr.json",
    },
    opts: { oprStrings, schemaBase: "../src/config/schema" },
  },
  "archived 2025 (config/seasons/2025/)": {
    dir: ["config", "seasons", "2025"],
    sources: {
      "match-scouting": "match-scouting2025v2.json",
      "analysis-pipeline": "analysis-pipeline-2025v2.json",
      "analysis-modules": "analysis-modules-2025v2.json",
      qr: "qr.json",
    },
    opts: { schemaBase: "../../../src/config/schema" },
  },
};

const convert = (kind: ConfigKind, set: ConfigSet) => {
  const source = v1(set.sources[kind]);
  if (kind === "match-scouting") return convertMatchScouting(source, set.opts).config;
  if (kind === "analysis-pipeline") return convertAnalysisPipeline(source, set.opts).config;
  if (kind === "analysis-modules") return convertAnalysisModules(source, set.opts).config;
  return convertQr(source, set.opts).config;
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
      for (const kind of kinds) expect(file(kind)).toEqual(convert(kind, set));
    });

    it("points $schema at the schema files", () => {
      for (const kind of kinds) {
        const ref = file(kind).$schema as string;
        expect(ref.endsWith(`/${kind}.schema.json`)).toBe(true);
        expect(() => readFileSync(join(root, ...set.dir, ref))).not.toThrow();
      }
    });

    it("fits the QR id field", () => {
      const known = deriveKnownActionIds(file("match-scouting"));
      const idBits = (file("qr").actionSchema as { key: string; bits: number }[]).find(
        (f) => f.key === "id",
      )!.bits;
      expect(known.length).toBeLessThan(2 ** idBits);
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
