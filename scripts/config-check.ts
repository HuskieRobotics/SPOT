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
import { existsSync } from "node:fs";
import { relative } from "node:path";
import { checkConfiguration, formatReport } from "../src/config/check";
import { readConfigFolder } from "../src/config/load";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const dir = argv.find((a) => !a.startsWith("--")) ?? "config";

if (!existsSync(dir)) {
  console.error(`There is no folder "${dir}".`);
  process.exit(2);
}

const sources = readConfigFolder(dir);

const report = checkConfiguration(sources);
if (json) console.log(JSON.stringify(report, null, 2));
else console.log(formatReport(report, relative(process.cwd(), dir) || "."));
process.exit(report.errors > 0 ? 1 : 0);
