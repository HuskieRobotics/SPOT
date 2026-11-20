#!/usr/bin/env tsx
/**
 * Compare the v6 analysis engine with the legacy golden output (#310, T-4).
 *
 * Usage:
 *   npm run oracle:compare -- [set ...] [--feed] [--entries] [--diffs 20] [--json out.json]
 *
 * With no set names, compares every set in tools/oracle/sets.ts. Prints, per set: how many
 * pipeline entries ran and match, performance and team coverage, accepted divergences, and the
 * first differences. --entries lists every pipeline entry's status. --feed fills entries the engine
 * cannot run yet from the golden file, so each transformer is checked on its own. Exit code 1 when anything
 * differs, so it can gate work in progress.
 */
import { writeFileSync } from "node:fs";
import { describeProblem } from "../src/analysis/engine";
import { compareGoldenSet, type Comparison } from "../tools/oracle/compare";
import { goldenSets } from "../tools/oracle/sets";

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flagValues = new Set([flag("diffs"), flag("json")]);
const names = argv.filter((a) => !a.startsWith("--") && !flagValues.has(a));
const showDiffs = Number(flag("diffs") ?? 10);
const sets = names.length ? goldenSets.filter((s) => names.includes(s.name)) : goldenSets;
if (names.length && sets.length !== names.length) {
  console.error(`unknown set; known: ${goldenSets.map((s) => s.name).join(", ")}`);
  process.exit(2);
}

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
const results: Comparison[] = [];
let failing = false;

for (const set of sets) {
  const c = compareGoldenSet(set, {
    keep: Math.max(showDiffs, 200),
    feed: argv.includes("--feed"),
  });
  results.push(c);
  const counts = { match: 0, differs: 0, "not-run": 0 };
  for (const e of c.entries) counts[e.status]++;
  const clean =
    c.differenceCount === 0 &&
    c.problems.length === 0 &&
    c.tmps.missingInV6.length + c.tmps.extraInV6.length === 0 &&
    c.teams.missingInV6.length + c.teams.extraInV6.length === 0;
  failing ||= !clean;

  console.log(`\n${set.name}: ${clean ? "MATCHES" : "differs"}`);
  console.log(
    `  entries   ${c.entries.length}: ${counts.match} match, ${counts.differs} differ, ${counts["not-run"]} not run`,
  );
  console.log(
    `  tmps      legacy ${c.tmps.legacy}, v6 ${c.tmps.v6}` +
      (c.tmps.missingInV6.length ? `, ${c.tmps.missingInV6.length} missing in v6` : "") +
      (c.tmps.extraInV6.length ? `, ${c.tmps.extraInV6.length} extra in v6` : ""),
  );
  console.log(
    `  teams     legacy ${c.teams.legacy}, v6 ${c.teams.v6}` +
      (c.teams.missingInV6.length ? `, missing in v6: ${c.teams.missingInV6.join(" ")}` : "") +
      (c.teams.extraInV6.length ? `, extra in v6: ${c.teams.extraInV6.join(" ")}` : ""),
  );
  console.log(`  values    ${c.compared} compared, ${c.differenceCount} differ`);
  for (const [rule, n] of Object.entries(c.accepted)) console.log(`  accepted  ${rule}: ${n}`);

  const problems = c.problems.filter((p) => p.stage === "run" || argv.includes("--entries"));
  const unregistered = c.problems.length - problems.length;
  if (unregistered)
    console.log(`  problems  ${unregistered} entries cannot run yet (--entries lists them)`);
  for (const p of problems) console.log(`  problem   ${describeProblem(p)}`);

  if (argv.includes("--entries")) {
    for (const e of c.entries) {
      const n = e.differences ? ` (${e.differences} differences)` : "";
      console.log(
        `  ${String(e.index + 1).padStart(3)} ${e.status.padEnd(8)} ${e.type} ${e.name} → ${e.outputPath}${n}`,
      );
    }
  }
  for (const d of c.differences.slice(0, showDiffs)) {
    console.log(
      `  diff      ${d.scope} ${d.id} ${d.path}: legacy ${show(d.legacy)}, v6 ${show(d.v6)}`,
    );
  }
}

const out = flag("json");
if (out) writeFileSync(out, JSON.stringify(results, null, 2) + "\n");
process.exit(failing ? 1 : 0);
