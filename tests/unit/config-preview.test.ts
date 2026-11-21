/**
 * config:preview (#318, gate K-3; docs/spec/22 §3.2): what a season's pipeline computes and its
 * modules show, on generated matches, before any match is played. Done when it gives a useful
 * report for the 2025 and 2026 configurations; the summary logic is tested here.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { displayValue, NO_DATA, rankTeams } from "@/analysis/modules/display";
import {
  formatPreview,
  formatTeam,
  previewConfiguration,
  type ItemPreview,
  type Preview,
  type PreviewInput,
} from "@/config/preview";
import type { PipelineEntry } from "@/config/types";

const read = (...p: string[]) => JSON.parse(readFileSync(join(process.cwd(), ...p), "utf8"));
const load = (...dir: string[]): PreviewInput => ({
  ms: read(...dir, "match-scouting.json"),
  pipeline: read(...dir, "analysis-pipeline.json"),
  modules: read(...dir, "analysis-modules.json"),
});
const season2025 = load("config", "seasons", "2025");
const season2026 = load("config");
const preview2025 = previewConfiguration(season2025);

const item = (p: Preview, label: string): ItemPreview | undefined =>
  p.modules?.flatMap((m) => m.items).find((i) => i.label === label || i.path === label);

describe("MO-3, MO-4: how a module shows a team value", () => {
  it("applies multiplier and addend, then decimals and unit; missing or hidden is No Data", () => {
    expect(displayValue(0.4706, { multiplier: 100, decimals: 2, unit: "%" })).toEqual({
      value: 47.06,
      text: "47.06%",
    });
    expect(displayValue(3, { addend: 1 }).text).toBe("4");
    expect(displayValue(0.123456, {}, 2).text).toBe("0.12");
    expect(displayValue(0.5, {}).text).toBe("0.5");
    // DM-1b: v5 read a missing value as 0 (F-27); v6 shows No Data.
    expect(displayValue(undefined).text).toBe(NO_DATA);
    expect(displayValue(null).text).toBe(NO_DATA);
    expect(displayValue("N/A").text).toBe(NO_DATA);
    expect(displayValue(0, { hideIfValue: 0 })).toEqual({ value: null, text: NO_DATA });
    expect(displayValue("Deep", { string: true }).text).toBe("Deep");
  });

  it("ranks by sort direction; ties share a rank and No Data is not ranked", () => {
    const values = new Map<string, number | null>([
      ["1", 5],
      ["2", 9],
      ["3", 9],
      ["4", null],
      ["5", 1],
    ]);
    expect(Object.fromEntries(rankTeams(values, 1))).toEqual({
      "1": { rank: 3, of: 4 },
      "2": { rank: 1, of: 4 },
      "3": { rank: 1, of: 4 },
      "5": { rank: 4, of: 4 },
    });
    expect(rankTeams(values, -1).get("5")).toEqual({ rank: 1, of: 4 });
  });
});

describe("K-3: the 2025 preview", () => {
  it("plays a typical event, with one team that never does anything", () => {
    expect(preview2025.generated).toEqual({ matches: 80, performances: 480, teams: 49 });
    expect(preview2025.seed).toBe("preview");
    expect(preview2025.problems).toEqual([]);
  });

  it("shows each module value as the module formats it, and what the idle team gets", () => {
    expect(item(preview2025, "Algae Accuracy")).toMatchObject({
      path: "algaeAccuracy",
      kind: "team",
      sort: 1,
      display: { multiplier: 100, decimals: 2, unit: "%" },
      idle: "0.00%",
      writer: "entry 28 (team ratio → algaeAccuracy)",
      spread: { count: 48, noData: 0 },
    });
    // No ifNone, so a team that never scored algae has No Data (CC-12 warns about it).
    expect(item(preview2025, "Algae Time to Score")).toMatchObject({
      idle: NO_DATA,
      writer: "entry 36 (team averageArray → cycles.algae.averageTime)",
    });
    // What v4.2.0 shipped: an object the pipeline writes, without this value in it.
    expect(item(preview2025, "Average Coral Misses")).toMatchObject({ writer: null });
    const text = formatPreview(preview2025, { dir: "config/seasons/2025" });
    expect(text).toMatch(
      /^ {2}Algae Accuracy \(algaeAccuracy\) +\d+\.\d\d% +\d+\.\d\d% +\d+\.\d\d% +0\.00%$/m,
    );
    expect(text).toMatch(
      /^ {2}Average Coral Misses \(averages\.missCoral\) +never written by the pipeline$/m,
    );
    expect(text).toMatch(/^ {2}scores\.total +\d+ +\d+ +\d+$/m);
  });

  it("summarizes what each entry writes: numbers, lists, and objects", () => {
    const [counts] = preview2025.entries;
    expect(counts.where).toBe("entry 1 (tmp countActions → counts)");
    expect(counts.leaves.length).toBeGreaterThan(40);
    expect(preview2025.entries[29].leaves).toEqual([
      expect.objectContaining({ path: "cycles.endgame.all", type: "list" }),
    ]);
    const text = formatPreview(preview2025, { dir: "x" });
    expect(text).toMatch(/^entry 1 \(tmp countActions → counts\) +\d+ values$/m);
    expect(text).toMatch(
      /^entry 30 \(team aggregateArray → cycles\.endgame\.all\) +\d+ … \d+(\.5)? … \d+ items$/m,
    );
    expect(formatPreview(preview2025, { dir: "x", all: true })).toMatch(/^ {4}counts\.leave +\d/m);
  });

  it("flags values that are 0, No Data or the same for every team", () => {
    const d = structuredClone(season2025);
    d.pipeline.pipeline.push(
      {
        type: "tmp",
        name: "countActions",
        outputPath: "preMatchCounts",
        options: { ids: ["autol4"], phases: ["preMatch"] },
      } as PipelineEntry,
      {
        type: "team",
        name: "ratio",
        outputPath: "one",
        options: { numerator: ["counts.scoreL4", 1], denominator: ["counts.scoreL4", 1] },
      } as PipelineEntry,
    );
    const p = previewConfiguration(d);
    expect(p.entries[46]).toMatchObject({ flag: "zero" });
    expect(p.entries[47].leaves[0]).toMatchObject({ flag: "constant" });
    const text = formatPreview(p, { dir: "x" });
    expect(text).toMatch(
      /^entry 47 \(tmp countActions → preMatchCounts\) +0 +⚠ 0 for every performance$/m,
    );
  });

  it("is the same for the same seed, and differs for another", () => {
    expect(formatPreview(previewConfiguration(season2025), { dir: "x" })).toBe(
      formatPreview(preview2025, { dir: "x" }),
    );
    const other = previewConfiguration(season2025, { seed: "other", matches: 20 });
    expect(other.generated.matches).toBe(20);
    expect(formatPreview(other, { dir: "x" })).not.toBe(formatPreview(preview2025, { dir: "x" }));
  });

  it("shows one team as the team view would, ranks included", () => {
    const text = formatTeam(preview2025, "3061");
    expect(text.split("\n")[0]).toMatch(
      /^Team 3061 in 80 generated matches \(seed "preview"\): \d+ matches played\.$/,
    );
    expect(text).toMatch(/^ {2}Algae Accuracy: \d+\.\d\d% {3}#\d+ of \d+$/m);
    expect(text).toMatch(/^ {2}scores\.total, by match: \d+: \d+/m);
    expect(text).toMatch(/^ {2}Average Coral Misses: No Data$/m);
    expect(formatTeam(preview2025, "9999")).toMatch(/doing nothing in any\.$/m);
    expect(formatTeam(preview2025, "12")).toMatch(/^Team 12 is not in the generated event\./);
  });
});

describe("K-3: the 2026 preview", () => {
  const preview = previewConfiguration(season2026);

  it("shows TBA results and component OPRs from synthetic TBA data", () => {
    const level3 = item(preview, "counts.endgame.endGameTowerRobot_Level3");
    expect(level3).toMatchObject({ label: "L3", idle: "0" });
    expect(level3?.spread.max).toBeGreaterThan(0);
    expect(item(preview, "Fuel OPR")).toMatchObject({
      writer: "TBA enrichment (componentOprs)",
      idle: "0.00",
    });
    // Never configured as a component OPR (docs/spec/20 §4).
    expect(item(preview, "Auto Fuel OPR")).toMatchObject({ writer: null });
  });

  it("describes a list by its length, and a heatmap by its positions", () => {
    expect(item(preview, "aggregatedActions")).toMatchObject({
      display: { unit: " items" },
      writer: "entry 45 (team aggregateArray → aggregatedActions)",
    });
    expect(formatTeam(preview, "3061")).toMatch(/^ {2}Teleop Start Shooting: \d+ positions?$/m);
  });
});

describe("npm run config:preview", () => {
  const run = (...args: string[]) => {
    try {
      return {
        code: 0,
        out: execFileSync("npx", ["tsx", "scripts/config-preview.ts", ...args], {
          encoding: "utf8",
        }),
      };
    } catch (error) {
      const e = error as { status: number; stdout: string };
      return { code: e.status, out: e.stdout };
    }
  };

  it("prints the preview, writes the dataset, and shows one team", () => {
    const dir = mkdtempSync(join(tmpdir(), "spot-config-preview-"));
    const out = join(dir, "preview.json");
    try {
      const whole = run("config/seasons/2025", "--matches", "20", "--out", out);
      expect(whole.code).toBe(0);
      expect(whole.out).toMatch(/^Preview of config\/seasons\/2025: 20 generated matches/);
      expect(whole.out).toContain(`The whole generated dataset is in ${out}.`);
      expect(whole.out.trim().split("\n").pop()).toMatch(/^config:check finds 6 errors/);
      const data = JSON.parse(readFileSync(out, "utf8"));
      expect(data.tmps).toHaveLength(120);
      expect(Object.keys(data.teams)).toContain("9999");

      expect(run("config/seasons/2025", "--team", "3061", "--out", out).out).toMatch(/^Team 3061 /);
      expect(run("config/seasons/2025", "--team", "12", "--out", out).code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);

  it("asks for the schema errors to be fixed first", () => {
    const dir = mkdtempSync(join(tmpdir(), "spot-config-preview-"));
    try {
      const ms = structuredClone(season2025.ms) as unknown as Record<string, unknown>;
      delete ms.timing;
      writeFileSync(join(dir, "match-scouting.json"), JSON.stringify(ms));
      writeFileSync(join(dir, "analysis-pipeline.json"), JSON.stringify(season2025.pipeline));
      const r = run(dir, "--out", join(dir, "preview.json"));
      expect(r.code).toBe(1);
      expect(r.out.trim().split("\n").pop()).toBe(
        "The preview needs match-scouting.json and analysis-pipeline.json without schema errors; fix the errors above first.",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);
});
