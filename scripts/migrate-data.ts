#!/usr/bin/env tsx
/**
 * Run the v5 → v6 data migration over a mongoexport dump.
 *
 * Usage:
 *   npm run migrate -- --performances <file> --events <file> --config <match-scouting.json>
 *                      --out <dir> [--tenant default] [--now <epoch ms>]
 *
 * Reads mongoexport JSON arrays, writes v6 arrays plus report.json, and validates every
 * document it writes. Nothing touches MongoDB: import the output with mongoimport once the
 * report looks right. Design: docs/spec/21-data-model-v2.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { migrate, type V5Event, type V5Performance } from "../src/migrate/v5-to-v6";
import { assertValid } from "../src/config/validate";
import { validateDocument, type DocumentKind } from "../src/data/validate";
import type { MatchScoutingConfig } from "../src/config/types";

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const performancesFile = flag("performances");
const eventsFile = flag("events");
const configFile = flag("config");
const outDir = flag("out");
if (!performancesFile || !eventsFile || !configFile || !outDir) {
  console.error(
    "usage: migrate-data --performances <file> --events <file> --config <file> --out <dir> [--tenant t] [--now ms]",
  );
  process.exit(2);
}

const read = (f: string) => JSON.parse(readFileSync(f, "utf8"));
const config = read(configFile) as MatchScoutingConfig;
assertValid("match-scouting", config);

const result = migrate(
  {
    performances: read(performancesFile) as V5Performance[],
    events: read(eventsFile) as V5Event[],
  },
  {
    config,
    tenantId: flag("tenant"),
    now: flag("now") ? Number(flag("now")) : undefined,
  },
);

mkdirSync(outDir, { recursive: true });
const files: [DocumentKind, string, unknown[]][] = [
  ["team-match-performance", "teamMatchPerformances.json", result.performances],
  ["event", "events.json", result.events],
  ["scouter", "scouters.json", result.scouters],
];

let invalid = 0;
for (const [kind, name, documents] of files) {
  for (const document of documents) {
    const v = validateDocument(kind, document);
    if (!v.ok) {
      invalid++;
      if (invalid <= 5) {
        const id = (document as { _id?: string })._id ?? "?";
        console.error(`invalid ${kind} ${id}:`);
        for (const issue of v.issues) console.error(`  ${issue.path}: ${issue.message}`);
      }
    }
  }
  writeFileSync(join(outDir, name), JSON.stringify(documents, null, 2) + "\n");
}
writeFileSync(join(outDir, "report.json"), JSON.stringify(result.report, null, 2) + "\n");

const r = result.report;
console.log(
  `performances ${r.performances}  actions ${r.actions}  events ${r.events}  scouters ${r.scouters}`,
);
console.log(
  `superseded ${r.supersededPerformances}  from QR ${r.qrPerformances}  invalid ${invalid}`,
);
if (r.unknownActionIds.length)
  console.log(
    `unknown action ids (${r.unknownActionIds.length}): ` +
      r.unknownActionIds.map((u) => `${u.id}×${u.count}`).join(", "),
  );
if (r.placementMismatches.length)
  console.log(
    `placement disagreements (${r.placementMismatches.length}): ` +
      r.placementMismatches
        .map((m) => `${m.id} id=${m.fromId} clock=${m.fromClock} ×${m.count}`)
        .join(", "),
  );
if (r.mergedScouters.length)
  console.log(
    `merged scouter spellings: ` +
      r.mergedScouters.map((m) => `${m.id} [${m.spellings.join(" | ")}]`).join(", "),
  );
console.log(`wrote ${outDir}`);
process.exit(invalid ? 1 : 0);
