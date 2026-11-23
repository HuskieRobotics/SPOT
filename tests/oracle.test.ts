/**
 * Behavioral oracle: the v6 pipeline engine must reproduce the legacy SPOT pipeline's output
 * (golden files recorded by tools/oracle) for real 2025 and 2026 event data.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { runPipeline, type TbaData } from "@/lib/analysis/pipeline";
import { projectFromLegacy } from "@/lib/project/legacy";
import type { TeamMatchPerformance } from "@/lib/types";

const root = path.resolve(__dirname, "..");
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

function fromExtendedJSON(v: any): any {
  if (Array.isArray(v)) return v.map(fromExtendedJSON);
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    if (keys.length === 1) {
      const k = keys[0];
      if (k === "$oid") return v.$oid;
      if (["$numberLong", "$numberInt", "$numberDouble", "$numberDecimal"].includes(k)) return Number(v[k]);
      if (k === "$date") return v.$date;
    }
    const out: any = {};
    for (const k of keys) out[k] = fromExtendedJSON(v[k]);
    return out;
  }
  return v;
}

function loadTmps(file: string, eventCode: string, eventsFile: string): TeamMatchPerformance[] {
  const events = fromExtendedJSON(read(eventsFile));
  const eventId = events.find((e: any) => e.code === eventCode)._id;
  const tmps = fromExtendedJSON(read(file)).filter((t: any) => String(t.eventNumber) === eventId);
  for (const t of tmps) {
    delete t.__v;
    for (const a of t.actionQueue) delete a._id;
  }
  tmps.sort((a: any, b: any) => a.timestamp - b.timestamp || String(a.matchId).localeCompare(String(b.matchId)));
  return tmps;
}

function normalize(v: any): any {
  if (typeof v === "number") {
    if (Number.isNaN(v)) return "__NaN__";
    if (v === Infinity) return "__Infinity__";
    if (v === -Infinity) return "__-Infinity__";
    return v;
  }
  if (v === undefined) return "__undefined__";
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") {
    const out: any = {};
    for (const k of Object.keys(v).sort()) out[k] = normalize(v[k]);
    return out;
  }
  return v;
}

const legacyActionIds = (ms: any): string[] =>
  ms.layout.layers.flat().reduce((acc: string[], b: any) => (acc.includes(b.id) ? acc : acc.concat(b.id)), []);

function compare(actual: any, expected: any) {
  const diffs: string[] = [];
  const walk = (a: any, e: any, p: string) => {
    if (diffs.length > 25) return;
    if (typeof e === "number" && typeof a === "number") {
      if (Math.abs(a - e) > 1e-9 * Math.max(1, Math.abs(e))) diffs.push(`${p}: ${a} != ${e}`);
      return;
    }
    if (e && typeof e === "object" && a && typeof a === "object") {
      const keys = new Set([...Object.keys(e), ...Object.keys(a)]);
      for (const k of keys) walk(a[k], e[k], `${p}.${k}`);
      return;
    }
    if (a !== e) diffs.push(`${p}: ${JSON.stringify(a)?.slice(0, 80)} != ${JSON.stringify(e)?.slice(0, 80)}`);
  };
  walk(actual, expected, "");
  return diffs;
}

describe("oracle 2026 REBUILT (2026mnwi)", () => {
  it("reproduces legacy teams and tmps", () => {
    const ms = read("presets/2026/match-scouting.json");
    const project = projectFromLegacy({
      name: "2026",
      season: "2026",
      matchScouting: ms,
      pipeline: read("presets/2026/analysis-pipeline.json"),
      modules: read("presets/2026/analysis-modules.json"),
      tbaBreakdown: true,
    });
    // The golden run attached these three component OPRs (claude/13).
    project.analysis.oprKeys = ["Hub Total Fuel Count", "minorFoulCount", "majorFoulCount"];
    const tba: TbaData = {
      matches: read("tools/oracle/fixtures/tba/2026mnwi/matches.json"),
      teams: read("tools/oracle/fixtures/tba/2026mnwi/teams.json"),
      coprs: read("tools/oracle/fixtures/tba/2026mnwi/coprs.json"),
    };
    const tmps = loadTmps("tools/oracle/fixtures/db/2026Rebuilt.teamMatchPerformances.json", "2026mnwi_official", "tools/oracle/fixtures/db/2026Rebuilt.events.json");
    const run = runPipeline(project, tmps, { tba, actionIds: legacyActionIds(ms) });
    expect(run.steps.filter((s) => !s.ok)).toEqual([]);
    const goldenTeams = read("tools/oracle/golden/2026mnwi_official-HEAD/teams.json");
    const goldenTmps = read("tools/oracle/golden/2026mnwi_official-HEAD/tmps.json");
    expect(compare(normalize(run.dataset.teams), goldenTeams)).toEqual([]);
    expect(compare(normalize(run.dataset.tmps), goldenTmps)).toEqual([]);
  });
});

describe("oracle 2025 REEFSCAPE (2025ilch)", () => {
  it("reproduces legacy teams and tmps", () => {
    const ms = read("presets/2025/match-scouting.json");
    const project = projectFromLegacy({
      name: "2025",
      season: "2025",
      matchScouting: ms,
      pipeline: read("presets/2025/analysis-pipeline.json"),
      modules: read("presets/2025/analysis-modules.json"),
    });
    const tmps = loadTmps("tools/oracle/fixtures/db/2025Reefscape.teamMatchPerformances.json", "2025ilch_official", "tools/oracle/fixtures/db/2025Reefscape.events.json");
    const run = runPipeline(project, tmps, { actionIds: legacyActionIds(ms) });
    expect(run.steps.filter((s) => !s.ok)).toEqual([]);
    // v4.2.0's cycle output named the start action "pickup"; current semantics call it "starts" (claude/17 §2.1).
    const renamePickup = (v: any): any =>
      Array.isArray(v) ? v.map(renamePickup) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k === "pickup" ? "starts" : k, renamePickup(x)])) : v;
    const goldenTeams = normalize(renamePickup(read("tools/oracle/golden/2025ilch_official-v4.2.0/teams.json")));
    const goldenTmps = normalize(renamePickup(read("tools/oracle/golden/2025ilch_official-v4.2.0/tmps.json")));
    expect(compare(normalize(run.dataset.teams), goldenTeams)).toEqual([]);
    expect(compare(normalize(run.dataset.tmps), goldenTmps)).toEqual([]);
  });
});
