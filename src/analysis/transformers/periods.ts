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
 *   segmentKinds: scouter-selected kinds ("active", "inactive")
 *
 * Group keys:
 *   by "phase":   the phase id, or "preMatch"
 *   by "segment": the most specific period: the kind id inside a segment where the scouter
 *                 selected a kind, else the segment id, each followed by the repeat index when
 *                 the segment repeats ("active1", "shift3", "transition"); the phase id outside
 *                 any segment; "preMatch" before the match started
 */
import type { MatchScoutingConfig } from "@/config/types";
import type { Action } from "@/data/types";

/** Key and filter value for actions recorded before the first phase began. */
export const PRE_MATCH = "preMatch";

export interface PeriodFilter {
  phases?: string[];
  segments?: string[];
  segmentKinds?: string[];
}

export type GroupBy = "phase" | "segment";

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
  return Boolean(filter.phases || filter.segments || filter.segmentKinds);
}

export function passesFilter(action: Partial<Period>, filter: PeriodFilter): boolean {
  const p = periodOf(action);
  if (filter.phases && !filter.phases.includes(p.phase ?? PRE_MATCH)) return false;
  if (filter.segments && (p.segment === null || !filter.segments.includes(p.segment))) return false;
  if (
    filter.segmentKinds &&
    (p.segmentKind === null || !filter.segmentKinds.includes(p.segmentKind))
  )
    return false;
  return true;
}

export function groupKey(action: Partial<Period>, by: GroupBy): string {
  const p = periodOf(action);
  if (p.phase === null) return PRE_MATCH;
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
    const key = groupKey(period, by);
    // What the key stands for at this grouping: the phase alone, or the full period in a segment.
    const identity = JSON.stringify(
      by === "phase" || period.segment === null ? { phase: period.phase } : period,
    );
    const owner = owners.get(key);
    if (owner === undefined) owners.set(key, identity);
    else if (owner !== identity) {
      throw new Error(
        `grouping by ${by} gives two different periods the key "${key}" (${owner} and ${identity}); ` +
          `rename one of the ids ("${PRE_MATCH}" is reserved for actions before the match)`,
      );
    }
    if (passesFilter(period, filter) && !keys.includes(key)) keys.push(key);
  }
  return keys;
}
