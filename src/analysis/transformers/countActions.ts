/**
 * countActions (docs/spec/09; periods: CS-16, #311).
 *
 * Counts actions by button id, for one performance (`tmp`) or across a team's performances
 * (`team`). Output is `{ <button>: count }`, or with `by` one such object per period:
 * `{ auto: { l4: 2 }, teleop: { l4: 5 } }`.
 *
 * - `all: true` counts every action, including ids the configuration does not know (decision
 *   of 2026-09-17, docs/spec/17 §2), and starts every action button of the configuration at 0
 *   so paths such as `counts.l4` exist even when nothing was pressed. Undo, navigation and
 *   match-control buttons record nothing and are not listed (v5 listed them as 0). The TBA
 *   score-breakdown ids reported at the event start at 0 too (`Dataset.extraActionIds`, #315).
 * - `ids` counts only the listed ids, each starting at 0.
 * - `phases`, `segments`, `kinds` count only actions recorded in those periods.
 * - `by: "phase" | "segment" | "kind"` splits the counts by period (see periods.ts for the
 *   keys); every configured period that passes the filters starts with all its ids at 0.
 * - `actionArrayPath` (default `actions`) counts a different array of actions on the
 *   performance, such as one written by an earlier entry.
 */
import { actionButtonIds } from "@/config/knownActionIds";
import type { MatchScoutingConfig } from "@/config/types";
import type { Action } from "@/data/types";
import { getPath } from "../engine/path";
import { builtInOptions, defineTransformer, type TransformerContext } from "../engine/registry";
import type { AnalysisPerformance } from "../engine/dataset";
import { groupKey, groupKeys, passesFilter, type GroupBy, type PeriodFilter } from "./periods";

export interface CountActionsOptions extends PeriodFilter {
  all?: boolean;
  ids?: string[];
  actionArrayPath?: string;
  by?: GroupBy;
}

type Counts = Record<string, number>;

function seed(ids: readonly string[]): Counts {
  const out: Counts = {};
  for (const id of ids) out[id] = 0;
  return out;
}

/** A reusable counter: seeded once per entry, then fed one performance at a time. */
function counter(
  options: CountActionsOptions,
  config: MatchScoutingConfig,
  extraActionIds: readonly string[],
) {
  const countAll = options.all === true;
  const ids = countAll
    ? [...new Set([...actionButtonIds(config), ...extraActionIds])]
    : (options.ids ?? []);
  const wanted = countAll ? null : new Set(ids);
  const keys = options.by ? groupKeys(config, options.by, options) : [];
  const arrayPath = options.actionArrayPath ?? "actions";

  const start = (): Counts | Record<string, Counts> => {
    if (!options.by) return seed(ids);
    const grouped: Record<string, Counts> = {};
    for (const key of keys) grouped[key] = seed(ids);
    return grouped;
  };

  const add = (out: Counts | Record<string, Counts>, tmp: AnalysisPerformance) => {
    const actions = getPath(tmp, arrayPath);
    if (!Array.isArray(actions)) {
      throw new Error(`"${arrayPath}" is not a list of actions`);
    }
    for (const action of actions as Partial<Action>[]) {
      const id = action.id;
      if (typeof id !== "string") continue;
      if (wanted && !wanted.has(id)) continue;
      if (!passesFilter(action, options, config)) continue;
      let target = out as Counts;
      if (options.by) {
        const key = groupKey(action, options.by, config);
        const grouped = out as Record<string, Counts>;
        target = grouped[key] ??= seed(ids);
      }
      target[id] = (target[id] ?? 0) + 1;
    }
  };

  return { start, add };
}

const summary = "Count actions by button id, optionally only in some periods or split by period";

// The counter depends only on the options and the context (configuration and extra ids), which
// are fixed for an entry during a run, so build it once per entry rather than once per performance.
const counters = new WeakMap<object, WeakMap<object, ReturnType<typeof counter>>>();
function counterFor(options: CountActionsOptions, context: TransformerContext) {
  let byContext = counters.get(options);
  if (!byContext) counters.set(options, (byContext = new WeakMap()));
  let c = byContext.get(context);
  if (!c)
    byContext.set(context, (c = counter(options, context.config, context.extraActionIds ?? [])));
  return c;
}

export const countActionsTmp = defineTransformer<CountActionsOptions>({
  type: "tmp",
  scope: "each",
  name: "countActions",
  summary,
  optionsSchema: builtInOptions("countActions"),
  run: (tmp, options, context) => {
    const c = counterFor(options, context);
    const out = c.start();
    c.add(out, tmp);
    return out;
  },
});

export const countActionsTeam = defineTransformer<CountActionsOptions>({
  type: "team",
  scope: "each",
  name: "countActions",
  summary,
  optionsSchema: builtInOptions("countActions"),
  run: ({ tmps }, options, context) => {
    const c = counterFor(options, context);
    const out = c.start();
    for (const tmp of tmps) c.add(out, tmp);
    return out;
  },
});
