/** Dashboard module catalog: what each module shows and the form fields the builder renders. */

export type FieldKind = "string" | "number" | "boolean" | "path" | "paths" | "select" | "list" | "json" | "keyValue" | "actionIds" | "color" | "fieldMap";

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  help?: string;
  choices?: { value: string | number; label: string }[];
  /** For kind "list": fields of each item. */
  itemFields?: FieldSpec[];
  /** For path fields: team or tmp (match) object. */
  scope?: "team" | "tmp";
  default?: unknown;
}

export interface ModuleDef {
  name: string;
  label: string;
  views: ("team" | "match")[];
  description: string;
  fields: FieldSpec[];
  /** Default options when a module is added in the builder. */
  defaults: Record<string, unknown>;
}

const aggr: FieldSpec = {
  key: "aggrMethod",
  label: "Combine teams by",
  kind: "select",
  choices: [
    { value: "", label: "Average" },
    { value: "sum", label: "Sum" },
  ],
  help: "Used in match view where several teams are combined.",
};
const sort: FieldSpec = {
  key: "sort",
  label: "Rank",
  kind: "select",
  choices: [
    { value: 0, label: "Don't rank" },
    { value: 1, label: "Higher is better" },
    { value: -1, label: "Lower is better" },
  ],
};
const numberFormat: FieldSpec[] = [
  { key: "decimals", label: "Decimals", kind: "number" },
  { key: "unit", label: "Unit", kind: "string" },
  { key: "multiplier", label: "Multiply by", kind: "number" },
  { key: "addend", label: "Then add", kind: "number" },
  { key: "hideIfValue", label: "Show 'No Data' when value is", kind: "json" },
];

export const MODULES: ModuleDef[] = [
  {
    name: "Stats",
    label: "Stat list",
    views: ["team", "match"],
    description: "A list of labelled numbers with optional rank badges (#3 of 40).",
    fields: [{ key: "list", label: "Stats", kind: "list", itemFields: [{ key: "name", label: "Label", kind: "string" }, { key: "path", label: "Value", kind: "path", scope: "team" }, aggr, sort, ...numberFormat] }],
    defaults: { list: [{ name: "Matches", path: "matchesPlayed", decimals: 0 }] },
  },
  {
    name: "Bar",
    label: "Bar chart",
    views: ["team", "match"],
    description: "Compare several values side by side.",
    fields: [{ key: "bars", label: "Bars", kind: "list", itemFields: [{ key: "name", label: "Label", kind: "string" }, { key: "path", label: "Value", kind: "path", scope: "team" }, aggr] }],
    defaults: { bars: [] },
  },
  {
    name: "Pie",
    label: "Donut chart",
    views: ["team", "match"],
    description: "Share of each value in the total (e.g. where points come from).",
    fields: [
      { key: "slices", label: "Slices", kind: "list", itemFields: [{ key: "name", label: "Label", kind: "string" }, { key: "path", label: "Value", kind: "path", scope: "team" }, aggr] },
      { key: "unit", label: "Unit", kind: "string" },
      { key: "decimals", label: "Decimals", kind: "number", default: 2 },
    ],
    defaults: { slices: [] },
  },
  {
    name: "PerformanceTimePlot",
    label: "Per-match line chart",
    views: ["team"],
    description: "How match values changed over the event (one line per value).",
    fields: [{ key: "trackedStats", label: "Match values", kind: "paths", scope: "tmp" }],
    defaults: { trackedStats: [] },
  },
  {
    name: "HeatmapScatterPlot",
    label: "Field heatmap",
    views: ["team", "match"],
    description: "Plots tapped field positions of actions over the field image, with a density heat layer.",
    fields: [
      { key: "aggregatedActionsPath", label: "Team list of actions", kind: "path", scope: "team", help: "Usually produced by 'Combine lists across matches' of actionQueue." },
      { key: "coordinatePath", label: "Position inside each action", kind: "string", default: "other.pos" },
      { key: "actionGroups", label: "Action groups (first group drives the heat layer)", kind: "list", itemFields: [{ key: "name", label: "Name", kind: "string" }, { key: "actions", label: "Action ids", kind: "actionIds" }] },
      { key: "actionLabels", label: "Action labels", kind: "keyValue" },
      { key: "imgPath", label: "Field map", kind: "fieldMap", help: "Pick a saved map (project builder → Field map tab). \"Same as scouting\" follows the project." },
      { key: "halfField", label: "Fold onto a half field (2026)", kind: "boolean" },
    ],
    defaults: { coordinatePath: "other.pos", aggregatedActionsPath: "aggregatedActions", actionGroups: [], actionLabels: {} },
  },
  {
    name: "RadarChart",
    label: "Radar chart",
    views: ["team"],
    description: "Ratings (0–4) across sections such as match phases.",
    fields: [
      { key: "sections", label: "Sections (repeat the first one last to close the shape)", kind: "list", itemFields: [{ key: "name", label: "Name", kind: "string" }] },
      { key: "lines", label: "Lines", kind: "list", itemFields: [{ key: "name", label: "Name", kind: "string" }, { key: "times", label: "Value per section [{name, path}]", kind: "json" }] },
      { key: "max", label: "Axis maximum", kind: "number", default: 4 },
    ],
    defaults: { sections: [], lines: [] },
  },
  {
    name: "SingleDisplay",
    label: "Big number",
    views: ["match"],
    description: "One value for an alliance, or the chance of winning when 'Whole match' is on.",
    fields: [
      { key: "path", label: "Value", kind: "path", scope: "team" },
      {
        key: "aggrMethod",
        label: "Combine teams by",
        kind: "select",
        choices: [
          { value: "", label: "Average" },
          { value: "sum", label: "Sum" },
          { value: "percentChanceOfWinning", label: "% chance of winning (needs Whole match)" },
        ],
      },
      { key: "stdPath", label: "Std deviation path (win chance)", kind: "path", scope: "team", default: "standardDeviation" },
      ...numberFormat,
    ],
    defaults: { path: "averageScores.total", aggrMethod: "sum", decimals: 1 },
  },
  {
    name: "ColumnDisplay",
    label: "Team columns",
    views: ["match"],
    description: "One column per team with value and rank.",
    fields: [{ key: "path", label: "Value", kind: "path", scope: "team" }, sort, { key: "string", label: "Show raw text", kind: "boolean" }, ...numberFormat],
    defaults: { path: "averageScores.total", decimals: 1, sort: 1 },
  },
  {
    name: "Grid",
    label: "Colored grid",
    views: ["team", "match"],
    description: "A grid of cells shaded by value (e.g. scoring locations).",
    fields: [
      { key: "rows", label: "Rows", kind: "number" },
      { key: "cols", label: "Columns", kind: "number" },
      { key: "min", label: "Value for lightest", kind: "number" },
      { key: "max", label: "Value for darkest", kind: "number" },
      { key: "decimals", label: "Decimals", kind: "number" },
      { key: "cells", label: "Cells", kind: "list", itemFields: [{ key: "x", label: "Column", kind: "number" }, { key: "y", label: "Row", kind: "number" }, { key: "path", label: "Value", kind: "path", scope: "team" }, { key: "hex", label: "Color", kind: "color" }] },
    ],
    defaults: { rows: 2, cols: 3, min: 0, max: 1, decimals: 1, cells: [] },
  },
  {
    name: "Text",
    label: "Text / list value",
    views: ["team", "match"],
    description: "Shows a text value (e.g. 'possible climbs: 2, 3') or a list joined with commas.",
    fields: [{ key: "path", label: "Value", kind: "path", scope: "team" }],
    defaults: { path: "" },
  },
  { name: "Divider", label: "Section heading", views: ["team", "match"], description: "A titled divider to group modules.", fields: [], defaults: {} },
];

export const getModuleDef = (name: string) => MODULES.find((m) => m.name === name);
