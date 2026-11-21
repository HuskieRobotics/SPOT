/**
 * When an action happened, for analysis (CS-16, docs/spec/20 §2.2, #311).
 *
 * Actions carry the period they were recorded in (`phase`, `segment`, `segmentKind`,
 * `segmentIndex`, DV-1). Transformers that pick actions by id can also filter on the period,
 * and `countActions` can group by it. Both use the configuration's ids, never prefixes.
 *
 * Filters (an action must pass every filter given; within one filter, any listed value matches):
 *   phases:       phase ids, or "preMatch" for actions recorded before the match started
 *   segments:     segment ids ("transition", "shift")
 *   kinds:        the action's effective kind ("active", "inactive"): the kind the scouter
 *                 selected, else a kind the configuration fixes for the action's segment, else
 *                 for its phase (#326; 2026's auto, transition and endgame are "active")
 *
 * Group keys:
 *   by "phase":   the phase id, or "preMatch"
 *   by "segment": the most specific period: the kind id inside a segment where the scouter
 *                 selected a kind, else the segment id, each followed by the repeat index when
 *                 the segment repeats ("active1", "shift3", "transition"); the phase id outside
 *                 any segment; "preMatch" before the match started
 *   by "kind":    the effective kind ("active", "inactive"), else the phase id, else "preMatch"
 *
 * A fixed kind is a game rule, not something the scouter recorded, so it is resolved here from
 * the configuration and never stored on actions: fixing the configuration and running the
 * analysis again corrects every match.
 */
import type { MatchScoutingConfig } from "@/config/types";
import type { Action } from "@/data/types";

/** Key and filter value for actions recorded before the first phase began. */
export const PRE_MATCH = "preMatch";

export interface PeriodFilter {
  phases?: string[];
  segments?: string[];
  kinds?: string[];
}

export type GroupBy = "phase" | "segment" | "kind";

/** The period fields of an action; missing fields (e.g. an array built by another entry) are null. */
type Period = Pick<Action, "phase" | "segment" | "segmentKind" | "segmentIndex">;

function periodOf(action: Partial<Period>): Period {
  return {
    phase: action.phase ?? null,
    segment: action.segment ?? null,
    segmentKind: action.segmentKind ?? null,
    segmentIndex: action.segmentIndex ?? null,
  };
}

export function hasPeriodFilter(filter: PeriodFilter): boolean {
  return Boolean(filter.phases || filter.segments || filter.kinds);
}

/** The fixed kind of each segment and phase that has one, per configuration. */
const fixedKinds = new WeakMap<
  MatchScoutingConfig,
  { phases: Map<string, string>; segments: Map<string, string> }
>();

function fixedKindsOf(config: MatchScoutingConfig) {
  let found = fixedKinds.get(config);
  if (!found) {
    found = { phases: new Map(), segments: new Map() };
    for (const phase of config.timing.phases) {
      if (phase.kind) found.phases.set(phase.id, phase.kind);
      for (const segment of phase.segments ?? []) {
        if (segment.kind) found.segments.set(segment.id, segment.kind);
      }
    }
    fixedKinds.set(config, found);
  }
  return found;
}

/**
 * The kind an action counts as (#326): the kind the scouter selected, else the kind the
 * configuration fixes for its segment, else for its phase, else null. Without a configuration,
 * only the selected kind.
 */
export function effectiveKind(
  action: Partial<Period>,
  config?: MatchScoutingConfig,
): string | null {
  const p = periodOf(action);
  if (p.segmentKind !== null || !config) return p.segmentKind;
  const fixed = fixedKindsOf(config);
  return (
    (p.segment !== null ? fixed.segments.get(p.segment) : undefined) ??
    (p.phase !== null ? fixed.phases.get(p.phase) : undefined) ??
    null
  );
}

/** Whether an action passes every filter given; `config` resolves fixed kinds for `kinds`. */
export function passesFilter(
  action: Partial<Period>,
  filter: PeriodFilter,
  config?: MatchScoutingConfig,
): boolean {
  const p = periodOf(action);
  if (filter.phases && !filter.phases.includes(p.phase ?? PRE_MATCH)) return false;
  if (filter.segments && (p.segment === null || !filter.segments.includes(p.segment))) return false;
  if (filter.kinds) {
    const kind = effectiveKind(p, config);
    if (kind === null || !filter.kinds.includes(kind)) return false;
  }
  return true;
}

export function groupKey(
  action: Partial<Period>,
  by: GroupBy,
  config?: MatchScoutingConfig,
): string {
  const p = periodOf(action);
  if (p.phase === null) return PRE_MATCH;
  if (by === "kind") return effectiveKind(p, config) ?? p.phase;
  if (by === "phase" || p.segment === null) return p.phase;
  return `${p.segmentKind ?? p.segment}${p.segmentIndex ?? ""}`;
}

/** Every period the configuration can produce, as the action fields that describe it. */
export function configuredPeriods(config: MatchScoutingConfig): Period[] {
  const out: Period[] = [{ phase: null, segment: null, segmentKind: null, segmentIndex: null }];
  for (const phase of config.timing.phases) {
    out.push({ phase: phase.id, segment: null, segmentKind: null, segmentIndex: null });
    for (const segment of phase.segments ?? []) {
      const indexes: (number | null)[] = segment.repeat
        ? Array.from({ length: segment.repeat.count }, (_, i) => i + 1)
        : [null];
      for (const segmentIndex of indexes) {
        // No kind selected yet is a real state, so it gets its own group.
        for (const segmentKind of [null, ...(segment.kinds ?? []).map((k) => k.id)]) {
          out.push({ phase: phase.id, segment: segment.id, segmentKind, segmentIndex });
        }
      }
    }
  }
  return out;
}

/**
 * The group keys the configuration can produce, in match order, limited to periods that pass the
 * filter. Throws when two different periods would share a key, e.g. a segment kind with the
 * same id as a phase.
 */
export function groupKeys(
  config: MatchScoutingConfig,
  by: GroupBy,
  filter: PeriodFilter = {},
): string[] {
  const keys: string[] = [];
  const owners = new Map<string, string>();
  for (const period of configuredPeriods(config)) {
    const key = groupKey(period, by, config);
    // What the key stands for at this grouping: a kind, the phase alone, or the full period.
    const kind = by === "kind" ? effectiveKind(period, config) : null;
    const identity = JSON.stringify(
      kind !== null
        ? { kind }
        : by !== "segment" || period.segment === null
          ? { phase: period.phase }
          : period,
    );
    const owner = owners.get(key);
    if (owner === undefined) owners.set(key, identity);
    else if (owner !== identity) {
      throw new Error(
        `grouping by ${by} gives two different periods the key "${key}" (${owner} and ${identity}); ` +
          `rename one of the ids ("${PRE_MATCH}" is reserved for actions before the match)`,
      );
    }
    if (passesFilter(period, filter, config) && !keys.includes(key)) keys.push(key);
  }
  return keys;
}
