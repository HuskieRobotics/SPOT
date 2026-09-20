#!/usr/bin/env tsx
/**
 * Generate synthetic scouting data from a match-scouting configuration (T-4).
 *
 * Usage:
 *   npm run generate -- --config config/match-scouting.json --out <dir>
 *                       [--seed preseason] [--matches 80] [--robots 6] [--legacy]
 *
 * Writes the v6 collections, plus the v5 shape with --legacy so generated data can be fed to
 * the behavioral oracle. Validates everything it writes. Design: docs/spec/22-synthetic-data.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generate, toLegacyPerformance } from "../src/generate/synthetic";
import { assertValid } from "../src/config/validate";
import { validateDocument } from "../src/data/validate";
import type { MatchScoutingConfig } from "../src/config/types";

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const configFile = flag("config");
const outDir = flag("out");
if (!configFile || !outDir) {
  console.error(
    "usage: generate-data --config <file> --out <dir> [--seed s] [--matches n] [--robots n] [--legacy]",
  );
  process.exit(2);
}

const config = JSON.parse(readFileSync(configFile, "utf8")) as MatchScoutingConfig;
assertValid("match-scouting", config);

const dataset = generate({
  config,
  seed: flag("seed") ?? "preseason",
  matches: Number(flag("matches") ?? 80),
  robotsPerMatch: Number(flag("robots") ?? 6),
});

mkdirSync(outDir, { recursive: true });
let invalid = 0;
const check = (kind: Parameters<typeof validateDocument>[0], documents: unknown[]) => {
  for (const document of documents) {
    const v = validateDocument(kind, document);
    if (!v.ok) {
      invalid++;
      if (invalid <= 5)
        console.error(
          `invalid ${kind}: ` + v.issues.map((i) => `${i.path}: ${i.message}`).join("; "),
        );
    }
  }
};
check("team-match-performance", dataset.performances);
check("event", [dataset.event]);
check("scouter", dataset.scouters);

writeFileSync(
  join(outDir, "teamMatchPerformances.json"),
  JSON.stringify(dataset.performances, null, 2) + "\n",
);
writeFileSync(join(outDir, "events.json"), JSON.stringify([dataset.event], null, 2) + "\n");
writeFileSync(join(outDir, "scouters.json"), JSON.stringify(dataset.scouters, null, 2) + "\n");
writeFileSync(join(outDir, "report.json"), JSON.stringify(dataset.report, null, 2) + "\n");

if (argv.includes("--legacy")) {
  const legacy = dataset.performances.map((p) => toLegacyPerformance(config, p));
  writeFileSync(
    join(outDir, "legacy.teamMatchPerformances.json"),
    JSON.stringify(legacy, null, 2) + "\n",
  );
  writeFileSync(
    join(outDir, "legacy.events.json"),
    JSON.stringify([{ _id: { $oid: dataset.event._id }, code: dataset.event.code }], null, 2) +
      "\n",
  );
}

const r = dataset.report;
console.log(
  `performances ${r.performances}  actions ${r.actions}  matches ${r.matches}  seed ${r.seed}  invalid ${invalid}`,
);
console.log(
  "actions by phase: " +
    Object.entries(r.actionsByPhase)
      .map(([k, v]) => `${k} ${v}`)
      .join(", "),
);
if (r.unknownActionIds.length) console.error("unexplained ids: " + r.unknownActionIds.join(", "));
console.log(`wrote ${outDir}`);
process.exit(invalid || r.unknownActionIds.length ? 1 : 0);
