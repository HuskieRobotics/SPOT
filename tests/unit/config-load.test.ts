/**
 * CS-17 (docs/spec/20, decided 2026-11-22, #322): how the application reads a season's
 * configuration from disk, and what the scouting-screen preview (K-5) draws from it.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  ACTIVE_SEASON,
  findSeason,
  listSeasons,
  loadMatchScouting,
  readConfigFolder,
  readSeason,
  versionOf,
} from "@/config/load";

const ms2025 = readFileSync(join("config", "seasons", "2025", "match-scouting.json"), "utf8");

const roots: string[] = [];
afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

/** A project folder with an active season and the given folders under config/seasons/. */
function project(seasons: Record<string, string[]>): string {
  const root = mkdtempSync(join(tmpdir(), "spot-load-"));
  roots.push(root);
  mkdirSync(join(root, "config", "seasons"), { recursive: true });
  writeFileSync(join(root, "config", "match-scouting.json"), "{}");
  for (const [name, files] of Object.entries(seasons)) {
    mkdirSync(join(root, "config", "seasons", name));
    for (const file of files) writeFileSync(join(root, "config", "seasons", name, file), "{}");
  }
  return root;
}

describe("CS-17: seasons are config/ and the folders under config/seasons/", () => {
  it("lists the active season first, then each folder with a match-scouting.json by name", () => {
    const root = project({
      "2025": ["match-scouting.json", "qr.json"],
      practice: ["match-scouting.json"],
      "2024": ["match-scouting.json"],
      notes: ["README.md"],
    });
    expect(listSeasons(root)).toEqual([
      { name: ACTIVE_SEASON, folder: "config" },
      { name: "2024", folder: "config/seasons/2024" },
      { name: "2025", folder: "config/seasons/2025" },
      { name: "practice", folder: "config/seasons/practice" },
    ]);
  });

  it("finds only a season it listed, so a request cannot name a path", () => {
    const root = project({ "2025": ["match-scouting.json"] });
    expect(findSeason("2025", root)?.folder).toBe("config/seasons/2025");
    expect(findSeason(ACTIVE_SEASON, root)?.folder).toBe("config");
    for (const name of ["..", "../..", "2025/..", "seasons/2025", "/etc", "notes", ""]) {
      expect(findSeason(name, root)).toBeUndefined();
    }
  });

  it("reads each of a season's four files, leaving out a missing one", () => {
    const root = project({ "2025": ["match-scouting.json", "qr.json"] });
    const sources = readSeason(findSeason("2025", root)!, root);
    expect(Object.keys(sources).sort()).toEqual(["match-scouting", "qr"]);
    expect(Object.keys(readConfigFolder(join("config", "seasons", "2025")))).toHaveLength(4);
  });

  it("gives each file a version that changes whenever the file does (OF-8)", () => {
    expect(versionOf(ms2025)).toMatch(/^[0-9a-f]{12}$/);
    expect(versionOf(ms2025)).toBe(versionOf(ms2025));
    expect(versionOf(ms2025 + " ")).not.toBe(versionOf(ms2025));
  });
});

describe("K-5: what the scouting-screen preview draws", () => {
  it("draws a file without errors, and passes on its warnings", () => {
    const loaded = loadMatchScouting(ms2025);
    expect(loaded.config?.layout.initialLayer).toBe("layer-0");
    expect(loaded.errors).toEqual([]);
    expect(loaded.warnings.every((f) => f.file === "match-scouting")).toBe(true);
    expect(loaded.version).toBe(versionOf(ms2025));
  });

  it("draws nothing while the file has an error, and says where it is", () => {
    const broken = ms2025.replace('"initialLayer": "layer-0"', '"initialLayer": "layer-99"');
    const loaded = loadMatchScouting(broken);
    expect(loaded.config).toBeNull();
    expect(loaded.errors).toHaveLength(1);
    expect(loaded.errors[0]).toMatchObject({ message: 'There is no layer "layer-99".' });
    expect(loaded.errors[0].line).toBeGreaterThan(0);

    const notJson = loadMatchScouting(ms2025.replace('"label": "Barge",', '"label": "Barge"'));
    expect(notJson.config).toBeNull();
    expect(notJson.errors[0].message).toMatch(/not valid JSON/);
  });

  it("says the file is missing, and checks nothing in the other three files", () => {
    const missing = loadMatchScouting(undefined);
    expect(missing.config).toBeNull();
    expect(missing.version).toBeNull();
    expect(missing.errors.map((f) => f.message)).toEqual(["match-scouting.json is missing."]);
  });
});
