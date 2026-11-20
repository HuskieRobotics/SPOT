#!/usr/bin/env tsx
/**
 * Check a season's configuration (#317, gate K-2; docs/spec/12 T-3).
 *
 * Usage:
 *   npm run config:check                # the active configuration in config/
 *   npm run config:check -- <folder>    # another season, such as config/seasons/2025
 *   npm run config:check -- <folder> --json
 *
 * Exit code 1 when there are errors; warnings alone exit 0.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { checkConfiguration, CONFIG_FILES, formatReport } from "../src/config/check";
import type { ConfigKind } from "../src/config/validate";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const dir = argv.find((a) => !a.startsWith("--")) ?? "config";

if (!existsSync(dir)) {
  console.error(`There is no folder "${dir}".`);
  process.exit(2);
}

const sources: Partial<Record<ConfigKind, string>> = {};
for (const kind of CONFIG_FILES) {
  const file = join(dir, `${kind}.json`);
  if (existsSync(file)) sources[kind] = readFileSync(file, "utf8");
}

const report = checkConfiguration(sources);
if (json) console.log(JSON.stringify(report, null, 2));
else console.log(formatReport(report, relative(process.cwd(), dir) || "."));
process.exit(report.errors > 0 ? 1 : 0);
