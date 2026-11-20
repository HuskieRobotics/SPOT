/**
 * Arithmetic transformers (docs/spec/09, #312): sum, subtract, multiply, ratio, weightedSum,
 * weightedSumAverage, sumAverage. Each works on one performance (`tmp`) or on a team's own
 * outputs (`team`), with the same options and the same rules:
 *
 * - A missing path counts as 0 (1 for a `multiply` factor), as in v5. Counts that were never
 *   pressed are missing or 0, and both mean "none".
 * - A null input ("No Data", DM-1b) makes the result null (decided 2026-11-20). v5's equivalent
 *   was NaN, which spread through every calculation in the same way.
 * - Any other value that is not a number is an error naming the path, where v5 would have
 *   concatenated strings or produced NaN silently.
 */
import { getPath } from "../engine/path";
import { builtInOptions, defineTransformer, type Transformer } from "../engine/registry";

type Target = Record<string, unknown>;

/** The number at `path`, `ifMissing` when there is none, null for "No Data". */
export function numberAt(target: Target, path: string, ifMissing: number): number | null {
  const value = getPath(target, path, ifMissing);
  if (value === null || typeof value === "number") return value;
  throw new Error(`"${path}" holds ${JSON.stringify(value)}, which is not a number`);
}

/** Register the same calculation as a tmp and a team transformer. */
function both<O>(
  name: string,
  schema: string,
  summary: string,
  compute: (target: Target, options: O) => unknown,
): Transformer[] {
  return [
    defineTransformer<O>({
      type: "tmp",
      scope: "each",
      name,
      summary,
      optionsSchema: builtInOptions(schema),
      run: (tmp, options) => compute(tmp, options),
    }),
    defineTransformer<O>({
      type: "team",
      scope: "each",
      name,
      summary,
      optionsSchema: builtInOptions(schema),
      run: ({ data }, options) => compute(data, options),
    }),
  ];
}

/** Add values left to right from 0, as v5 did, so floating-point results match exactly. */
function total(values: readonly (number | null)[]): number | null {
  let sum = 0;
  for (const v of values) {
    if (v === null) return null;
    sum += v;
  }
  return sum;
}

export const sum = both<{ addends: string[] }>(
  "sum",
  "sum",
  "Add the values at several paths",
  (target, { addends }) => total(addends.map((p) => numberAt(target, p, 0))),
);

export const subtract = both<{ minuend: string; subtrahend: string }>(
  "subtract",
  "subtract",
  "Subtract one value from another",
  (target, { minuend, subtrahend }) => {
    const a = numberAt(target, minuend, 0);
    const b = numberAt(target, subtrahend, 0);
    return a === null || b === null ? null : a - b;
  },
);

export const multiply = both<{ multiplicands: (string | { path: string })[]; weight: number }>(
  "multiply",
  "multiply",
  "Multiply the values at several paths, then by a weight",
  (target, { multiplicands, weight }) => {
    let product = 1;
    for (const m of multiplicands) {
      const v = numberAt(target, typeof m === "string" ? m : m.path, 1);
      if (v === null) return null;
      product *= v;
    }
    return product * weight;
  },
);

/**
 * When the denominator is 0, the result is `divByZero` exactly as configured, including 0, and
 * null when it is not set (F-24, F-25). A configured value is deliberate: 0 accuracy or a
 * full-match time ranks a team that never scores last, and keeps it in combined rankings.
 */
export const ratio = both<{
  numerator: (string | number)[];
  denominator: (string | number)[];
  divByZero?: unknown;
}>(
  "ratio",
  "ratio",
  "Divide the sum of some values by the sum of others",
  (target, { numerator, denominator, divByZero }) => {
    const value = (item: string | number) =>
      typeof item === "number" ? item : numberAt(target, item, 0);
    const top = total(numerator.map(value));
    const bottom = total(denominator.map(value));
    if (top === null || bottom === null) return null;
    if (bottom === 0) return divByZero === undefined ? null : structuredClone(divByZero);
    return top / bottom;
  },
);

export const weightedSum = both<{ weightedPaths: Record<string, number> }>(
  "weightedSum",
  "weightedSum",
  "Add values, each multiplied by its weight (points per game piece, for example)",
  (target, { weightedPaths }) => {
    let result = 0;
    for (const [path, weight] of Object.entries(weightedPaths)) {
      const v = numberAt(target, path, 0);
      if (v === null) return null;
      result += v * weight;
    }
    return result;
  },
);

/**
 * The average weight of a set of counts: Σ(count × weight) / Σcount, typically the average
 * rating from counts of each rating. Null when every count is 0. The team variant takes the
 * same options over the team's own paths (decided 2026-11-20; v5's team variant was a different,
 * unused calculation over nested objects).
 */
export const weightedSumAverage = both<{ weightedPaths: Record<string, number> }>(
  "weightedSumAverage",
  "weightedSumAverage",
  "Average of weights, weighted by counts (the average rating from rating counts)",
  (target, { weightedPaths }) => {
    let weighted = 0;
    let count = 0;
    for (const [path, weight] of Object.entries(weightedPaths)) {
      const n = numberAt(target, path, 0);
      if (n === null) return null;
      weighted += n * weight;
      count += n;
    }
    return count === 0 ? null : weighted / count;
  },
);

/**
 * Combine several averages into one, each weighted by its own count: Σ(average × count) / Σcount
 * over the groups. A group with no counts, or with no average, is left out. `countPaths` are
 * explicit (decided 2026-11-20); v5 inferred them from composite-id names, which v6 does not have.
 */
export const sumAverage = both<{ groups: { averagePath: string; countPaths: string[] }[] }>(
  "sumAverage",
  "sumAverage",
  "Combine averages, each weighted by how many values it was taken over",
  (target, { groups }) => {
    let weighted = 0;
    let count = 0;
    for (const { averagePath, countPaths } of groups) {
      const n = total(countPaths.map((p) => numberAt(target, p, 0)));
      if (n === null) return null;
      if (n === 0) continue;
      const average = getPath(target, averagePath, null);
      if (average === null) continue;
      if (typeof average !== "number") {
        throw new Error(`"${averagePath}" holds ${JSON.stringify(average)}, which is not a number`);
      }
      weighted += average * n;
      count += n;
    }
    return count === 0 ? null : weighted / count;
  },
);

export const arithmeticTransformers: readonly Transformer[] = [
  ...multiply,
  ...ratio,
  ...subtract,
  ...sum,
  ...sumAverage,
  ...weightedSum,
  ...weightedSumAverage,
];
