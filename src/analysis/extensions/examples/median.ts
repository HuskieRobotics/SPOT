/**
 * A worked example of an extension transformer (ADR 0005, #316), described in
 * docs/extension-transformers.md: the median of a number over a team's matches, which one
 * unusual match moves less than it moves the average.
 *
 * It is not registered, so a pipeline entry naming "median" is reported as unknown. To use it,
 * move it up into src/analysis/extensions/ and add its export line to the index there.
 *
 * What it shows:
 * - options typed in TypeScript and described by a JSON Schema that rejects unknown options;
 * - reusing the pipeline schema's definitions (`pipelineDef("path")`), so a path option is
 *   checked the same way as a built-in transformer's;
 * - No Data (TR-12): a match with no value, or `null`, is skipped, and a team with no values
 *   gets `ifNone` when it is configured, else `null`;
 * - a clear error, naming the path, for a value that is not a number. The pipeline reports it with
 *   the team it failed on, and the other teams and entries still run (TR-10).
 */
import { getPath } from "../../engine/path";
import { defineTransformer, pipelineDef } from "../../engine/registry";

/** The options, as a pipeline entry gives them. The schema below must describe the same shape. */
export interface MedianOptions {
  path: string;
  ifNone?: number;
}

export const median = defineTransformer<MedianOptions>({
  type: "team",
  scope: "each",
  name: "median",
  summary: "Middle value of a number over a team's matches",
  optionsSchema: {
    type: "object",
    // Required for every extension: a misspelled option is an error, not silently ignored.
    additionalProperties: false,
    required: ["path"],
    properties: {
      path: {
        ...pipelineDef("path"),
        description: "Path to a number on each match. Matches with no value are skipped.",
      },
      ifNone: {
        type: "number",
        description:
          "Value to write when the team has no values. Leave it out to write null (No Data).",
      },
    },
  },
  run: ({ tmps }, { path, ifNone }) => {
    const values: number[] = [];
    for (const tmp of tmps) {
      // A missing value and a null value are both No Data.
      const value = getPath(tmp, path, null);
      if (value === null) continue;
      if (typeof value !== "number") {
        throw new Error(`"${path}" holds ${JSON.stringify(value)}, which is not a number`);
      }
      values.push(value);
    }
    if (values.length === 0) return ifNone ?? null;
    values.sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  },
});
