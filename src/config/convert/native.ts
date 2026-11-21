/**
 * Native ids and paths for a configuration that recorded composite ids (CS-16, docs/spec/20 §2.2,
 * #320).
 *
 * v5 put the period in front of the button id when it recorded an action (SC-23), so a v1
 * pipeline named one id per period (`activeShift1StopShooting`) and read one count per period
 * (`counts.autoRatingPassing1`). v6 actions carry the button id, with the period as fields
 * (DV-1). In native form:
 *
 * - an id list names button ids, with a period filter covering the periods its ids named;
 * - `countActions(all)` groups its counts by period (`by: "segment"`), so a path into its output
 *   names the period and then the button (`counts.auto.RatingPassing1`, `counts.active1.Defense`);
 * - a TBA score-breakdown id keeps its name, under the phase its prefix belongs to
 *   (`counts.endgame.endGameTowerRobot_Level3`);
 * - a button recorded before the match started had no prefix; its count is under `preMatch`.
 *
 * Everything comes from the configuration's own prefixes, the table the migration splits
 * recorded ids with (`splitActionId`), never from a hand-written list. The 2026 oracle
 * comparison maps legacy output paths with the same functions (tools/oracle/translate.ts).
 */
import { builtInOptions } from "@/analysis/engine/registry";
import {
  configuredPeriods,
  groupKey,
  hasPeriodFilter,
  passesFilter,
  PRE_MATCH,
  type PeriodFilter,
} from "@/analysis/transformers/periods";
import { splitActionId, type Placement } from "@/data/phase";
import { findReferences, moduleOptionsSchema, modulesRoot } from "../check/references";
import type { Key } from "../check/json";
import { derivePrefixes } from "../knownActionIds";
import type { MatchScoutingConfig, ModuleEntry, PipelineEntry } from "../types";

/** Whether the configuration records composite ids: some phase, segment or kind has a prefix. */
export function usesPrefixes(ms: MatchScoutingConfig): boolean {
  return derivePrefixes(ms).some((p) => p !== "");
}

// ---------------------------------------------------------------------------- ids

/** A composite id split into the button and the period it was recorded in. */
export interface CompositeId {
  button: string;
  period: Placement;
  /** The period's key in a count grouped by segment (`auto`, `transition`, `active1`). */
  key: string;
}

export interface NativeIds {
  ms: MatchScoutingConfig;
  /** TBA score-breakdown prefixes and the phase each one's actions are in (#315). */
  scoreBreakdown: readonly { prefix: string; phase: string }[];
  /**
   * Ids recorded without a prefix, so before the match started: their count is under
   * `preMatch`. The converter lists the action buttons; the oracle also lists the ids v5 started
   * at 0 without recording them (every layout button, and `extraActionIds`).
   */
  plainIds: ReadonlySet<string>;
  /** The composite id split, or null when no prefix + button combination explains it. */
  split(id: string): CompositeId | null;
}

export function nativeIds(
  ms: MatchScoutingConfig,
  scoreBreakdown: NativeIds["scoreBreakdown"],
  plainIds: Iterable<string>,
): NativeIds {
  const cache = new Map<string, CompositeId | null>();
  const split = (id: string): CompositeId | null => {
    let found = cache.get(id);
    if (found === undefined) {
      const s = splitActionId(ms, id);
      const period: Placement = {
        phase: s.phase,
        segment: s.segment,
        segmentKind: s.segmentKind,
        segmentIndex: s.segmentIndex,
      };
      found =
        s.known && s.phase !== null && s.baseId !== id
          ? { button: s.baseId, period, key: groupKey(period, "segment") }
          : null;
      cache.set(id, found);
    }
    return found;
  };
  return { ms, scoreBreakdown, plainIds: new Set(plainIds), split };
}

/** Where the count of a recorded id is in a count grouped by segment, or null for no id. */
export function countSlot(ids: NativeIds, id: string): { key: string; id: string } | null {
  const composite = ids.split(id);
  if (composite) return { key: composite.key, id: composite.button };
  const tba = ids.scoreBreakdown.find((p) => id.startsWith(p.prefix) && id.includes("_"));
  if (tba) return { key: tba.phase, id };
  if (ids.plainIds.has(id)) return { key: PRE_MATCH, id };
  return null;
}

/**
 * A path into a count grouped by segment, with its id segment split into period and button
 * (`counts.autoRatingPassing1` → `counts.auto.RatingPassing1`). `roots` are the outputs of such
 * counts; any other path, and one whose next segment is no id, is returned unchanged.
 */
export function nativeCountPath(ids: NativeIds, roots: Iterable<string>, path: string): string {
  const root = [...roots].sort((a, b) => b.length - a.length).find((r) => path.startsWith(`${r}.`));
  if (root === undefined) return path;
  const rest = path.slice(root.length + 1);
  const dot = rest.indexOf(".");
  const segment = dot === -1 ? rest : rest.slice(0, dot);
  const slot = countSlot(ids, segment);
  return slot ? `${root}.${slot.key}.${slot.id}${dot === -1 ? "" : rest.slice(dot)}` : path;
}

// ---------------------------------------------------------------------------- period filters

const unique = <T>(values: Iterable<T>): T[] => [...new Set(values)];

/**
 * The simplest period filter admitting every period in `periods`, and the keys of the periods
 * it admits beyond them. A filter lists phases, segments and kinds, not repeat indexes, so
 * `active1` and `active2` admit `active3` and `active4` too.
 */
export function periodFilterFor(
  ms: MatchScoutingConfig,
  periods: readonly Placement[],
): { filter: PeriodFilter; added: string[] } {
  const all = configuredPeriods(ms);
  const inOrder = <K extends keyof Placement>(field: K) =>
    unique(all.map((p) => p[field]).filter((v) => periods.some((q) => q[field] === v))) as string[];
  let filter: PeriodFilter = { phases: inOrder("phase") };
  if (periods.every((p) => p.segment !== null)) filter.segments = inOrder("segment");
  if (periods.every((p) => p.segmentKind !== null)) filter.kinds = inOrder("segmentKind");

  const admitted = (f: PeriodFilter) =>
    unique(all.filter((p) => passesFilter(p, f)).map((p) => groupKey(p, "segment")));
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i]);
  for (const field of ["phases", "segments"] as const) {
    if (!filter[field]) continue;
    const rest = { ...filter };
    delete rest[field];
    if (hasPeriodFilter(rest) && same(admitted(rest), admitted(filter))) filter = rest;
  }
  const named = new Set(periods.map((p) => groupKey(p, "segment")));
  return { filter, added: admitted(filter).filter((k) => !named.has(k)) };
}

/**
 * Period keys for a warning, with runs of repeat indexes as ranges:
 * `shift1, shift2, shift4` → `shift1–2, shift4`.
 */
export function describeKeys(keys: readonly string[]): string {
  const groups = new Map<string, number[]>();
  for (const key of keys) {
    const [, base, index] = key.match(/^(.*?)(\d*)$/)!;
    const list = groups.get(base) ?? [];
    groups.set(base, index ? [...list, Number(index)] : list);
  }
  return [...groups]
    .map(([base, indexes]) => {
      if (indexes.length === 0) return base;
      const runs: number[][] = [];
      for (const n of [...indexes].sort((a, b) => a - b)) {
        const run = runs[runs.length - 1];
        if (run && n === run[run.length - 1] + 1) run.push(n);
        else runs.push([n]);
      }
      return runs
        .map((r) => (r.length > 1 ? `${base}${r[0]}–${r[r.length - 1]}` : `${base}${r[0]}`))
        .join(", ");
    })
    .join(", ");
}

const describeFilter = (f: PeriodFilter) =>
  (["phases", "segments", "kinds"] as const)
    .filter((k) => f[k])
    .map((k) => `${k} ${f[k]!.join(", ")}`)
    .join("; ");

// ---------------------------------------------------------------------------- rewriting values

type Json = Record<string, unknown> | unknown[];

const parentOf = (root: Json, keys: readonly Key[]): Json | null => {
  let node: unknown = root;
  for (const k of keys.slice(0, -1)) {
    node = node !== null && typeof node === "object" ? (node as Record<Key, unknown>)[k] : null;
  }
  return node !== null && typeof node === "object" ? (node as Json) : null;
};

/**
 * Replace each composite id in `value` (found at `refs`) by its button id: list items in place
 * (then without repeats), property names renamed. Returns the periods the ids named, and a
 * warning for a property whose periods gave different values to one button.
 */
function replaceIds(
  value: Json,
  refs: readonly { id: string; keys: Key[] }[],
  ids: NativeIds,
  conflicts: string[],
): Placement[] {
  const periods: Placement[] = [];
  const lists = new Set<unknown[]>();
  const renames = new Map<Record<string, unknown>, Map<string, string>>();
  for (const ref of refs) {
    const composite = ids.split(ref.id);
    if (!composite) continue;
    periods.push(composite.period);
    const parent = parentOf(value, ref.keys);
    const last = ref.keys[ref.keys.length - 1];
    if (Array.isArray(parent)) {
      parent[last as number] = composite.button;
      lists.add(parent);
    } else if (parent && last === ref.id && Object.hasOwn(parent, ref.id)) {
      const map = renames.get(parent) ?? new Map<string, string>();
      renames.set(parent, map.set(ref.id, composite.button));
    } else if (parent) {
      (parent as Record<Key, unknown>)[last] = composite.button;
    }
  }
  for (const list of lists) {
    const kept = unique(list);
    list.splice(0, list.length, ...kept);
  }
  for (const [object, map] of renames) {
    const entries = Object.entries(object);
    for (const k of Object.keys(object)) delete object[k];
    for (const [k, v] of entries) {
      const name = map.get(k) ?? k;
      if (!Object.hasOwn(object, name)) object[name] = v;
      else if (JSON.stringify(object[name]) !== JSON.stringify(v))
        conflicts.push(
          `${name}: kept ${JSON.stringify(object[name])}, dropped ${JSON.stringify(v)} (${k})`,
        );
    }
  }
  return periods;
}

/** Every string in `value`, values and property names, through `f`. */
function mapStrings(value: unknown, f: (s: string) => string): unknown {
  if (typeof value === "string") return f(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, f));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [f(k), mapStrings(v, f)] as const),
    );
  }
  return value;
}

// ---------------------------------------------------------------------------- pipeline

/**
 * The outputs of counts grouped by segment, which paths name a period in: `countActions` with
 * `by: "segment"`, and a team `average` of a performance's grouped count. `scope` limits them to
 * performance (`tmp`) or team paths; without it, both.
 */
export function countRoots(entries: readonly PipelineEntry[], scope?: "tmp" | "team"): Set<string> {
  const tmp = new Set<string>();
  const team = new Set<string>();
  for (const e of entries) {
    const o = (e.options ?? {}) as Record<string, unknown>;
    if (e.name === "countActions" && o.by === "segment")
      (e.type === "tmp" ? tmp : team).add(e.outputPath);
    if (e.type === "team" && e.name === "average" && typeof o.path === "string" && tmp.has(o.path))
      team.add(e.outputPath);
  }
  return scope === "tmp" ? tmp : scope === "team" ? team : new Set([...tmp, ...team]);
}

/** The pipeline in native form; `where(i)` names entry i in warnings. */
export function nativePipeline(
  entries: readonly PipelineEntry[],
  ids: NativeIds,
  warnings: string[],
  where: (i: number) => string,
): PipelineEntry[] {
  const out: PipelineEntry[] = [];
  entries.forEach((entry, i) => {
    let options = structuredClone(entry.options ?? {}) as Record<string, unknown>;
    const refs = findReferences(options, builtInOptions(entry.name)).filter(
      (r) => r.kind === "action",
    );
    const conflicts: string[] = [];
    const hadFilter = hasPeriodFilter(options as PeriodFilter);
    const periods = replaceIds(options, refs, ids, conflicts);
    for (const c of conflicts) warnings.push(`${where(i)}: two periods gave ${c}`);
    if (periods.length > 0) {
      const plain = refs.filter((r) => !ids.split(r.id)).map((r) => r.id);
      if (hadFilter) {
        warnings.push(
          `${where(i)}: named periods both in its ids and in a period filter; check the filter`,
        );
      } else {
        const { filter, added } = periodFilterFor(ids.ms, periods);
        options = { ...options, ...filter };
        warnings.push(
          `${where(i)}: composite ids replaced by button ids with ${describeFilter(filter)}` +
            (added.length ? `; v1 left out ${describeKeys(added)}, which this also includes` : ""),
        );
      }
      if (plain.length)
        warnings.push(
          `${where(i)}: ${unique(plain).join(", ")} had no period; the filter applies to it too`,
        );
    }
    if (entry.name === "countActions" && options.by === undefined) {
      if (options.all === true || periods.length > 0) {
        options.by = "segment";
        warnings.push(`${where(i)}: counts grouped by period (by: "segment")`);
      }
    }
    const roots = countRoots(out);
    options = mapStrings(options, (s) => nativeCountPath(ids, roots, s)) as Record<string, unknown>;
    const next: PipelineEntry = { ...entry };
    if (entry.options !== undefined || Object.keys(options).length) next.options = options;
    out.push(next);
  });
  return out;
}

// ---------------------------------------------------------------------------- modules

/** The modules in native form; `roots` are the pipeline's grouped count outputs. */
export function nativeModules(
  modules: readonly ModuleEntry[],
  ids: NativeIds,
  roots: Iterable<string>,
  warnings: string[],
): ModuleEntry[] {
  const rootList = [...roots];
  return modules.map((m, i) => {
    const where = `modules[${i}] ${m.module} "${m.name}"`;
    let options = mapStrings(structuredClone(m.options), (s) =>
      nativeCountPath(ids, rootList, s),
    ) as Record<string, unknown>;
    const schema = moduleOptionsSchema(m.module);
    const refs = schema
      ? findReferences(options, schema, [], modulesRoot).filter((r) => r.kind === "action")
      : [];
    if (refs.some((r) => ids.split(r.id))) {
      if (m.module === "HeatmapScatterPlot") {
        options = nativeHeatmap(options, ids, where, warnings);
      } else {
        warnings.push(`${where}: names composite ids; replace them by button ids by hand`);
      }
    }
    return { ...m, options };
  });
}

/**
 * A heatmap's action groups name button ids with a period filter, and its labels are per button.
 * v5 drew one trace per composite id; native data has one id per button, so labels that differed
 * by period are merged.
 */
function nativeHeatmap(
  options: Record<string, unknown>,
  ids: NativeIds,
  where: string,
  warnings: string[],
): Record<string, unknown> {
  const groups = (options.actionGroups ?? []) as { name: string; actions: string[] }[];
  const nextGroups = groups.map((g) => {
    const periods = g.actions.flatMap((a) => ids.split(a)?.period ?? []);
    if (periods.length === 0) return g;
    const actions = unique(g.actions.map((a) => ids.split(a)?.button ?? a));
    const { filter, added } = periodFilterFor(ids.ms, periods);
    warnings.push(
      `${where}: group "${g.name}" now names ${actions.join(", ")} with ${describeFilter(filter)}` +
        (added.length ? `; v1 left out ${describeKeys(added)}, which this also includes` : ""),
    );
    return { ...g, actions, ...filter };
  });
  const labels = (options.actionLabels ?? {}) as Record<string, string>;
  const nextLabels: Record<string, string> = {};
  const merged = new Map<string, string[]>();
  for (const [id, label] of Object.entries(labels)) {
    const button = ids.split(id)?.button ?? id;
    merged.set(button, [...(merged.get(button) ?? []), label]);
  }
  for (const [button, list] of merged) {
    const distinct = unique(list);
    nextLabels[button] = distinct.length === 1 ? distinct[0] : button;
    if (distinct.length > 1)
      warnings.push(
        `${where}: one trace for ${button} instead of one per period (${distinct.join(", ")}); label it by hand`,
      );
  }
  return { ...options, actionGroups: nextGroups, actionLabels: nextLabels };
}
