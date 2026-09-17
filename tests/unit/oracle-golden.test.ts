/**
 * T-4 (seed): the behavioral-oracle golden files are present, parse, and are internally
 * consistent with their reports. The rewrite's pipeline tests will load these same files
 * and compare derived output (docs/spec/17, section 2.1).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const goldenRoot = join(process.cwd(), "tools", "oracle", "golden");

const seasons = [
  { dir: "2025ilch_official-v4.2.0", event: "2025ilch_official", enrich: false, unknownIds: 0 },
  { dir: "2026mnwi_official-v5", event: "2026mnwi_official", enrich: true },
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
