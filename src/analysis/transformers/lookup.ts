/**
 * Lookup transformers (docs/spec/09, #312): `map` (per performance) and `threshold` (per team),
 * the two that turn values into labels.
 */
import { getPath } from "../engine/path";
import { builtInOptions, defineTransformer, type Transformer } from "../engine/registry";
import { numberAt } from "./arithmetic";

/**
 * Translate the value at `path` through a table: `{ "climb1": 4 }` turns "climb1" into 4.
 * A missing path looks up "" (as in v5). A value with no entry in the table gives null.
 */
export const map = defineTransformer<{ path: string; map: Record<string, unknown> }>({
  type: "tmp",
  scope: "each",
  name: "map",
  summary: "Translate a value through a table",
  optionsSchema: builtInOptions("map"),
  run: (tmp, options) => {
    const value = getPath(tmp, options.path, "");
    if (typeof value === "object" && value !== null) return null;
    const key = String(value);
    // Own entries only, so a value such as "constructor" never finds something by accident.
    if (!Object.hasOwn(options.map, key)) return null;
    return structuredClone(options.map[key]);
  },
});

/**
 * Names of the paths whose value is above `threshold` (every name when it is not set). With a
 * `separator` the names are joined into one string, and `none` is written when no name passes
 * (null when `none` is not set). A null value ("No Data") never passes.
 */
export const threshold = defineTransformer<{
  paths: Record<string, string>;
  threshold?: number;
  separator?: string;
  none?: string;
}>({
  type: "team",
  scope: "each",
  name: "threshold",
  summary: "List the names whose value is above a threshold",
  optionsSchema: builtInOptions("threshold"),
  run: ({ data }, options) => {
    const passing: string[] = [];
    for (const [path, name] of Object.entries(options.paths)) {
      if (options.threshold === undefined) {
        passing.push(name);
        continue;
      }
      const value = numberAt(data, path, 0);
      if (value !== null && value > options.threshold) passing.push(name);
    }
    if (options.separator === undefined) return passing;
    if (passing.length === 0 && options.none !== "") return options.none ?? null;
    return passing.join(options.separator);
  },
});

export const lookupTransformers: readonly Transformer[] = [map, threshold];
