#!/usr/bin/env tsx
/**
 * Convert a set of SPOT v1 configuration files to v2 and validate the result.
 *
 * Usage:
 *   npm run config:convert -- <v1 dir> <out dir> [--match-scouting f] [--pipeline f] [--modules f] [--qr f]
 *                              [--prefixing phase|none] [--opr-strings <json>] [--no-enrichment]
 *
 * Defaults pick the un-suffixed files (match-scouting.json, analysis-pipeline.json,
 * analysis-modules.json, qr.json) from <v1 dir>. Exit code 1 if any output fails validation.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  convertAnalysisModules,
  convertAnalysisPipeline,
  convertMatchScouting,
  convertQr,
} from "../src/config/convert/v1-to-v2";
import { validateConfig, type ConfigKind } from "../src/config/validate";

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string): boolean => argv.includes(`--${name}`);

const [inDir, outDir] = positional;
if (!inDir || !outDir) {
  console.error("usage: convert-config <v1 dir> <out dir> [options]");
  process.exit(2);
}

const files = {
  "match-scouting": flag("match-scouting") ?? "match-scouting.json",
  "analysis-pipeline": flag("pipeline") ?? "analysis-pipeline.json",
  "analysis-modules": flag("modules") ?? "analysis-modules.json",
  qr: flag("qr") ?? "qr.json",
} as const;

const read = (f: string) => JSON.parse(readFileSync(join(inDir, f), "utf8"));
const schemaBase = relative(outDir, join(process.cwd(), "src", "config", "schema"))
  .split("\\")
  .join("/");
const opts = {
  idPrefixing: flag("prefixing") as "phase" | "none" | undefined,
  oprStrings: flag("opr-strings")
    ? (JSON.parse(flag("opr-strings")!) as Record<string, string>)
    : undefined,
  enrichment: !has("no-enrichment"),
  schemaBase,
};

mkdirSync(outDir, { recursive: true });
let failed = false;
const results: [ConfigKind, { config: unknown; warnings: string[] }][] = [
  ["match-scouting", convertMatchScouting(read(files["match-scouting"]), opts)],
  ["analysis-pipeline", convertAnalysisPipeline(read(files["analysis-pipeline"]), opts)],
  ["analysis-modules", convertAnalysisModules(read(files["analysis-modules"]), opts)],
  ["qr", convertQr(read(files.qr), opts)],
];
for (const [kind, { config, warnings }] of results) {
  const outFile = join(outDir, `${kind}.json`);
  writeFileSync(outFile, JSON.stringify(config, null, 2) + "\n");
  const v = validateConfig(kind, config);
  console.log(
    `${kind}: wrote ${outFile} (${warnings.length} warnings) — ${v.ok ? "valid" : "INVALID"}`,
  );
  for (const w of warnings) console.log(`  warning: ${w}`);
  for (const i of v.issues) console.log(`  error: ${i.path}: ${i.message}`);
  if (!v.ok) failed = true;
}
process.exit(failed ? 1 : 0);
