/**
 * Action-sequence transformers (docs/spec/09 TR-13, #314): they walk a performance's actions in
 * the order they were recorded. `actionTime`, `actionTimeFilter`, `finalActionOccurrence`,
 * `cycle`, `countHybrid` and `zoneActionRatingGroupings`.
 *
 * Rules:
 * - Actions are matched by button id (CS-16). Every one of these transformers also takes the
 *   period filters `phases`, `segments` and `kinds` (docs/spec/20 §2.2).
 * - Transformers that look at one action at a time filter the actions first.
 * - Transformers that pair actions (`cycle`, `countHybrid`, `zoneActionRatingGroupings`) pair
 *   over the whole match first, then keep a pair whose first or last action is in the period
 *   (decided 2026-11-20). Filtering first would break pairs at a boundary: in 2026 a team starts
 *   shooting before the hub activates, and a scouter may press stop just after it deactivates.
 *   A pair that crosses a boundary is kept by a filter for either period.
 * - `ts` is match time remaining in milliseconds (DM-3), so a later action has a smaller `ts`.
 * - Actions written into an output are copies; stored actions are never changed (F-3, TR-7).
 * - v5's `removeDuplicates` is retired: analysis never sees a superseded performance (TR-5).
 */
import type { Action } from "@/data/types";
import { getPath } from "../engine/path";
import { builtInOptions, defineTransformer, type Transformer } from "../engine/registry";
import { hasPeriodFilter, passesFilter, type PeriodFilter } from "./periods";

/** An action as found in a list; lists built by other entries may lack the period fields. */
type ActionLike = Pick<Action, "id" | "ts"> & Partial<Action>;

const orDefault = (value: unknown) => (value === undefined ? null : structuredClone(value));
const copy = <T>(value: T): T => structuredClone(value);

/** The actions at `path`, in recorded order; with a filter, only those that pass it. */
function actionsAt(target: Record<string, unknown>, path: string, filter: PeriodFilter = {}) {
  const list = getPath(target, path);
  if (!Array.isArray(list)) throw new Error(`"${path}" is not a list of actions`);
  return (list as ActionLike[]).filter((action) => passesFilter(action, filter));
}

/** Whether a pair, from its first to its last action, starts or ends in the filtered periods. */
const keepsPair = (first: ActionLike, last: ActionLike, filter: PeriodFilter) =>
  !hasPeriodFilter(filter) || passesFilter(first, filter) || passesFilter(last, filter);

/** Mean of the numbers, added left to right as v5 did; null when there are none. */
function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Time remaining (ms) when the first action with one of these ids was recorded. */
export const actionTime = defineTransformer<
  { actionId: string | string[]; default?: unknown } & PeriodFilter
>({
  type: "tmp",
  scope: "each",
  name: "actionTime",
  summary: "When an action first happened (match time remaining, in ms)",
  optionsSchema: builtInOptions("actionTime"),
  run: (tmp, options) => {
    const ids = Array.isArray(options.actionId) ? options.actionId : [options.actionId];
    const found = actionsAt(tmp, "actions", options).find((a) => ids.includes(a.id));
    return found ? found.ts : orDefault(options.default);
  },
});

/**
 * The actions recorded while the match time remaining was between `timeMin` and `timeMax`
 * (inclusive). The period filters usually say the same more plainly (`phases: ["auto"]`).
 * v5 treated a `timeMax` of 0 as "not set"; v6 uses the value as given.
 */
export const actionTimeFilter = defineTransformer<
  { timeMin?: number; timeMax?: number } & PeriodFilter
>({
  type: "tmp",
  scope: "each",
  name: "actionTimeFilter",
  summary: "Keep the actions recorded within a range of match time",
  optionsSchema: builtInOptions("actionTimeFilter"),
  run: (tmp, options, { config }) => {
    const min = options.timeMin ?? 0;
    const max = options.timeMax ?? config.timing.totalMs;
    return actionsAt(tmp, "actions", options)
      .filter((a) => a.ts >= min && a.ts <= max)
      .map(copy);
  },
});

/** The last action with one of these ids, or `default` (null when not set). */
export const finalActionOccurrence = defineTransformer<
  { ids: string[]; default?: unknown; actionArrayPath?: string } & PeriodFilter
>({
  type: "tmp",
  scope: "each",
  name: "finalActionOccurrence",
  summary: "The last action with one of these ids",
  optionsSchema: builtInOptions("finalActionOccurrence"),
  run: (tmp, options) => {
    // Searched from the end without reversing: v5 reversed the stored list in place (F-3).
    const actions = actionsAt(tmp, options.actionArrayPath ?? "actions", options);
    for (let i = actions.length - 1; i >= 0; i--) {
      if (options.ids.includes(actions[i].id)) return copy(actions[i]);
    }
    return orDefault(options.default);
  },
});

/**
 * Pair each start action with the first unused end action (or miss) recorded after it (A-38):
 * a start with no end after it ends the search, and an end with no start before it is never
 * used. A period filter keeps the cycles that start or end in the period. `timeDifferential` is the time between the two in ms. `allComplete` leaves out cycles
 * that ended in a miss. The averages are null when there are no cycles.
 */
export const cycle = defineTransformer<
  { startAction: string[]; endAction: string[]; misses?: string[] } & PeriodFilter
>({
  type: "tmp",
  scope: "each",
  name: "cycle",
  summary: "Time from each start action to the end action that follows it",
  optionsSchema: builtInOptions("cycle"),
  run: (tmp, options) => {
    const misses = options.misses ?? [];
    const actions = actionsAt(tmp, "actions");
    let endings = actions.filter((a) => options.endAction.includes(a.id) || misses.includes(a.id));
    const all: { starts: ActionLike; ending: ActionLike; timeDifferential: number }[] = [];
    for (const start of actions.filter((a) => options.startAction.includes(a.id))) {
      endings = endings.filter((e) => e.ts < start.ts);
      const ending = endings.shift();
      if (!ending) break;
      if (!keepsPair(start, ending, options)) continue;
      all.push({
        starts: copy(start),
        ending: copy(ending),
        timeDifferential: start.ts - ending.ts,
      });
    }
    const allComplete = all.filter((c) => !misses.includes(c.ending.id)).map(copy);
    return {
      all,
      allComplete,
      averageTime: mean(all.map((c) => c.timeDifferential)),
      averageTimeComplete: mean(allComplete.map((c) => c.timeDifferential)),
      cycleCount: all.length,
      cycleCountComplete: allComplete.length,
    };
  },
});

/**
 * Count placements (`hybrid` ids) by the game piece last picked up (`pickup` ids): the result has
 * one count per pickup id, starting at 0. A placement before any pickup, such as a preloaded
 * piece, is not counted (v5 counted it under "" and produced NaN). A period filter counts a
 * placement when it or its pickup is in the period. v5's team variant did nothing and is not
 * carried over.
 */
export const countHybrid = defineTransformer<
  { pickup: string[]; hybrid: string[]; actionArrayPath?: string } & PeriodFilter
>({
  type: "tmp",
  scope: "each",
  name: "countHybrid",
  summary: "Count placements by the game piece last picked up",
  optionsSchema: builtInOptions("countHybrid"),
  run: (tmp, options) => {
    const placements: Record<string, number> = {};
    for (const id of options.pickup) placements[id] = 0;
    let held: ActionLike | null = null;
    for (const action of actionsAt(tmp, options.actionArrayPath ?? "actions")) {
      if (options.pickup.includes(action.id)) held = action;
      if (options.hybrid.includes(action.id) && held && keepsPair(held, action, options))
        placements[held.id] += 1;
    }
    return placements;
  },
});

/**
 * Group zone, action and rating presses into triples (2026): each zone press is paired with the
 * first unused action recorded after it, and that action with the first unused rating after it;
 * the walk stops at the first zone or action that has nothing after it. A period filter keeps
 * the triples whose zone or rating is in the period. A rating's value comes from the `ratings`
 * map (decided 2026-11-20; v5 read the digit at the end of the id).
 *
 * Output: `list` of `{ zone, action, rating }`, `counts[zone][action][rating]`, and, for each
 * zone, `[zone][action]` = the mean rating.
 */
export const zoneActionRatingGroupings = defineTransformer<
  { zones: string[]; actions: string[]; ratings: Record<string, number> } & PeriodFilter
>({
  type: "tmp",
  scope: "each",
  name: "zoneActionRatingGroupings",
  summary: "Group zone, action and rating presses, and average the rating per zone and action",
  optionsSchema: builtInOptions("zoneActionRatingGroupings"),
  run: (tmp, options) => {
    const reserved = options.zones.filter((z) => z === "list" || z === "counts");
    if (reserved.length > 0) {
      throw new Error(`a zone cannot be named "${reserved[0]}": that key holds other output`);
    }
    const recorded = actionsAt(tmp, "actions");
    let actions = recorded.filter((a) => options.actions.includes(a.id));
    let ratings = recorded.filter((a) => Object.hasOwn(options.ratings, a.id));
    const list: { zone: string; action: string; rating: number }[] = [];
    const counts: Record<string, Record<string, Record<string, number>>> = {};
    const totals = new Map<string, Map<string, { sum: number; count: number }>>();
    for (const zone of recorded.filter((a) => options.zones.includes(a.id))) {
      actions = actions.filter((a) => a.ts < zone.ts);
      const action = actions.shift();
      if (!action) break;
      ratings = ratings.filter((r) => r.ts < action.ts);
      const rating = ratings.shift();
      if (!rating) break;
      if (!keepsPair(zone, rating, options)) continue;
      const value = options.ratings[rating.id];
      list.push({ zone: zone.id, action: action.id, rating: value });
      const byAction = (counts[zone.id] ??= {});
      const byRating = (byAction[action.id] ??= {});
      byRating[value] = (byRating[value] ?? 0) + 1;
      const zoneTotals = totals.get(zone.id) ?? new Map<string, { sum: number; count: number }>();
      totals.set(zone.id, zoneTotals);
      const t = zoneTotals.get(action.id) ?? { sum: 0, count: 0 };
      zoneTotals.set(action.id, { sum: t.sum + value, count: t.count + 1 });
    }
    const out: Record<string, unknown> = { list, counts };
    for (const [zone, byAction] of totals) {
      out[zone] = Object.fromEntries([...byAction].map(([a, t]) => [a, t.sum / t.count]));
    }
    return out;
  },
});

export const actionSequenceTransformers: readonly Transformer[] = [
  actionTime,
  actionTimeFilter,
  countHybrid,
  cycle,
  finalActionOccurrence,
  zoneActionRatingGroupings,
];
