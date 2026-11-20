/**
 * Checks that run the pipeline on generated matches (#317; docs/spec/20 §4, CC-9 to CC-12).
 *
 * The generator (T-4) plays matches by the rules of match-scouting.json, with one extra robot
 * whose scouts record nothing (a robot that never did anything), and synthetic TBA data when
 * enrichment is configured. The pipeline runs on that while every path a transformer reads is
 * watched (`observePathReads`), so extension transformers are covered without a list of which
 * option is read from where.
 *
 * - CC-9  A path that no earlier entry writes is an error, and so is an entry that fails.
 * - CC-10 A path a module shows that the pipeline never writes is an error.
 * - CC-11 A value that is 0, null or empty for every performance or team is a warning, reported
 *         once, at the entry where it starts, when something uses it or the entry's whole output
 *         is empty. Values that come from a mistake already reported are not reported again.
 * - CC-12 A ranking (a module `sort`, or what Auto Pick and `percentChanceOfWinning` read) that
 *         the robot that never did anything drops out of, as No Data, is a warning on the entry
 *         whose `ifNone`, `divByZero` or `default` would rank it last (docs/spec/12 F-24).
 *
 * The walk presses buttons at random within the rules, not the way a robot plays, so these are
 * likely mistakes rather than proof; a value that only real matches reveal is not reported.
 */
import {
  buildEnrichedDataset,
  type TbaEnrichment,
  type TbaEventData,
} from "@/analysis/enrichment/tba";
import {
  observePathReads,
  runPipeline,
  type Dataset,
  type PipelineProblem,
  type TransformerRegistry,
} from "@/analysis/engine";
import { PRE_MATCH } from "@/analysis/transformers/periods";
import { generate } from "@/generate/synthetic";
import { generateTba } from "@/generate/synthetic-tba";
import { suggest } from "@/lib/suggest";
import type { AnalysisModulesConfig, AnalysisPipelineConfig, MatchScoutingConfig } from "../types";
import { ActionCatalog, listed, someOf } from "./analysis";
import type { Key } from "./json";
import { describeLocation } from "./locations";
import {
  findReferences,
  moduleOptionsSchema,
  modulesRoot,
  optionNames,
  type Reference,
} from "./references";
import type { Reporter } from "./report";

const PIPELINE = "analysis-pipeline" as const;
const MODULES = "analysis-modules" as const;

/**
 * The generated event: enough matches that a button that can be pressed in a period is pressed
 * there. With 40, rare buttons in short windows (2023's auto placements, counted from a 15 s
 * `actionTimeFilter`) went unpressed and gave false warnings; 120 takes about 0.2 s.
 */
export const GENERATED = { seed: "config:check", matches: 120 } as const;
/** The robot whose scouts record nothing: a team that never did anything. */
export const IDLE_TEAM = "9999";

/** What the report says about the generated event. */
export interface GeneratedSummary {
  matches: number;
  performances: number;
  teams: number;
}

type Kind = "tmp" | "team";
type Nothing = "0" | "null" | "empty" | "false";

interface ReadStat {
  kind: Kind;
  path: string;
  found: number;
  missed: number;
}

interface LeafStat {
  live: boolean;
  nothing: Set<Nothing>;
}

interface Writer {
  index: number;
  kind: Kind;
  outputPath: string;
}

export interface GeneratedCheck {
  ms: MatchScoutingConfig;
  pipeline: AnalysisPipelineConfig;
  /** Entries the schema reported: they do not run. */
  badEntries: ReadonlySet<number>;
  enrichmentValid: boolean;
  /** The modules file, when it passed its schema. */
  modules: AnalysisModulesConfig | null;
  badModules: ReadonlySet<number>;
  registry: TransformerRegistry;
  report: Reporter;
}

// ---------------------------------------------------------------------------- small helpers

/** The value at a dot path, without telling the read observer. */
function valueAt(obj: unknown, path: string): unknown {
  let current = obj;
  for (const key of path === "" ? [] : path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function nothingIn(v: unknown): Nothing | null {
  if (v === null || v === undefined) return "null";
  if (v === 0) return "0";
  if (v === false) return "false";
  if (v === "") return "empty";
  if (Array.isArray(v)) return v.length === 0 ? "empty" : null;
  if (typeof v === "object") return Object.keys(v).length === 0 ? "empty" : null;
  return null;
}

/** Visit every leaf of a value: numbers, strings, lists, and empty objects. */
function eachLeaf(value: unknown, suffix: string, visit: (suffix: string, v: unknown) => void) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length > 0) {
      for (const k of keys) {
        eachLeaf((value as Record<string, unknown>)[k], suffix ? `${suffix}.${k}` : k, visit);
      }
      return;
    }
  }
  visit(suffix, value);
}

const join = (base: string, suffix: string) => (suffix ? `${base}.${suffix}` : base);
const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}.`);

function describeNothing(set: ReadonlySet<Nothing>): string {
  const words: Record<Nothing, string> = {
    "0": "0",
    null: "null (No Data)",
    empty: "empty",
    false: "false",
  };
  const order: Nothing[] = ["0", "null", "empty", "false"];
  return order
    .filter((n) => set.has(n))
    .map((n) => (set.size === 1 ? words[n] : n))
    .join(" or ");
}

/** Every path (not only leaves) in a sample of objects, for "did you mean". */
function knownPaths(objects: readonly unknown[]): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, prefix: string, depth: number) => {
    if (v === null || typeof v !== "object" || Array.isArray(v) || depth > 6) return;
    for (const [k, child] of Object.entries(v)) {
      const path = prefix ? `${prefix}.${k}` : k;
      out.add(path);
      walk(child, path, depth + 1);
    }
  };
  for (const o of objects.slice(0, 12)) walk(o, "", 0);
  return [...out];
}

/** Where `target` appears in `value`, as a string value or as a property name. */
function locate(value: unknown, target: string, at: Key[]): { keys: Key[]; property: boolean }[] {
  const out: { keys: Key[]; property: boolean }[] = [];
  const walk = (v: unknown, keys: Key[]) => {
    if (typeof v === "string") {
      if (v === target) out.push({ keys, property: false });
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, [...keys, i]));
    } else if (v !== null && typeof v === "object") {
      for (const [k, child] of Object.entries(v)) {
        if (k === target) out.push({ keys: [...keys, k], property: true });
        walk(child, [...keys, k]);
      }
    }
  };
  walk(value, at);
  return out;
}

/**
 * The path probably meant: a sibling with a similar name ("counts.scoreL4" for "counts.scorel4"),
 * else the same last part somewhere else ("counts.missCoral" for "averages.missCoral").
 */
function nearPath(
  path: string,
  known: readonly string[],
): { path: string; sibling: boolean } | undefined {
  const cut = path.lastIndexOf(".");
  const parent = cut < 0 ? "" : path.slice(0, cut);
  const last = path.slice(cut + 1);
  const siblings = known.filter(
    (k) => k.lastIndexOf(".") === cut && (cut < 0 || k.startsWith(`${parent}.`)),
  );
  const near = suggest(
    last,
    siblings.map((k) => k.slice(cut + 1)),
  );
  if (near) return { path: parent ? `${parent}.${near}` : near, sibling: true };
  const elsewhere = known.find((k) => k !== path && (k === last || k.endsWith(`.${last}`)));
  return elsewhere ? { path: elsewhere, sibling: false } : undefined;
}

// ---------------------------------------------------------------------------- the run

interface Observed {
  dataset: Dataset;
  problems: PipelineProblem[];
  /** Index in the pipeline file of each entry that was passed to the runner. */
  ran: number[];
  reads: Map<number, Map<string, ReadStat>>;
  /** Reads on the idle robot's performances and team object, with what was there. */
  idleReads: Map<number, { kind: Kind; path: string; value: unknown }[]>;
  /** Per entry: each leaf of its output (by suffix) over every performance or team but the idle one. */
  leaves: Map<number, Map<string, LeafStat>>;
  writers: Writer[];
  /** Action ids recorded in the generated matches, and where. */
  recorded: Map<string, { phases: Set<string>; segments: Set<string>; kinds: Set<string> }>;
  summary: GeneratedSummary;
}

const OFF: TbaEnrichment = {
  scoreBreakdown: { enabled: false, prefixes: [], knownIds: [] },
  componentOprs: [],
};

function observe(check: GeneratedCheck): Observed {
  const { ms, pipeline, badEntries, enrichmentValid, registry } = check;
  const generated = generate({
    config: ms,
    seed: GENERATED.seed,
    matches: GENERATED.matches,
    idleTeams: [IDLE_TEAM],
  });
  const enrichment = enrichmentValid ? pipeline.enrichment.tba : OFF;
  const tba: TbaEventData | null =
    enrichment.scoreBreakdown.enabled || enrichment.componentOprs.length > 0
      ? generateTba(generated.performances, {
          enrichment,
          seed: GENERATED.seed,
          idleTeams: [IDLE_TEAM],
        })
      : null;
  const dataset = buildEnrichedDataset(generated.performances, enrichment, tba);

  const ran = pipeline.pipeline.map((_, i) => i).filter((i) => !badEntries.has(i));
  const entries = ran.map((i) => pipeline.pipeline[i]);

  const reads = new Map<number, Map<string, ReadStat>>();
  const idleReads = new Map<number, { kind: Kind; path: string; value: unknown }[]>();
  const leaves = new Map<number, Map<string, LeafStat>>();
  const writers: Writer[] = [];
  let current = -1;
  let kindOf = new Map<unknown, Kind>();
  let idle = new Set<unknown>();

  const index = (d: Dataset) => {
    kindOf = new Map();
    idle = new Set();
    for (const t of d.tmps) {
      kindOf.set(t, "tmp");
      if (t.team === IDLE_TEAM) idle.add(t);
    }
    for (const [team, data] of Object.entries(d.teams)) {
      kindOf.set(data, "team");
      if (team === IDLE_TEAM) idle.add(data);
    }
  };

  const result = observePathReads(
    (target, path, value) => {
      const kind = kindOf.get(target);
      if (current < 0 || !kind) return;
      let byPath = reads.get(current);
      if (!byPath) reads.set(current, (byPath = new Map()));
      const key = `${kind} ${path}`;
      const stat = byPath.get(key) ?? { kind, path, found: 0, missed: 0 };
      if (value === undefined) stat.missed++;
      else stat.found++;
      byPath.set(key, stat);
      if (idle.has(target)) {
        const list = idleReads.get(current) ?? [];
        list.push({ kind, path, value });
        idleReads.set(current, list);
      }
    },
    () =>
      runPipeline(dataset, entries, {
        registry,
        context: { config: ms },
        beforeEntry: (i, d) => {
          index(d);
          current = ran[i];
        },
        afterEntry: (i, d) => {
          current = -1;
          const entry = entries[i];
          const kind: Kind = entry.type;
          writers.push({ index: ran[i], kind, outputPath: entry.outputPath });
          const stats = new Map<string, LeafStat>();
          const objects = kind === "tmp" ? d.tmps : Object.values(d.teams);
          for (const o of objects) {
            if (idle.has(o)) continue;
            eachLeaf(valueAt(o, entry.outputPath), "", (suffix, v) => {
              const stat = stats.get(suffix) ?? { live: false, nothing: new Set<Nothing>() };
              const n = nothingIn(v);
              if (n === null) stat.live = true;
              else stat.nothing.add(n);
              stats.set(suffix, stat);
            });
          }
          leaves.set(ran[i], stats);
        },
      }),
  );

  const recorded = new Map<
    string,
    { phases: Set<string>; segments: Set<string>; kinds: Set<string> }
  >();
  for (const tmp of result.dataset.tmps) {
    if (tmp.team === IDLE_TEAM) continue;
    for (const a of tmp.actions) {
      const r = recorded.get(a.id) ?? { phases: new Set(), segments: new Set(), kinds: new Set() };
      r.phases.add(a.phase ?? PRE_MATCH);
      if (a.segment) r.segments.add(a.segment);
      if (a.segmentKind) r.kinds.add(a.segmentKind);
      recorded.set(a.id, r);
    }
  }

  return {
    dataset: result.dataset,
    problems: result.problems.map((p) => ({ ...p, index: ran[p.index] })),
    ran,
    reads,
    idleReads,
    leaves,
    writers,
    recorded,
    summary: {
      matches: generated.report.matches,
      performances: result.dataset.tmps.length,
      teams: Object.keys(result.dataset.teams).length,
    },
  };
}

// ---------------------------------------------------------------------------- the checks

/**
 * Run the pipeline on generated matches and report what it shows. Returns what the report says
 * about the generated event, or null when nothing could run.
 */
export function checkOnGeneratedMatches(check: GeneratedCheck): GeneratedSummary | null {
  const { ms, pipeline, modules, badModules, registry, report } = check;
  const o = observe(check);
  const entryAt = (i: number) => pipeline.pipeline[i];
  const entryName = (i: number) => describeLocation(PIPELINE, pipeline, ["pipeline", i]);
  const moduleName = (i: number) => describeLocation(MODULES, modules, ["modules", i]);
  const noun = (kind: Kind, n = 2) =>
    kind === "tmp" ? (n === 1 ? "performance" : "performances") : n === 1 ? "team" : "teams";
  const catalog = new ActionCatalog(ms, check.enrichmentValid ? pipeline : null);

  /** Entries with a finding already: what follows from them is not reported again. */
  const flagged = new Set<number>();
  for (const f of report.findings) {
    if (f.file === PIPELINE && f.keys[0] === "pipeline" && typeof f.keys[1] === "number") {
      flagged.add(f.keys[1]);
    }
  }
  const flaggedModules = new Set<number>(badModules);
  for (const f of report.findings) {
    if (f.file === MODULES && f.keys[0] === "modules" && typeof f.keys[1] === "number") {
      flaggedModules.add(f.keys[1]);
    }
  }

  // Everyone but the robot that never did anything.
  const others: Record<Kind, unknown[]> = {
    tmp: o.dataset.tmps.filter((t) => t.team !== IDLE_TEAM),
    team: Object.entries(o.dataset.teams)
      .filter(([team]) => team !== IDLE_TEAM)
      .map(([, data]) => data),
  };
  const objectsOf = (kind: Kind) => others[kind];
  const pathsByKind: Record<Kind, string[]> = {
    tmp: knownPaths(objectsOf("tmp")),
    team: knownPaths(objectsOf("team")),
  };
  const exists = (kind: Kind, path: string) =>
    objectsOf(kind).some((x) => valueAt(x, path) !== undefined);
  /** The last entry before `before` that writes `path` (or an object holding it) on `kind`. */
  const producer = (kind: Kind, path: string, before = Infinity): Writer | undefined => {
    let found: Writer | undefined;
    for (const w of o.writers) {
      if (w.index < before && w.kind === kind && under(path, w.outputPath)) found = w;
    }
    return found;
  };

  // CC-9: paths no earlier entry writes.
  const unproduced = new Set<number>();
  for (const i of o.ran) {
    const misses = [...(o.reads.get(i)?.values() ?? [])].filter((r) => r.found === 0);
    if (misses.length === 0) continue;
    unproduced.add(i);
    reportUnproduced(i, misses);
  }

  // CC-9: entries that failed while running.
  for (const p of o.problems) {
    if (p.stage !== "run" || flagged.has(p.index) || unproduced.has(p.index)) continue;
    const kind: Kind = entryAt(p.index).type;
    report.error(
      PIPELINE,
      ["pipeline", p.index],
      p.failed
        ? `On the generated matches this entry failed for ${p.failed.count} of ${p.failed.of} ${noun(kind, p.failed.of)} (first: ${p.failed.first}): ${p.message}`
        : `On the generated matches this entry failed: ${p.message}`,
      "The generated matches follow match-scouting.json, so real matches would fail the same way; check this entry's options and the values it reads.",
    );
    flagged.add(p.index);
  }
  for (const i of unproduced) flagged.add(i);

  // CC-10: what modules show.
  const moduleRefs = modules ? collectModuleRefs(modules, flaggedModules) : [];
  const missingModulePaths = new Set<string>();
  for (const { ref, implicit } of moduleRefs) {
    if (ref.kind === "itemPath") continue;
    const kind: Kind = ref.kind === "performancePath" ? "tmp" : "team";
    if (kind === "team" && under(ref.id, "manual")) continue; // manual data (docs/spec/03 DM-14)
    if (exists(kind, ref.id)) continue;
    missingModulePaths.add(JSON.stringify(ref.keys));
    const what = kind === "team" ? "team value" : "value of each match";
    report.error(
      MODULES,
      ref.keys,
      implicit
        ? `${implicit} reads the team value "${ref.id}", which analysis-pipeline.json never writes.`
        : `analysis-pipeline.json never writes the ${what} "${ref.id}", so this module would always show No Data.`,
      pathHint(kind, ref.id, Infinity),
    );
  }
  for (const { module: mi, ref } of moduleRefs) {
    if (ref.kind !== "itemPath") continue;
    // The item path is inside each item of the list a sibling option names.
    const parent = JSON.stringify(ref.keys.slice(0, -1));
    const list = moduleRefs.find(
      (r) =>
        r.module === mi &&
        r.ref.kind === "path" &&
        JSON.stringify(r.ref.keys.slice(0, -1)) === parent,
    );
    if (!list || missingModulePaths.has(JSON.stringify(list.ref.keys))) continue;
    const items = objectsOf("team").flatMap((t) => {
      const v = valueAt(t, list.ref.id);
      return Array.isArray(v) ? v : [];
    });
    if (items.length === 0 || items.some((item) => valueAt(item, ref.id) !== undefined)) continue;
    report.warning(
      MODULES,
      ref.keys,
      `No item of "${list.ref.id}" has "${ref.id}" in the generated matches, so this module would have nothing to show.`,
      `Check the path, and that the buttons whose actions it lists record it (a "position" executable records "other.pos").`,
    );
  }

  // CC-11: values that are 0, null or empty for everyone.
  checkEmptyValues(moduleRefs.filter((r) => r.ref.kind !== "itemPath"));

  // CC-12: rankings a team that never did anything drops out of.
  checkRankings(moduleRefs);

  return o.summary;

  // -------------------------------------------------------------------------- CC-9 detail

  /** What to try for a path nothing writes; `before` is the reading entry, or Infinity for a module. */
  function pathHint(kind: Kind, path: string, before: number): string {
    if (kind === "tmp" && /^actionQueue(\.|$)/.test(path)) {
      return 'v5 called the list of actions "actionQueue"; v6 calls it "actions" (docs/spec/21 DV-11).';
    }
    const other: Kind = kind === "tmp" ? "team" : "tmp";
    const later = o.writers.find(
      (w) =>
        w.index >= before &&
        w.kind === kind &&
        (under(path, w.outputPath) || under(w.outputPath, path)),
    );
    if (later) {
      return `${capitalize(entryName(later.index))} writes it, but entries run in order: move this entry below that one.`;
    }
    if (exists(other, path)) {
      const writer = producer(other, path);
      const by = writer ? ` (${entryName(writer.index)} writes it)` : "";
      const reader = before === Infinity ? "this module shows" : "a tmp entry reads";
      return kind === "team"
        ? `"${path}" is a value of each match${by}, and team entries and modules read the team's values. Combine it per team first, with a team entry such as average whose "path" is "${path}".`
        : `"${path}" is a team value${by}; ${reader} the values of each match.`;
    }
    const v5 = catalog.pathHint([path]);
    if (v5) return v5;
    const near = nearPath(path, pathsByKind[kind]);
    if (!near) return "";
    if (near.sibling) return `Did you mean "${near.path}"?`;
    const cut = path.lastIndexOf(".");
    return cut < 0
      ? `Did you mean "${near.path}"?`
      : `"${path.slice(0, cut)}" has no "${path.slice(cut + 1)}", but there is a ${kind === "team" ? "team value" : "value of each match"} "${near.path}".`;
  }

  function reportUnproduced(i: number, misses: ReadStat[]): void {
    const entry = entryAt(i);
    const groups = new Map<string, { keys: Key[]; focus: Key[]; misses: ReadStat[] }>();
    for (const miss of misses) {
      const found = locate(entry.options ?? {}, miss.path, ["pipeline", i, "options"]);
      const first = found[0];
      const keys = first
        ? first.property || typeof first.keys[first.keys.length - 1] === "number"
          ? first.keys.slice(0, -1)
          : first.keys
        : (["pipeline", i] as Key[]);
      const key = JSON.stringify(keys);
      const group = groups.get(key) ?? { keys, focus: first?.keys ?? keys, misses: [] };
      group.misses.push(miss);
      groups.set(key, group);
    }
    for (const { keys, focus, misses: group } of groups.values()) {
      const paths = group.map((m) => m.path);
      const kinds = new Set(group.map((m) => m.kind));
      const on = kinds.size === 1 ? ` on any ${noun(group[0].kind, 1)}` : "";
      const message =
        paths.length === 1
          ? `No earlier entry writes "${paths[0]}", so this entry finds nothing there${on}.`
          : `${paths.length} paths are written by no earlier entry, so this entry finds nothing there${on}: ${someOf(paths)}.`;
      const v5 = catalog.pathHint(paths);
      let hint = v5;
      if (!hint) {
        const hints = [...new Set(group.map((m) => pathHint(m.kind, m.path, i)).filter(Boolean))];
        const means = hints.filter((h) => h.startsWith("Did you mean "));
        const rest = hints.filter((h) => !h.startsWith("Did you mean "));
        if (means.length > 1) {
          rest.push(
            `Did you mean ${listed(means.map((h) => h.slice(13, -1).replace(/^"|"$/g, "")))}?`,
          );
        } else rest.push(...means);
        hint = rest.slice(0, 2).join(" ");
      }
      report.error(PIPELINE, keys, message, hint || undefined, focus);
    }
  }

  // -------------------------------------------------------------------------- CC-11 detail

  function checkEmptyValues(refs: ModuleRef[]): void {
    const key = (kind: Kind, path: string) => `${kind} ${path}`;
    /**
     * Every leaf written, with whether it holds anything; an empty one also records the entry
     * where it starts (`root`) and that entry's own value it comes from (`source`).
     */
    type Origin = { root: number; source: string };
    const all = new Map<string, { kind: Kind; path: string; stat: LeafStat } & Origin>();
    /** Per path prefix: whether any leaf under it is live, and where the first empty one starts. */
    const prefixes = new Map<string, { live: boolean; origin: Origin | null }>();

    const deadInput = (kind: Kind, path: string): Origin | null => {
      const leaf = all.get(key(kind, path));
      if (leaf) return leaf.stat.live ? null : leaf;
      const p = prefixes.get(key(kind, path));
      return p && !p.live ? p.origin : null;
    };

    for (const i of o.ran) {
      const stats = o.leaves.get(i);
      if (!stats) continue;
      const entry = entryAt(i);
      const kind: Kind = entry.type;
      const inputs = [...(o.reads.get(i)?.values() ?? [])];
      for (const [suffix, stat] of stats) {
        const path = join(entry.outputPath, suffix);
        let origin: Origin = { root: i, source: path };
        if (!stat.live && !flagged.has(i)) {
          for (const r of inputs) {
            const from =
              deadInput(r.kind, r.path) ??
              (suffix ? deadInput(r.kind, join(r.path, suffix)) : null);
            if (from !== null) {
              origin = { root: from.root, source: from.source };
              break;
            }
          }
        }
        all.set(key(kind, path), { kind, path, stat, ...origin });
        const parts = path.split(".");
        for (let n = 1; n <= parts.length; n++) {
          const prefix = key(kind, parts.slice(0, n).join("."));
          const p = prefixes.get(prefix) ?? { live: false, origin: null };
          if (stat.live) p.live = true;
          else p.origin ??= origin;
          prefixes.set(prefix, p);
        }
      }
    }

    /** Per root entry: the empty values something uses, and who uses them. */
    const used = new Map<number, { paths: Set<string>; users: Set<string> }>();
    const markUsed = (kind: Kind, path: string, user: string) => {
      const leaf = all.get(key(kind, path));
      const p = prefixes.get(key(kind, path));
      if (leaf ? leaf.stat.live : !p || p.live) return;
      for (const l of all.values()) {
        if (l.kind !== kind || l.stat.live || !under(l.path, path)) continue;
        const u = used.get(l.root) ?? { paths: new Set(), users: new Set() };
        u.paths.add(l.source);
        u.users.add(l.path === l.source ? user : `${user} via "${l.path}"`);
        used.set(l.root, u);
      }
    };
    for (const i of o.ran) {
      for (const r of o.reads.get(i)?.values() ?? []) {
        if (r.found > 0) markUsed(r.kind, r.path, entryName(i));
      }
    }
    for (const { module: mi, ref } of refs) {
      markUsed(ref.kind === "performancePath" ? "tmp" : "team", ref.id, moduleName(mi));
    }

    for (const i of o.ran) {
      if (flagged.has(i)) continue;
      const stats = o.leaves.get(i);
      if (!stats || stats.size === 0) continue;
      const entry = entryAt(i);
      const kind: Kind = entry.type;
      // The entry's own empty values (not those of later entries that start here).
      const mine = [...all.values()].filter(
        (l) => l.root === i && !l.stat.live && l.source === l.path,
      );
      if (mine.length === 0) continue;
      const whole = [...stats.values()].every((s) => !s.live);
      const u = used.get(i);
      if (!whole && !u) continue;
      const nothing = new Set<Nothing>();
      const shown = whole ? mine : mine.filter((l) => u?.paths.has(l.path));
      for (const l of shown) for (const n of l.stat.nothing) nothing.add(n);
      const what = describeNothing(nothing);
      const count =
        kind === "tmp" ? o.summary.performances - idleCount("tmp") : o.summary.teams - 1;
      const everyone = `every one of the ${count} ${noun(kind)} in ${o.summary.matches} generated matches`;
      const users = u ? [...u.users].filter((x) => x !== entryName(i)) : [];
      const readers =
        users.length <= 2
          ? users.join(" and ")
          : `${users.slice(0, 2).join(", ")} and ${users.length - 2} more`;
      const verb = users.length === 1 ? "reads" : "read";
      let message: string;
      if (whole) {
        message = `"${entry.outputPath}" is ${what} for ${everyone}.`;
        if (readers) message += ` ${capitalize(readers)} ${verb} it.`;
      } else if (shown.length === 1) {
        message = `"${shown[0].path}" is ${what} for ${everyone}, yet ${readers} ${verb} it.`;
      } else {
        message = `${shown.length} values this entry writes are ${what} for ${everyone}, yet ${readers} ${verb} them: ${someOf(shown.map((l) => l.path))}.`;
      }
      report.warning(
        PIPELINE,
        ["pipeline", i],
        message,
        emptyHint(
          i,
          shown.map((l) => l.path),
        ),
      );
    }
  }

  function idleCount(kind: Kind): number {
    return kind === "tmp" ? o.dataset.tmps.filter((t) => t.team === IDLE_TEAM).length : 1;
  }

  /** Why an entry's values may be empty: where the buttons it names were recorded. */
  function emptyHint(i: number, paths: string[]): string {
    const entry = entryAt(i);
    const transformer = registry.get(entry.type, entry.name);
    const refs = transformer
      ? findReferences(entry.options ?? {}, transformer.optionsSchema, [])
      : [];
    const named = [...new Set(refs.filter((r) => r.kind === "action").map((r) => r.id))];
    const lasts = [...new Set(paths.map((p) => p.split(".").pop() ?? p))];
    // The buttons behind the empty values: those the entry names, or, for a count of every
    // button, the ids the empty values are named after.
    const ids = named.some((id) => lasts.includes(id))
      ? named.filter((id) => lasts.includes(id))
      : named.length > 0
        ? named
        : lasts.filter((id) => catalog.isKnown(id));
    const filters = {
      phases: refs.filter((r) => r.kind === "phase").map((r) => r.id),
      segments: refs.filter((r) => r.kind === "segment").map((r) => r.id),
      kinds: refs.filter((r) => r.kind === "kind").map((r) => r.id),
    };
    const parts: string[] = [];
    const list = entry.options?.actionArrayPath;
    for (const id of ids.slice(0, 3)) {
      const r = o.recorded.get(id);
      if (!r) {
        parts.push(`"${id}" was never recorded in the generated matches.`);
        continue;
      }
      const before = parts.length;
      for (const [name, word] of [
        ["phases", "phase"],
        ["segments", "segment"],
        ["kinds", "kind"],
      ] as const) {
        const wanted = filters[name];
        const seen = [...r[name]];
        if (wanted.length > 0 && !wanted.some((w) => r[name].has(w))) {
          parts.push(
            seen.length > 0
              ? `In the generated matches "${id}" was recorded only in ${word}${seen.length === 1 ? "" : "s"} ${listed(seen)}, never in ${listed(wanted)}.`
              : `In the generated matches "${id}" was never recorded in a ${word}.`,
          );
          break;
        }
      }
      if (parts.length === before && typeof list === "string" && list !== "actions") {
        parts.push(
          `In the generated matches "${id}" was recorded, but never in "${list}", the list this entry reads.`,
        );
      }
    }
    parts.push(
      ids.length > 0
        ? "The generated matches press what match-scouting.json shows on screen at each moment, so check this entry's options and which layers show these buttons when."
        : "Check this entry's options and the values it reads.",
    );
    return parts.join(" ");
  }

  // -------------------------------------------------------------------------- CC-12 detail

  function checkRankings(refs: ModuleRef[]): void {
    const idleTeam = o.dataset.teams[IDLE_TEAM];
    if (!idleTeam) return;
    const blamed = new Map<
      number,
      { option: string | null; rankings: { module: number; path: string; sort: number }[] }
    >();
    const unexplained: { ref: ModuleRef; producer: number | null }[] = [];

    for (const ref of refs) {
      if (ref.sort === 0 || ref.ref.kind !== "path") continue;
      if (missingModulePaths.has(JSON.stringify(ref.ref.keys))) continue;
      const value = valueAt(idleTeam, ref.ref.id);
      if (value !== null) continue;
      const blame = walk("team", ref.ref.id, new Set());
      if (blame === "skip") continue;
      if (blame === null || blame.option === null) {
        unexplained.push({ ref, producer: blame?.index ?? null });
        continue;
      }
      const b = blamed.get(blame.index) ?? { option: blame.option, rankings: [] };
      b.rankings.push({ module: ref.module, path: ref.ref.id, sort: ref.sort });
      blamed.set(blame.index, b);
    }

    for (const [index, { option, rankings }] of blamed) {
      const [first] = rankings;
      const byModule = new Map<number, string[]>();
      for (const r of rankings) byModule.set(r.module, [...(byModule.get(r.module) ?? []), r.path]);
      const where = [...byModule]
        .map(([m, paths]) => {
          const unique = [...new Set(paths)];
          return `the ranking${unique.length === 1 ? "" : "s"} by ${someOf(unique, 3)} in ${moduleName(m)}`;
        })
        .join(" and ");
      const worst =
        first.sort > 0
          ? "The ranking puts higher values first, so the worst value is a low one, such as 0."
          : `The ranking puts lower values first, so the worst value is a high one, such as the full match time (${ms.timing.totalMs}) for a time.`;
      report.warning(
        PIPELINE,
        ["pipeline", index],
        `A team that never does this gets null ("No Data") here, so it drops out of ${where} instead of ranking last.`,
        `Set "${option}" to the worst value on purpose so such a team ranks last. ${worst} Leave it unset only when "never did it" really means "unknown" (docs/spec/12 F-24).`,
      );
    }
    for (const { ref, producer: p } of unexplained) {
      report.warning(
        MODULES,
        ref.ref.keys,
        `A team that never did anything has no value for "${ref.ref.id}" ("No Data"), so it drops out of this ranking instead of ranking last.`,
        p !== null
          ? `${capitalize(entryName(p))} writes null for such a team. Give it a value for "nothing to count", or rank by a value that has one.`
          : undefined,
      );
    }
  }

  /**
   * The entry closest to a ranking that writes null for the team that never did anything and
   * could write a value instead: its transformer takes `ifNone`, `divByZero` or `default`.
   */
  function walk(
    kind: Kind,
    path: string,
    seen: Set<string>,
  ): { index: number; option: string | null } | "skip" | null {
    const at = `${kind} ${path}`;
    if (seen.has(at)) return null;
    seen.add(at);
    const w = producer(kind, path);
    if (!w) return null;
    if (flagged.has(w.index)) return "skip";
    const entry = entryAt(w.index);
    const transformer = registry.get(entry.type, entry.name);
    const takes = transformer
      ? optionNames(transformer.optionsSchema).find((n) =>
          ["ifNone", "divByZero", "default"].includes(n),
        )
      : undefined;
    const options = entry.options ?? {};
    if (takes && !(takes in options)) return { index: w.index, option: takes };
    if (takes && options[takes] === null) return "skip"; // null on purpose
    for (const r of o.idleReads.get(w.index) ?? []) {
      if (r.value !== null && r.value !== undefined) continue;
      const deeper = walk(r.kind, r.path, seen);
      if (deeper !== null) return deeper;
    }
    return { index: w.index, option: null };
  }
}

// ---------------------------------------------------------------------------- module paths

interface ModuleRef {
  module: number;
  ref: Reference;
  /** 1 or -1 when the module ranks teams by this path, else 0. */
  sort: number;
  /** For a path the module reads without naming it: what reads it. */
  implicit?: string;
}

function collectModuleRefs(modules: AnalysisModulesConfig, skip: ReadonlySet<number>): ModuleRef[] {
  const out: ModuleRef[] = [];
  modules.modules.forEach((m, i) => {
    if (skip.has(i)) return;
    const schema = moduleOptionsSchema(m.module);
    if (!schema) return;
    const keys: Key[] = ["modules", i, "options"];
    for (const ref of findReferences(m.options, schema, keys, modulesRoot)) {
      if (ref.kind !== "path" && ref.kind !== "performancePath" && ref.kind !== "itemPath")
        continue;
      const parent = valueAt(m.options, ref.keys.slice(3, -1).join(".")) as
        Record<string, unknown> | undefined;
      const sort = parent && (parent.sort === 1 || parent.sort === -1) ? parent.sort : 0;
      out.push({ module: i, ref, sort });
    }
    // Win probability (Simulate Match, Auto Pick: docs/spec/08 AN-23, AN-24) reads two team values.
    if (m.module === "SingleDisplay" && m.options.aggrMethod === "percentChanceOfWinning") {
      for (const id of ["averageScores.total", "standardDeviation"]) {
        out.push({
          module: i,
          ref: { kind: "path", id, keys: [...keys, "aggrMethod"] },
          sort: 1,
          implicit: '"percentChanceOfWinning"',
        });
      }
    }
  });
  return out;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
