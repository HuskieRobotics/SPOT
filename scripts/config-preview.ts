#!/usr/bin/env tsx
/**
 * Preview what a season's pipeline computes on generated matches (#318, gate K-3; docs/spec/22).
 *
 * Usage:
 *   npm run config:preview                         # the active configuration in config/
 *   npm run config:preview -- <folder>             # another season, such as config/seasons/2025
 *   npm run config:preview -- <folder> --team 3061 # one team, as the team view would show it
 *
 * Options: --seed <text>, --matches <n>, --all (every value of every entry),
 * --out <file> (where the full dataset goes; default config-preview.json).
 *
 * Needs match-scouting.json and analysis-pipeline.json to pass their schemas; exit code 1 when
 * they do not. Other mistakes are config:check's job; the preview says how many it finds.
 */
import { existsSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { checkConfiguration, formatReport } from "../src/config/check";
import { readConfigFolder } from "../src/config/load";
import {
  formatPreview,
  formatTeam,
  PREVIEW_DEFAULTS,
  previewConfiguration,
} from "../src/config/preview";
import type {
  AnalysisModulesConfig,
  AnalysisPipelineConfig,
  MatchScoutingConfig,
} from "../src/config/types";
import { validateConfig, type ConfigKind } from "../src/config/validate";

const argv = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
/** Positions of option values, so a folder name is not mistaken for one. */
const values = new Set(
  ["--team", "--seed", "--matches", "--out"]
    .map((o) => argv.indexOf(o))
    .filter((i) => i >= 0)
    .map((i) => i + 1),
);
const dir = argv.find((a, i) => !a.startsWith("--") && !values.has(i)) ?? "config";
const team = option("team");
const seed = option("seed") ?? PREVIEW_DEFAULTS.seed;
const matches = Number(option("matches") ?? PREVIEW_DEFAULTS.matches);
const out = option("out") ?? "config-preview.json";

if (!existsSync(dir)) {
  console.error(`There is no folder "${dir}".`);
  process.exit(2);
}
if (!Number.isInteger(matches) || matches < 1) {
  console.error("--matches needs a whole number of matches, such as 80.");
  process.exit(2);
}

const sources = readConfigFolder(dir);
const shown = relative(process.cwd(), dir) || ".";
const check = checkConfiguration(sources);

const parse = (kind: ConfigKind): unknown => {
  try {
    const value = JSON.parse(sources[kind] ?? "");
    return validateConfig(kind, value).ok ? value : null;
  } catch {
    return null;
  }
};
const ms = parse("match-scouting") as MatchScoutingConfig | null;
const pipeline = parse("analysis-pipeline") as AnalysisPipelineConfig | null;
const modules = parse("analysis-modules") as AnalysisModulesConfig | null;

if (!ms || !pipeline) {
  console.log(formatReport(check, shown));
  console.log(
    "\nThe preview needs match-scouting.json and analysis-pipeline.json without schema errors; fix the errors above first.",
  );
  process.exit(1);
}

const preview = previewConfiguration({ ms, pipeline, modules }, { seed, matches });
const all = argv.includes("--all");
console.log(team ? formatTeam(preview, team) : formatPreview(preview, { dir: shown, all }));
if (team && !preview.dataset.teams[team]) process.exit(2);

writeFileSync(
  out,
  `${JSON.stringify(
    {
      seed: preview.seed,
      generated: preview.generated,
      idleTeam: preview.idleTeam,
      teams: preview.dataset.teams,
      tmps: preview.dataset.tmps,
    },
    null,
    2,
  )}\n`,
);
console.log(`\nThe whole generated dataset is in ${out}.`);
if (check.errors + check.warnings > 0) {
  console.log(
    `config:check finds ${check.errors} error${check.errors === 1 ? "" : "s"} and ${check.warnings} warning${check.warnings === 1 ? "" : "s"} in ${shown}/; npm run config:check -- ${shown} explains them.`,
  );
}
