/**
 * A worked example of an extension module (ADR 0005, #391), described in
 * docs/extension-modules.md: where one team stands among the event's teams on a value, such as
 * "better than 82 % of the other teams with a value".
 *
 *     {
 *       "view": "team",
 *       "module": "Percentile",
 *       "name": "Auto Points",
 *       "options": { "path": "averageScores.auto" },
 *       "position": "side"
 *     }
 *
 * It is not registered, so an entry naming "Percentile" is reported as unknown. To use it, move it
 * up into src/components/analysis/extensions/ and add its export line to the index there.
 *
 * What it shows:
 * - options typed in TypeScript and described by a JSON Schema that rejects unknown options;
 * - `modulesDef("path")`, so config:check checks the path as it checks a built-in module's: a
 *   path the pipeline never writes is an error;
 * - No Data (F-27): a team without the value is not compared, and a team shown without one says
 *   No Data;
 * - plain elements only, and no hooks, so config:check can read this file on the server.
 */
import { getPath } from "@/analysis/engine";
import { NO_DATA } from "@/analysis/modules/display";
import { defineModule, modulesDef } from "../../extension-api";

/** The options, as an entry gives them. The schema below must describe the same shape. */
export interface PercentileOptions {
  path: string;
  lowerIsBetter?: boolean;
}

export const percentile = defineModule<PercentileOptions>({
  name: "Percentile",
  summary: "Where one team stands among the event's teams on a value",
  optionsSchema: {
    type: "object",
    // Required for every extension: a misspelled option is an error, not silently ignored.
    additionalProperties: false,
    required: ["path"],
    properties: {
      path: { ...modulesDef("path"), description: "The team value to compare." },
      lowerIsBetter: {
        type: "boolean",
        description: "True when a lower value is better, such as a time. False when left out.",
      },
    },
  },
  component: ({ teams, dataset, options }) => {
    if (teams.length !== 1)
      return (
        <p className="text-muted-foreground text-center text-sm">Shown for one team at a time.</p>
      );
    const valueOf = (team: string) => {
      const value = getPath(dataset.teams[team], options.path, null);
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    };
    const own = valueOf(teams[0]);
    const others = Object.keys(dataset.teams)
      .filter((t) => t !== teams[0])
      .map(valueOf)
      .filter((v): v is number => v !== null);
    if (own === null || others.length === 0)
      return <p className="text-muted-foreground py-4 text-center italic">{NO_DATA}</p>;
    const worse = others.filter((v) => (options.lowerIsBetter ? v > own : v < own)).length;
    const percent = Math.round((100 * worse) / others.length);
    return (
      <div className="flex flex-col gap-2" data-percent={percent}>
        <p className="text-center text-3xl font-semibold">{percent}%</p>
        <div className="bg-muted h-2 rounded-full">
          <div className="bg-primary h-2 rounded-full" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-muted-foreground text-center text-sm">
          Better than {percent} % of the {others.length} other teams with a value.
        </p>
      </div>
    );
  },
});
