/**
 * Reading a season's configuration files from disk (docs/spec/15, "Configuration storage";
 * decided 2026-11-22, #322). Node only: the scripts and the server use it, never the browser.
 *
 * The active season is the `config/` folder. Every folder under `config/seasons/` that holds a
 * `match-scouting.json` is another season, named by its folder: `2025`, or a student's
 * `practice` copy from the Configuration Guide. A page names a season, never a path, and only a
 * name this module listed is opened, so a request cannot read outside `config/`.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkConfiguration } from "./check";
import { CONFIG_FILES, type Finding } from "./check/report";
import type { MatchScoutingConfig } from "./types";
import type { ConfigKind } from "./validate";

/** The name of the active season, the `config/` folder itself. */
export const ACTIVE_SEASON = "active";

export interface Season {
  /** `active`, or the folder's name under `config/seasons/`. */
  name: string;
  /** The folder, relative to the project: `config` or `config/seasons/2025`. */
  folder: string;
}

/** The text of each of a folder's three files; a missing file is left out. */
export type ConfigSources = Partial<Record<ConfigKind, string>>;

/** The active season first, then the others by name. `root` is the project folder. */
export function listSeasons(root: string = process.cwd()): Season[] {
  const seasons: Season[] = [{ name: ACTIVE_SEASON, folder: "config" }];
  const archive = join(root, "config", "seasons");
  if (!existsSync(archive)) return seasons;
  const names = readdirSync(archive, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(archive, d.name, "match-scouting.json")))
    .map((d) => d.name)
    .filter((name) => name !== ACTIVE_SEASON)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return [...seasons, ...names.map((name) => ({ name, folder: `config/seasons/${name}` }))];
}

/** The season called `name`, if there is one; any other text, a path included, finds nothing. */
export function findSeason(name: string, root: string = process.cwd()): Season | undefined {
  return listSeasons(root).find((s) => s.name === name);
}

/** Read the three files of a folder (absolute, or relative to the working directory). */
export function readConfigFolder(folder: string): ConfigSources {
  const sources: ConfigSources = {};
  for (const kind of CONFIG_FILES) {
    const file = join(folder, `${kind}.json`);
    if (existsSync(file) && statSync(file).isFile()) sources[kind] = readFileSync(file, "utf8");
  }
  return sources;
}

/** Read a season's three files. */
export function readSeason(season: Season, root: string = process.cwd()): ConfigSources {
  return readConfigFolder(join(root, season.folder));
}

/** A short hash of a file's text, which changes whenever the file does (OF-8). */
export function versionOf(source: string): string {
  return createHash("sha256").update(source).digest("hex").slice(0, 12);
}

export interface LoadedMatchScouting {
  /** The configuration, when the file has no errors; null otherwise. */
  config: MatchScoutingConfig | null;
  /** What config:check finds in the file (K-2), errors and warnings apart. */
  errors: Finding[];
  warnings: Finding[];
  version: string | null;
}

/**
 * A season's match-scouting.json, checked as config:check checks it, for a page that draws the
 * scouting screen. The other two files play no part in the screen and are not checked here.
 */
export function loadMatchScouting(source: string | undefined): LoadedMatchScouting {
  const report = checkConfiguration(source === undefined ? {} : { "match-scouting": source }, {
    generated: false,
  });
  const findings = report.findings.filter((f) => f.file === "match-scouting");
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  const ok = source !== undefined && errors.length === 0;
  return {
    config: ok ? (JSON.parse(source) as MatchScoutingConfig) : null,
    errors,
    warnings,
    version: source === undefined ? null : versionOf(source),
  };
}
