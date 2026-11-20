/**
 * Compare the v6 analysis engine with the legacy golden output (docs/spec/17 §2, T-4, #310).
 *
 * For a golden set: migrate its legacy input to v6 documents (src/migrate), build the dataset,
 * run the set's v2 pipeline, and compare every derived value with the golden file, leaf by leaf.
 * A difference is accepted only when a rule in divergences.json matches it. Differences are
 * attributed to the pipeline entry whose outputPath covers them, so progress can be tracked per
 * entry while the transformers are being written (#311 to #320).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { migrate, type V5Event, type V5Performance } from "../../src/migrate/v5-to-v6";
import { assertValid } from "../../src/config/validate";
import type { AnalysisPipelineConfig, MatchScoutingConfig } from "../../src/config/types";
import {
  ANALYSIS_PERFORMANCE_FIELDS,
  buildDataset,
  checkPipeline,
  getPath,
  runPipeline,
  setPath,
  type Dataset,
  type PipelineProblem,
  type TransformerRegistry,
} from "../../src/analysis/engine";
import { createRegistry } from "../../src/analysis/transformers";
import type { GoldenSet } from "./sets";

// Paths are relative to the repository root; tests and npm scripts run from there.
const read = (path: string): unknown => JSON.parse(readFileSync(join(process.cwd(), path), "utf8"));

/** Stored fields of a legacy performance; everything else in a golden tmp is pipeline output. */
export const LEGACY_STORED_FIELDS = new Set([
  "_id",
  "__v",
  "actionQueue",
  "clientVersion",
  "eventNumber",
  "flagged",
  "matchId",
  "matchId_rand",
  "matchNumber",
  "robotNumber",
  "scouterId",
  "timestamp",
]);
const V6_STORED_FIELDS = new Set<string>(ANALYSIS_PERFORMANCE_FIELDS);

// ---------------------------------------------------------------- divergence rules

export interface DivergenceRule {
  id: string;
  cites: string;
  why: string;
  /** Golden values the rule accepts ("(absent)" when legacy has no value there). */
  legacy?: unknown[];
  /** The value v6 must produce instead; "(any)" accepts whatever v6 writes. */
  v6?: unknown;
  /** A key legacy named differently: in a legacy path matching `paths`, `from` is read as `to`. */
  rename?: { from: string; to: string };
  sets?: string[];
  paths?: string[];
}

export function loadDivergences(): DivergenceRule[] {
  return (read("tools/oracle/divergences.json") as { rules: DivergenceRule[] }).rules;
}

/** `*` matches one path segment, `**` any number of segments (including none). */
export function pathMatches(pattern: string, path: string): boolean {
  const p = pattern.split(".");
  const s = path.split(".");
  const match = (i: number, j: number): boolean => {
    if (i === p.length) return j === s.length;
    if (p[i] === "**") return match(i + 1, j) || (j < s.length && match(i, j + 1));
    return j < s.length && (p[i] === "*" || p[i] === s[j]) && match(i + 1, j + 1);
  };
  return match(0, 0);
}

const ANY = "(any)";

const appliesTo = (r: DivergenceRule, set: string, path: string) =>
  (!r.sets || r.sets.includes(set)) &&
  (!r.paths || r.paths.some((pattern) => pathMatches(pattern, path)));

function acceptingRule(
  rules: readonly DivergenceRule[],
  set: string,
  path: string,
  legacy: unknown,
  v6: unknown,
): DivergenceRule | undefined {
  return rules.find(
    (r) =>
      r.legacy !== undefined &&
      appliesTo(r, set, path) &&
      r.legacy.some((value) => Object.is(value, legacy)) &&
      (r.v6 === ANY || Object.is(r.v6, v6)),
  );
}

/** The legacy path with every applicable rename rule applied, and the ids of those rules. */
function renamed(
  rules: readonly DivergenceRule[],
  set: string,
  path: string,
): { path: string; applied: string[] } {
  const applied: string[] = [];
  let parts = path.split(".");
  for (const r of rules) {
    if (!r.rename || !appliesTo(r, set, path)) continue;
    const { from, to } = r.rename;
    parts = parts.map((p) => (p === from ? to : p));
    applied.push(r.id);
  }
  return { path: parts.join("."), applied };
}

// ---------------------------------------------------------------- flattening

const ABSENT = "(absent)";

/** Leaf values by dot path. Empty objects and arrays are leaves, so their presence is compared. */
export function flatten(value: unknown, prefix = "", out = new Map<string, unknown>()) {
  if (typeof value === "object" && value !== null) {
    const entries = Array.isArray(value)
      ? value.map((v, i) => [String(i), v] as const)
      : Object.entries(value);
    if (entries.length === 0) out.set(prefix, Array.isArray(value) ? "[]" : "{}");
    for (const [key, child] of entries) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  } else {
    out.set(prefix, value);
  }
  return out;
}

function derived(record: Record<string, unknown>, stored: Set<string>): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    if (!stored.has(key)) flatten(value, key, out);
  }
  return out;
}

// ---------------------------------------------------------------- comparison

export interface Difference {
  scope: "tmp" | "team";
  /** Performance `_id` or team key. */
  id: string;
  path: string;
  legacy: unknown;
  v6: unknown;
}

export interface EntryStatus {
  index: number;
  type: "tmp" | "team";
  name: string;
  outputPath: string;
  /** not-run: the entry could not run (no transformer yet, or invalid options). */
  status: "match" | "differs" | "not-run";
  differences: number;
}

export interface Comparison {
  set: string;
  problems: PipelineProblem[];
  entries: EntryStatus[];
  tmps: { legacy: number; v6: number; missingInV6: string[]; extraInV6: string[] };
  teams: { legacy: number; v6: number; missingInV6: string[]; extraInV6: string[] };
  /** Leaf values compared. */
  compared: number;
  /** Accepted differences per divergence rule. */
  accepted: Record<string, number>;
  /** Unaccepted differences, not attributable to any entry's outputPath when `entry` is null. */
  differences: Difference[];
  /** Number of unaccepted differences in total (differences may be truncated). */
  differenceCount: number;
}

export interface CompareOptions {
  set: string;
  rules?: readonly DivergenceRule[];
  pipeline: AnalysisPipelineConfig["pipeline"];
  problems?: PipelineProblem[];
  ran?: number[];
  /**
   * Map a legacy output path to the v6 path that holds the same value, or null to leave it out
   * of the comparison. Used for 2026, where composite ids became grouping (#320, CS-16).
   */
  mapLegacyPath?: (scope: "tmp" | "team", path: string) => string | null;
  /** Keep at most this many differences in the result (default 200). */
  keep?: number;
}

export function compareDatasets(
  legacy: { tmps: Record<string, unknown>[]; teams: Record<string, Record<string, unknown>> },
  v6: Dataset,
  options: CompareOptions,
): Comparison {
  const rules = options.rules ?? loadDivergences();
  const keep = options.keep ?? 200;
  const accepted: Record<string, number> = {};
  const differences: Difference[] = [];
  let differenceCount = 0;
  let compared = 0;

  // Longest outputPath first, so a difference lands on the entry that wrote that part of the tree.
  const owners = options.pipeline
    .map((e, index) => ({ index, type: e.type, path: e.outputPath }))
    .sort((a, b) => b.path.length - a.path.length);
  const perEntry = new Map<number, number>();
  const ownerOf = (scope: "tmp" | "team", path: string): number | null => {
    const owner = owners.find(
      (o) => o.type === scope && (path === o.path || path.startsWith(`${o.path}.`)),
    );
    return owner ? owner.index : null;
  };

  const compareRecords = (
    scope: "tmp" | "team",
    id: string,
    legacyLeaves: Map<string, unknown>,
    v6Leaves: Map<string, unknown>,
  ) => {
    const seen = new Set<string>();
    const check = (path: string, legacyValue: unknown, v6Value: unknown) => {
      compared++;
      if (Object.is(legacyValue, v6Value)) return;
      const rule = acceptingRule(rules, options.set, path, legacyValue, v6Value);
      if (rule) {
        accepted[rule.id] = (accepted[rule.id] ?? 0) + 1;
        return;
      }
      differenceCount++;
      const owner = ownerOf(scope, path);
      if (owner !== null) perEntry.set(owner, (perEntry.get(owner) ?? 0) + 1);
      if (differences.length < keep)
        differences.push({ scope, id, path, legacy: legacyValue, v6: v6Value });
    };
    for (const [original, legacyValue] of legacyLeaves) {
      const { path: legacyPath, applied } = renamed(rules, options.set, original);
      for (const id of applied) accepted[id] = (accepted[id] ?? 0) + 1;
      const path = options.mapLegacyPath ? options.mapLegacyPath(scope, legacyPath) : legacyPath;
      if (path === null) continue;
      seen.add(path);
      check(path, legacyValue, v6Leaves.has(path) ? v6Leaves.get(path) : ABSENT);
    }
    for (const [path, v6Value] of v6Leaves) {
      if (!seen.has(path)) check(path, ABSENT, v6Value);
    }
  };

  // Performances, matched by id.
  const v6Tmps = new Map(v6.tmps.map((t) => [t._id, t]));
  const legacyIds = new Set<string>();
  const missingTmps: string[] = [];
  for (const tmp of legacy.tmps) {
    const id = String(tmp._id);
    legacyIds.add(id);
    const mine = v6Tmps.get(id);
    if (!mine) {
      missingTmps.push(id);
      continue;
    }
    compareRecords("tmp", id, derived(tmp, LEGACY_STORED_FIELDS), derived(mine, V6_STORED_FIELDS));
  }
  const extraTmps = [...v6Tmps.keys()].filter((id) => !legacyIds.has(id));

  // Teams, matched by team key.
  const missingTeams: string[] = [];
  for (const [team, data] of Object.entries(legacy.teams)) {
    const mine = v6.teams[team];
    if (!mine) {
      missingTeams.push(team);
      continue;
    }
    compareRecords("team", team, derived(data, new Set()), derived(mine, new Set()));
  }
  const extraTeams = Object.keys(v6.teams).filter((t) => !(t in legacy.teams));

  const ran = new Set(options.ran ?? options.pipeline.map((_, i) => i));
  const entries: EntryStatus[] = options.pipeline.map((e, index) => {
    const n = perEntry.get(index) ?? 0;
    return {
      index,
      type: e.type,
      name: e.name,
      outputPath: e.outputPath,
      status: !ran.has(index) ? "not-run" : n > 0 ? "differs" : "match",
      differences: n,
    };
  });

  return {
    set: options.set,
    problems: options.problems ?? [],
    entries,
    tmps: {
      legacy: legacy.tmps.length,
      v6: v6.tmps.length,
      missingInV6: missingTmps,
      extraInV6: extraTmps,
    },
    teams: {
      legacy: Object.keys(legacy.teams).length,
      v6: Object.keys(v6.teams).length,
      missingInV6: missingTeams,
      extraInV6: extraTeams,
    },
    compared,
    accepted,
    differences,
    differenceCount,
  };
}

// ---------------------------------------------------------------- running a golden set

export interface SetRun {
  config: MatchScoutingConfig;
  pipeline: AnalysisPipelineConfig;
  dataset: Dataset;
  problems: PipelineProblem[];
  ran: number[];
}

export interface Golden {
  tmps: Record<string, unknown>[];
  teams: Record<string, Record<string, unknown>>;
}

/**
 * A legacy golden value in v6 form, so it can stand in for an entry the engine cannot run yet:
 * NaN, undefined and Infinity become null (DM-1b), and a value a divergence rule covers becomes
 * the value v6 produces instead. Returns undefined when v6 has no value there.
 */
export function legacyToV6(
  value: unknown,
  path: string,
  set: string,
  rules: readonly DivergenceRule[],
): unknown {
  if (Array.isArray(value)) return value.map((v, i) => legacyToV6(v, `${path}.${i}`, set, rules));
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const childPath = renamed(rules, set, `${path}.${key}`).path;
      const converted = legacyToV6(child, childPath, set, rules);
      if (converted !== undefined) out[childPath.slice(childPath.lastIndexOf(".") + 1)] = converted;
    }
    return out;
  }
  const rule = rules.find(
    (r) =>
      r.legacy !== undefined &&
      r.v6 !== ANY &&
      appliesTo(r, set, path) &&
      r.legacy.some((v) => Object.is(v, value)),
  );
  if (rule) return rule.v6 === ABSENT ? undefined : structuredClone(rule.v6);
  return value;
}

/**
 * Fill in the output of an entry the engine cannot run, from the golden file: the entry gets its
 * legacy output at its path.
 */
function feedFromGolden(
  dataset: Dataset,
  entry: AnalysisPipelineConfig["pipeline"][number],
  golden: Golden,
  set: string,
  rules: readonly DivergenceRule[],
): Dataset {
  const fill = (target: Record<string, unknown>, source: Record<string, unknown> | undefined) => {
    if (!source) return;
    const value = getPath(source, entry.outputPath, undefined);
    if (value === undefined) return;
    const converted = legacyToV6(value, entry.outputPath, set, rules);
    if (converted !== undefined) setPath(target, entry.outputPath, converted);
  };
  if (entry.type === "tmp") {
    const byId = new Map(golden.tmps.map((t) => [String(t._id), t]));
    for (const tmp of dataset.tmps) fill(tmp, byId.get(tmp._id));
  } else {
    for (const [team, data] of Object.entries(dataset.teams)) fill(data, golden.teams[team]);
  }
  return dataset;
}

/**
 * Migrate a golden set's legacy input and run the v6 engine over it.
 *
 * With `feed`, every entry the engine cannot run yet gets its output from the golden file
 * instead, so the entries after it are checked on the inputs legacy gave them. That checks each
 * transformer against v5 on its own, whatever order the transformers are written in.
 */
export function runGoldenSet(
  set: GoldenSet,
  registry: TransformerRegistry = createRegistry(),
  feed?: { golden: Golden; rules: readonly DivergenceRule[] },
): SetRun {
  const config = read(join(set.configDir, "match-scouting.json")) as MatchScoutingConfig;
  const pipeline = read(join(set.configDir, "analysis-pipeline.json")) as AnalysisPipelineConfig;
  assertValid("match-scouting", config);
  assertValid("analysis-pipeline", pipeline);

  const migrated = migrate(
    {
      performances: read(set.performances) as V5Performance[],
      events: read(set.events) as V5Event[],
    },
    { config, now: 0 },
  );
  const event = migrated.events.find((e) => e.code === set.event);
  if (!event) throw new Error(`${set.name}: event ${set.event} is not in ${set.events}`);
  const performances = migrated.performances.filter((p) => p.eventId === event._id);

  let dataset = buildDataset(performances, { includeSuperseded: set.includeSuperseded });
  const context = { config };
  if (!feed) {
    const result = runPipeline(dataset, pipeline.pipeline, { registry, context });
    return {
      config,
      pipeline,
      dataset: result.dataset,
      problems: result.problems,
      ran: result.ran,
    };
  }

  const problems: PipelineProblem[] = [];
  const ran: number[] = [];
  pipeline.pipeline.forEach((entry, index) => {
    const { runnable } = checkPipeline([entry], registry);
    const result = runPipeline(dataset, [entry], { registry, context });
    problems.push(...result.problems.map((p) => ({ ...p, index })));
    if (runnable.length > 0) {
      ran.push(index);
      dataset = result.dataset;
    } else {
      dataset = feedFromGolden(dataset, entry, feed.golden, set.name, feed.rules);
    }
  });
  return { config, pipeline, dataset, problems, ran };
}

export function loadGolden(set: GoldenSet): Golden {
  const dir = join("tools", "oracle", "golden", set.name);
  return {
    tmps: read(join(dir, "tmps.json")) as Record<string, unknown>[],
    teams: read(join(dir, "teams.json")) as Record<string, Record<string, unknown>>,
  };
}

export function compareGoldenSet(
  set: GoldenSet,
  options: Pick<CompareOptions, "keep" | "mapLegacyPath" | "rules"> & {
    registry?: TransformerRegistry;
    /** Fill entries the engine cannot run yet from the golden file (see runGoldenSet). */
    feed?: boolean;
  } = {},
): Comparison {
  const golden = loadGolden(set);
  const rules = options.rules ?? loadDivergences();
  const run = runGoldenSet(set, options.registry, options.feed ? { golden, rules } : undefined);
  return compareDatasets(golden, run.dataset, {
    set: set.name,
    pipeline: run.pipeline.pipeline,
    problems: run.problems,
    ran: run.ran,
    rules,
    mapLegacyPath: options.mapLegacyPath,
    keep: options.keep,
  });
}
