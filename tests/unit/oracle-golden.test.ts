/**
 * T-4 (seed): the behavioral-oracle golden files are present, parse, and are internally
 * consistent with their reports, for the real event exports and the synthetic sets. The rewrite's pipeline tests will load these same files
 * and compare derived output (docs/spec/17, section 2.1).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generate, toLegacyPerformance } from "@/generate/synthetic";
import type { MatchScoutingConfig } from "@/config/types";

const goldenRoot = join(process.cwd(), "tools", "oracle", "golden");

const seasons = [
  { dir: "2025ilch_official-v4.2.0", event: "2025ilch_official", enrich: false, unknownIds: 0 },
  { dir: "2026mnwi_official-v5", event: "2026mnwi_official", enrich: true },
  // Synthetic inputs (doc 22): 60 matches, six robots, seeds oracle-2025 / oracle-2026.
  { dir: "2025syn_synthetic-v4.2.0", event: "2025syn_synthetic", enrich: false, unknownIds: 0 },
  { dir: "2026syn_synthetic-v5", event: "2026syn_synthetic", enrich: false },
];

type Report = {
  eventCode: string;
  tmpCount: number;
  derivedTmpCount: number;
  teamCount: number;
  enrich: boolean;
  transformerErrors: unknown[];
  unknownActionIds: { id: string; count: number }[];
};

describe("behavioral oracle golden files", () => {
  for (const s of seasons) {
    describe(s.dir, () => {
      const base = join(goldenRoot, s.dir);
      it("exists", () => {
        for (const f of ["report.json", "teams.json", "tmps.json"])
          expect(existsSync(join(base, f))).toBe(true);
      });
      it("report is consistent with data", () => {
        const report = JSON.parse(readFileSync(join(base, "report.json"), "utf8")) as Report;
        const teams = JSON.parse(readFileSync(join(base, "teams.json"), "utf8")) as Record<
          string,
          unknown
        >;
        const tmps = JSON.parse(readFileSync(join(base, "tmps.json"), "utf8")) as unknown[];
        expect(report.eventCode).toBe(s.event);
        expect(report.enrich).toBe(s.enrich);
        expect(report.transformerErrors).toHaveLength(0);
        expect(Object.keys(teams)).toHaveLength(report.teamCount);
        // derived TMPs may be fewer than input TMPs (2026 pipeline starts with removeDuplicates)
        expect(tmps).toHaveLength(report.derivedTmpCount);
        expect(report.derivedTmpCount).toBeLessThanOrEqual(report.tmpCount);
        if (s.unknownIds !== undefined) expect(report.unknownActionIds).toHaveLength(s.unknownIds);
      });
    });
  }
});

describe("T-4: synthetic oracle inputs are what the generator produces", () => {
  const synthetic = join(process.cwd(), "tools", "oracle", "fixtures", "synthetic");
  const configs = {
    2026: join("config", "match-scouting.json"),
    2025: join("config", "seasons", "2025", "match-scouting.json"),
  };
  for (const [season, file] of Object.entries(configs)) {
    it(`${season}: regenerating from the seed reproduces the committed fixture`, () => {
      // If this fails after a deliberate generator change, rerun tools/oracle/run-all.sh so the
      // inputs and their golden output move together.
      const config = JSON.parse(
        readFileSync(join(process.cwd(), file), "utf8"),
      ) as MatchScoutingConfig;
      const { performances } = generate({
        config,
        seed: `oracle-${season}`,
        matches: 60,
        eventCode: `${season}syn_synthetic`,
      });
      const committed = JSON.parse(
        readFileSync(join(synthetic, `${season}syn.teamMatchPerformances.json`), "utf8"),
      );
      expect(performances.map((p) => toLegacyPerformance(config, p))).toEqual(committed);
    });
  }
});
