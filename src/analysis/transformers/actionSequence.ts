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
 * - Pairing never queues (TR-15, decided 2026-11-21, replacing A-38): a later action pairs with
 *   the newest open one before it, so a start that never got its end (a drop nobody recorded, a
 *   mistaken tap) affects only its own pair. v5 gave each start the first unused end after it,
 *   so one such start shifted every later pair in the match by one (F-28).
 * - `ts` is match time remaining in milliseconds (DM-3), so a later action has a smaller `ts`.
 * - Actions written into an output are copies; stored actions are never changed (F-3, TR-7).
 * - v5's `removeDuplicates` is retired: analysis never sees a superseded performance (TR-5).
 */
import type { MatchScoutingConfig } from "@/config/types";
import type { Action } from "@/data/types";
import { getPath } from "../engine/path";
import { builtInOptions, defineTransformer, type Transformer } from "../engine/registry";
import { hasPeriodFilter, passesFilter, type PeriodFilter } from "./periods";

/** An action as found in a list; lists built by other entries may lack the period fields. */
type ActionLike = Pick<Action, "id" | "ts"> & Partial<Action>;

const orDefault = (value: unknown) => (value === undefined ? null : structuredClone(value));
const copy = <T>(value: T): T => structuredClone(value);

/** The actions at `path`, in recorded order; with a filter, only those that pass it. */
function actionsAt(
  target: Record<string, unknown>,
  path: string,
  filter: PeriodFilter = {},
  config?: MatchScoutingConfig,
) {
  const list = getPath(target, path);
  if (!Array.isArray(list)) throw new Error(`"${path}" is not a list of actions`);
  return (list as ActionLike[]).filter((action) => passesFilter(action, filter, config));
}

/** Whether a pair, from its first to its last action, starts or ends in the filtered periods. */
const keepsPair = (
  first: ActionLike,
  last: ActionLike,
  filter: PeriodFilter,
  config: MatchScoutingConfig,
) =>
  !hasPeriodFilter(filter) ||
  passesFilter(first, filter, config) ||
  passesFilter(last, filter, config);

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
  run: (tmp, options, { config }) => {
    const ids = Array.isArray(options.actionId) ? options.actionId : [options.actionId];
    const found = actionsAt(tmp, "actions", options, config).find((a) => ids.includes(a.id));
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
    return actionsAt(tmp, "actions", options, config)
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
  run: (tmp, options, { config }) => {
    // Searched from the end without reversing: v5 reversed the stored list in place (F-3).
    const actions = actionsAt(tmp, options.actionArrayPath ?? "actions", options, config);
    for (let i = actions.length - 1; i >= 0; i--) {
      if (options.ids.includes(actions[i].id)) return copy(actions[i]);
    }
    return orDefault(options.default);
  },
});

/**
 * Pair each end action (or miss) with the newest open start recorded before it, strictly earlier
 * in match time (TR-15, decided 2026-11-21, replacing A-38). At most `capacity` starts are open
 * at once (default 1, a robot holding one game piece): a start beyond that drops the oldest open
 * one. An end with no open start is not used. `unendedCount` counts the starts that never got an
 * end: dropped by a later start, or still open when the match ended.
 *
 * A period filter keeps the cycles that start or end in the period, and counts the unended
 * starts in it (TR-13). `timeDifferential` is the time between start and end in ms;
 * `allComplete` leaves out cycles that ended in a miss; the averages are null with no cycles.
 */
export const cycle = defineTransformer<
  {
    startAction: string[];
    endAction: string[];
    misses?: string[];
    capacity?: number;
  } & PeriodFilter
>({
  type: "tmp",
  scope: "each",
  name: "cycle",
  summary: "Time from each start action to the end action that follows it",
  optionsSchema: builtInOptions("cycle"),
  run: (tmp, options, { config }) => {
    const capacity = options.capacity ?? 1;
    const misses = options.misses ?? [];
    const open: ActionLike[] = [];
    const unended: ActionLike[] = [];
    const all: { starts: ActionLike; ending: ActionLike; timeDifferential: number }[] = [];
    for (const action of actionsAt(tmp, "actions")) {
      if (options.endAction.includes(action.id) || misses.includes(action.id)) {
        const i = open.findLastIndex((start) => start.ts > action.ts);
        if (i >= 0) {
          const [start] = open.splice(i, 1);
          if (keepsPair(start, action, options, config)) {
            all.push({
              starts: copy(start),
              ending: copy(action),
              timeDifferential: start.ts - action.ts,
            });
          }
        }
      }
      if (options.startAction.includes(action.id)) {
        open.push(action);
        if (open.length > capacity) unended.push(open.shift()!);
      }
    }
    unended.push(...open);
    const allComplete = all.filter((c) => !misses.includes(c.ending.id)).map(copy);
    return {
      all,
      allComplete,
      averageTime: mean(all.map((c) => c.timeDifferential)),
      averageTimeComplete: mean(allComplete.map((c) => c.timeDifferential)),
      cycleCount: all.length,
      cycleCountComplete: allComplete.length,
      unendedCount: unended.filter((start) => passesFilter(start, options, config)).length,
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
  run: (tmp, options, { config }) => {
    const placements: Record<string, number> = {};
    for (const id of options.pickup) placements[id] = 0;
    let held: ActionLike | null = null;
    for (const action of actionsAt(tmp, options.actionArrayPath ?? "actions")) {
      if (options.pickup.includes(action.id)) held = action;
      if (options.hybrid.includes(action.id) && held && keepsPair(held, action, options, config))
        placements[held.id] += 1;
    }
    return placements;
  },
});

/**
 * Group zone, action and rating presses into triples (2026). A zone press says where the robot
 * is from then on, so an action takes the zone pressed last before it, and a rating pairs with
 * the newest action not yet rated (TR-15, decided 2026-11-21, #320). An action recorded before
 * any zone press, or never rated, is left out; a newer action replaces one still waiting for its
 * rating, so nothing queues (F-28). The rating must be strictly later than its action, as in v5.
 * v5 paired each zone press with the first unused action after it, so a zone covered one action
 * and a missed rating shifted every later triple. A period filter keeps the triples whose action
 * or rating is in the period (TR-13). A rating's value comes from the `ratings` map (decided
 * 2026-11-20; v5 read the digit at the end of the id).
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
  run: (tmp, options, { config }) => {
    const reserved = options.zones.filter((z) => z === "list" || z === "counts");
    if (reserved.length > 0) {
      throw new Error(`a zone cannot be named "${reserved[0]}": that key holds other output`);
    }
    const recorded = actionsAt(tmp, "actions");
    const list: { zone: string; action: string; rating: number }[] = [];
    const counts: Record<string, Record<string, Record<string, number>>> = {};
    const totals = new Map<string, Map<string, { sum: number; count: number }>>();
    let zone: string | null = null;
    let waiting: { zone: string | null; action: ActionLike } | null = null;
    for (const a of recorded) {
      if (Object.hasOwn(options.ratings, a.id)) {
        if (!waiting || waiting.action.ts <= a.ts) continue;
        const { zone: z, action } = waiting;
        waiting = null;
        if (z === null || !keepsPair(action, a, options, config)) continue;
        const value = options.ratings[a.id];
        list.push({ zone: z, action: action.id, rating: value });
        const byAction = (counts[z] ??= {});
        const byRating = (byAction[action.id] ??= {});
        byRating[value] = (byRating[value] ?? 0) + 1;
        const zoneTotals = totals.get(z) ?? new Map<string, { sum: number; count: number }>();
        totals.set(z, zoneTotals);
        const t = zoneTotals.get(action.id) ?? { sum: 0, count: 0 };
        zoneTotals.set(action.id, { sum: t.sum + value, count: t.count + 1 });
      } else if (options.actions.includes(a.id)) {
        waiting = { zone, action: a };
      } else if (options.zones.includes(a.id)) {
        zone = a.id;
      }
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
