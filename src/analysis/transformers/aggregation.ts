/**
 * Aggregation transformers (docs/spec/09, #313): combine a team's performances into one value
 * (`average`, `averageTime`, `deepAverage`, `aggregateArray`, `countMatches`,
 * `standardDeviation`), and average a list (`averageArray`, tmp and team).
 *
 * Rules (TR-12, decided 2026-11-20):
 * - A per-match value that is null or missing is skipped, as in v5: an unrated match has no
 *   rating, and a match without a climb has no climb time. How often something happened is a
 *   separate count.
 * - When there is nothing at all to average, the result is `ifNone` when configured, else null.
 *   Like `ratio.divByZero` (F-24), an explicit value lets a team that never did something rank
 *   last instead of dropping out of the ranking as "No Data".
 * - A value that is neither a number nor null is an error naming the path.
 */
import { getPath } from "../engine/path";
import { builtInOptions, defineTransformer, type Transformer } from "../engine/registry";

const notANumber = (path: string, value: unknown) =>
  new Error(`"${path}" holds ${JSON.stringify(value)}, which is not a number`);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const fallback = (ifNone: unknown) => (ifNone === undefined ? null : structuredClone(ifNone));

/** Mean of the numbers, left to right as v5 added them; null when there are none. */
function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Average values across performances, leaf by leaf. Numbers are averaged over the performances
 * that have one; objects are averaged key by key, all the way down (v5: one level), so grouped
 * counts such as `counts.auto.l4` average too.
 */
function averageValues(values: readonly unknown[], path: string, ifNone: unknown): unknown {
  const present = values.filter((v) => v !== null && v !== undefined);
  if (present.length === 0) return fallback(ifNone);
  if (present.every(isRecord)) {
    const keys: string[] = [];
    for (const v of present) for (const k of Object.keys(v)) if (!keys.includes(k)) keys.push(k);
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      out[key] = averageValues(
        present.map((v) => (v as Record<string, unknown>)[key]),
        `${path}.${key}`,
        ifNone,
      );
    }
    return out;
  }
  for (const v of present) if (typeof v !== "number") throw notANumber(path, v);
  return mean(present as number[]);
}

type AverageOptions = { path: string; ifNone?: unknown };

const averageOf = (name: string, summary: string) =>
  defineTransformer<AverageOptions>({
    type: "team",
    scope: "each",
    name,
    summary,
    optionsSchema: builtInOptions("average"),
    run: ({ tmps }, { path, ifNone }) =>
      averageValues(
        tmps.map((t) => getPath(t, path, undefined)),
        path,
        ifNone,
      ),
  });

export const average = averageOf(
  "average",
  "Average a value, or each value in an object, over a team's matches",
);

/** v5 kept a separate transformer because its `average` gave NaN with no values; in v6 they agree. */
export const averageTime = averageOf(
  "averageTime",
  "Same as average (v5 kept a separate name for times)",
);

/**
 * v5's `deepAverage`, kept as it was: numeric leaves are summed (a list of numbers counts as its
 * sum), added up across the team's matches, and divided by the number of matches that had any
 * numeric value at the path. A leaf a match lacks therefore counts as 0 for that match; use
 * `average` to skip missing values instead.
 */
export const deepAverage = defineTransformer<{ path: string }>({
  type: "team",
  scope: "each",
  name: "deepAverage",
  summary: "Average nested numbers, treating a value a match lacks as 0",
  optionsSchema: builtInOptions("pathOnly"),
  run: ({ tmps }, { path }) => {
    const sumNested = (v: unknown): unknown => {
      if (typeof v === "number") return v;
      if (Array.isArray(v)) {
        if (!v.every((x) => typeof x === "number")) return undefined;
        return (v as number[]).reduce((a, x) => a + x, 0);
      }
      if (isRecord(v)) {
        const out: Record<string, unknown> = {};
        for (const [k, child] of Object.entries(v)) {
          const s = sumNested(child);
          if (s !== undefined) out[k] = s;
        }
        return Object.keys(out).length > 0 ? out : undefined;
      }
      return undefined;
    };
    const addNested = (a: unknown, b: unknown): unknown => {
      if (b === undefined) return a;
      if (a === undefined) return b;
      if (typeof a === "number" && typeof b === "number") return a + b;
      if (isRecord(a) && isRecord(b)) {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(a)) out[k] = addNested(a[k], b[k]);
        for (const k of Object.keys(b)) if (!(k in a)) out[k] = b[k];
        return out;
      }
      return a;
    };
    const divideNested = (v: unknown, n: number): unknown => {
      if (typeof v === "number") return v / n;
      if (isRecord(v)) {
        const out: Record<string, unknown> = {};
        for (const [k, child] of Object.entries(v)) {
          const d = divideNested(child, n);
          if (d !== undefined) out[k] = d;
        }
        return Object.keys(out).length > 0 ? out : undefined;
      }
      return v;
    };
    let sum: unknown = undefined;
    let count = 0;
    for (const tmp of tmps) {
      const value = getPath(tmp, path, undefined);
      if (value === undefined) continue;
      const summed = sumNested(value);
      if (summed === undefined) continue;
      sum = sum === undefined ? summed : addNested(sum, summed);
      count++;
    }
    return count > 0 ? (divideNested(sum, count) ?? null) : null;
  },
});

/** Join the lists at `path` across a team's matches, in match order. A null list is skipped. */
export const aggregateArray = defineTransformer<{ path: string }>({
  type: "team",
  scope: "each",
  name: "aggregateArray",
  summary: "Join a list from every match into one list",
  optionsSchema: builtInOptions("pathOnly"),
  run: ({ tmps }, { path }) => {
    const out: unknown[] = [];
    for (const tmp of tmps) {
      const list = getPath(tmp, path);
      if (list === null) continue;
      if (!Array.isArray(list)) {
        throw new Error(`"${path}" holds ${JSON.stringify(list)}, which is not a list`);
      }
      // Copies, so the team's list never shares objects with a match's own output.
      for (const item of list) out.push(structuredClone(item));
    }
    return out;
  },
});

type AverageArrayOptions = { arrayPath: string; valuePath: string; ifNone?: unknown };

function averageArrayOf(target: Record<string, unknown>, o: AverageArrayOptions): unknown {
  const list = getPath(target, o.arrayPath);
  if (list === null) return fallback(o.ifNone);
  if (!Array.isArray(list)) {
    throw new Error(`"${o.arrayPath}" holds ${JSON.stringify(list)}, which is not a list`);
  }
  const values: number[] = [];
  for (const item of list) {
    const v = getPath(item, o.valuePath);
    if (v === null) continue;
    if (typeof v !== "number") throw notANumber(`${o.arrayPath}[].${o.valuePath}`, v);
    values.push(v);
  }
  return values.length === 0 ? fallback(o.ifNone) : mean(values);
}

/** v5's tmp variant never returned the dataset and broke the pipeline (F-2); fixed here. */
export const averageArrayTmp = defineTransformer<AverageArrayOptions>({
  type: "tmp",
  scope: "each",
  name: "averageArray",
  summary: "Average one value across the items of a list",
  optionsSchema: builtInOptions("averageArray"),
  run: (tmp, options) => averageArrayOf(tmp, options),
});

export const averageArrayTeam = defineTransformer<AverageArrayOptions>({
  type: "team",
  scope: "each",
  name: "averageArray",
  summary: "Average one value across the items of a list",
  optionsSchema: builtInOptions("averageArray"),
  run: ({ data }, options) => averageArrayOf(data, options),
});

/**
 * Number of distinct matches the team played, times `weight` (default 1). v5 wrote
 * `weight || 1`, so a weight of 0 became 1; v6 uses the weight as given.
 */
export const countMatches = defineTransformer<{ weight?: number }>({
  type: "team",
  scope: "each",
  name: "countMatches",
  summary: "Count the matches a team played",
  optionsSchema: builtInOptions("countMatches"),
  run: ({ tmps }, { weight }) => new Set(tmps.map((t) => t.matchNumber)).size * (weight ?? 1),
});

/** Population standard deviation of a value over a team's matches, skipping No Data. */
export const standardDeviation = defineTransformer<{ path: string }>({
  type: "team",
  scope: "each",
  name: "standardDeviation",
  summary: "How much a value varies from match to match (population standard deviation)",
  optionsSchema: builtInOptions("pathOnly"),
  run: ({ tmps }, { path }) => {
    const values: number[] = [];
    for (const tmp of tmps) {
      const v = getPath(tmp, path, undefined);
      if (v === null || v === undefined) continue;
      if (typeof v !== "number") throw notANumber(path, v);
      values.push(v);
    }
    const m = mean(values);
    if (m === null) return null;
    // Same operations in the same order as v5, so the result matches to the last bit.
    return Math.sqrt(values.map((x) => Math.pow(x - m, 2)).reduce((a, b) => a + b) / values.length);
  },
});

export const aggregationTransformers: readonly Transformer[] = [
  aggregateArray,
  average,
  averageArrayTeam,
  averageArrayTmp,
  averageTime,
  countMatches,
  deepAverage,
  standardDeviation,
];
