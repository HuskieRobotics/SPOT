/**
 * Every built-in module, as entries of `analysis-modules.json` (#392, docs/spec/09), for the smoke
 * and screenshot tests in `modules.spec.ts`. They are drawn on team 3061 at 2026mnwi, the oracle's
 * real 2026 event, which has the field positions the heatmap needs. Each module appears twice:
 * once on values 3061 has, and once on values the 2026 pipeline never writes, which must show
 * No Data (F-27).
 *
 * The options are written out here rather than read from the season's file, so the screenshots
 * do not change when the active configuration does (at kickoff it becomes 2027's).
 */
import type { ModuleEntry } from "../../src/config/types";

/** A value the 2026 pipeline never writes. */
const NONE = "averages.notWritten";

const RADAR_SECTIONS = ["Auto", "Transition", "Active 1", "Active 2", "Endgame"];
const radar = (paths: (period: string, metric: string) => string) => ({
  sections: RADAR_SECTIONS.map((name) => ({ name })),
  lines: ["Shooting", "Passing", "Storing"].map((metric) => ({
    name: metric,
    times: RADAR_SECTIONS.map((name) => ({ name, path: paths(name, metric) })),
  })),
});
const RATING_PREFIX: Record<string, string> = {
  Auto: "auto",
  Transition: "teleopTransition",
  "Active 1": "activeShift1",
  "Active 2": "activeShift2",
  Endgame: "endgame",
};

/** The modules, each with its data; `empty` is the same module on values nobody has. */
const modules: { entry: Omit<ModuleEntry, "name">; empty: ModuleEntry["options"] }[] = [
  {
    entry: {
      view: "team",
      module: "Stats",
      position: "side",
      options: {
        list: [
          { name: "Fuel OPR", path: "opr.Hub Total Fuel Count", decimals: 2, sort: 1 },
          { name: "Shooting Rating", path: "averageScores.shootingRating", decimals: 2, sort: 1 },
          {
            name: "Shooting Cycle",
            path: "cycles.shootingTime.averageTimeSeconds",
            decimals: 2,
            sort: -1,
            unit: "s",
          },
        ],
      },
    },
    empty: { list: [{ name: "Nothing", path: NONE, decimals: 2, sort: 1 }] },
  },
  {
    entry: {
      view: "team",
      module: "SingleDisplay",
      position: "side",
      options: { path: "averageScores.shootingRating", decimals: 2 },
    },
    empty: { path: NONE, decimals: 2 },
  },
  {
    entry: {
      view: "team",
      module: "ColumnDisplay",
      position: "side",
      options: { path: "opr.Hub Total Fuel Count", decimals: 1, sort: 1 },
    },
    empty: { path: NONE, decimals: 1, sort: 1 },
  },
  {
    entry: {
      view: "team",
      module: "Grid",
      position: "side",
      options: {
        rows: 2,
        cols: 2,
        decimals: 1,
        cells: [
          { x: 1, y: 1, path: "averages.shooting", hex: "#e6bd39" },
          { x: 2, y: 1, path: "averages.passing", hex: "#5a929e" },
          { x: 1, y: 2, path: "averages.storing", hex: "#00b844" },
          { x: 2, y: 2, path: "averages.defense", hex: "#ff4436" },
        ],
      },
    },
    empty: { rows: 1, cols: 1, cells: [{ x: 1, y: 1, path: NONE, hex: "#e6bd39" }] },
  },
  {
    entry: {
      view: "team",
      module: "Bar",
      position: "main",
      options: {
        bars: [
          { name: "Shooting", path: "averages.shooting" },
          { name: "Passing", path: "averages.passing" },
          { name: "Storing", path: "averages.storing" },
          { name: "Defense", path: "averages.defense" },
        ],
      },
    },
    empty: { bars: [{ name: "Nothing", path: NONE }] },
  },
  {
    entry: {
      view: "team",
      module: "Pie",
      position: "main",
      options: {
        unit: "s",
        slices: [
          { name: "Shooting", path: "cycles.shootingTime.averageTimeSeconds" },
          { name: "Passing", path: "cycles.passingTime.averageTimeSeconds" },
          { name: "Storing", path: "cycles.storingTime.averageTimeSeconds" },
        ],
      },
    },
    empty: { slices: [{ name: "Nothing", path: NONE }] },
  },
  {
    entry: {
      view: "team",
      module: "PerformanceTimePlot",
      position: "main",
      options: { trackedStats: ["counts.shooting", "counts.passing", "counts.storing"] },
    },
    empty: { trackedStats: ["counts.notWritten"] },
  },
  {
    entry: {
      view: "team",
      module: "RadarChart",
      position: "main",
      options: radar((period, metric) => `averageScores.${RATING_PREFIX[period]}${metric}Rating`),
    },
    empty: radar(() => NONE),
  },
  {
    entry: {
      view: "team",
      module: "HeatmapScatterPlot",
      position: "main",
      options: {
        coordinatePath: "other.pos",
        aggregatedActionsPath: "aggregatedActions",
        actionGroups: [
          { name: "Start Shooting", actions: ["StartShooting"], phases: ["teleop", "endgame"] },
        ],
        actionLabels: { StartShooting: "Start Shooting" },
        imgPath: "img/half-field.svg",
        coordinateTransform: "foldHalfField",
      },
    },
    // 3061 never pressed AttemptClimb at 2026mnwi.
    empty: {
      coordinatePath: "other.pos",
      aggregatedActionsPath: "aggregatedActions",
      actionGroups: [{ name: "Attempt Climb", actions: ["AttemptClimb"] }],
      actionLabels: { AttemptClimb: "Attempt Climb" },
      imgPath: "img/half-field.svg",
    },
  },
];

/** The modules a screenshot is taken of, by name: each module drawn with data, and the divider. */
export const WITH_DATA = ["Divider", ...modules.map((m) => m.entry.module)];

/** The name of a module's card drawn on values nobody has. */
export const withoutData = (module: string) => `${module} without data`;

/** Every built-in module: a divider, each module with data, then each without. */
export const EVERY_MODULE: ModuleEntry[] = [
  { view: "team", module: "Divider", name: "Divider", options: {}, position: "main" },
  ...modules.map((m) => ({ ...m.entry, name: m.entry.module }) as ModuleEntry),
  ...modules.map(
    (m) => ({ ...m.entry, name: withoutData(m.entry.module), options: m.empty }) as ModuleEntry,
  ),
];
