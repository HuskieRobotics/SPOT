/**
 * What the chart modules draw (#385; docs/spec/09 MO-3, MO-5, F-18, F-27): Bar, Pie,
 * PerformanceTimePlot and RadarChart, as plain functions of the dataset and the teams shown. The
 * dashboard draws them on Plotly (`src/components/analysis/modules/`).
 *
 * Changed from v5: a missing value is No Data, not 0 (F-27). Several teams are combined over the
 * teams that have a value, as the text modules do (`combined`). A chart with nothing to draw says
 * No Data instead of drawing empty axes.
 */
import type { Dataset } from "../engine";
import { comparePerformances, getPath } from "../engine";
import { displayValue } from "./display";
import { combined } from "./values";
import type { TeamKey } from "@/data/team";
import { matchLabel } from "@/schedule/labels";

/** A named team value, combined over the teams shown (MO-3). */
export interface NamedPath {
  name: string;
  path: string;
  aggrMethod?: "sum" | "average";
}

/** One line or set of bars: a value, or null for No Data, per label. */
export interface Series {
  name: string;
  values: (number | null)[];
}

/** A chart's values: the labels along one axis and a series per line, bar set or slice set. */
export interface ChartValues {
  labels: string[];
  series: Series[];
}

/** True when some value is a number: otherwise the module shows No Data (#385). */
export function hasData({ series }: ChartValues): boolean {
  return series.some((s) => s.values.some((v) => v !== null));
}

/** A value as a chart's table and hover show it: at most two decimals, or No Data. */
export function chartText(value: number | null): string {
  return displayValue(value, {}, 2).text;
}

/** Bar: one bar per entry of `bars`, the teams combined. */
export function barValues(
  dataset: Dataset,
  teams: readonly TeamKey[],
  bars: readonly NamedPath[],
): ChartValues {
  return {
    labels: bars.map((b) => b.name),
    series: [{ name: "", values: bars.map((b) => combined(dataset, teams, b.path, b.aggrMethod)) }],
  };
}

export interface PieOptions {
  slices: NamedPath[];
  unit?: string;
  decimals?: number;
}

export interface PieSlices {
  labels: string[];
  /** The slice sizes: a negative value or No Data is an empty slice, as in v5. */
  sizes: number[];
  /** What each slice shows, `decimals` and `unit` applied; No Data for a missing value. */
  texts: string[];
}

/** Pie: one slice per entry of `slices`, the teams combined. Null when there is nothing to draw. */
export function pieSlices(
  dataset: Dataset,
  teams: readonly TeamKey[],
  options: PieOptions,
): PieSlices | null {
  const values = options.slices.map((s) => combined(dataset, teams, s.path, s.aggrMethod));
  const sizes = values.map((v) => Math.max(0, v ?? 0));
  if (!sizes.some((s) => s > 0)) return null;
  return {
    labels: options.slices.map((s) => s.name),
    sizes,
    texts: values.map(
      (v) => displayValue(v, { decimals: options.decimals, unit: options.unit }, 2).text,
    ),
  };
}

/**
 * PerformanceTimePlot: each of the team's matches, qualifications then playoffs (TR-6, DV-17),
 * and a line per tracked value of each match.
 */
export function performanceLines(
  dataset: Dataset,
  team: TeamKey,
  trackedStats: readonly string[],
): ChartValues & { short: string[] } {
  const tmps = dataset.tmps.filter((t) => t.team === team).sort(comparePerformances);
  const labels = tmps.map((t) => matchLabel(t.level, t.matchNumber));
  return {
    labels,
    // "Q12", "P5", "F2" along the axis, so a phone's narrow chart has room for them.
    short: labels.map((l) => l.replace(/^(\w)\w* /, "$1")),
    series: trackedStats.map((stat) => ({
      name: stat,
      values: tmps.map((t) => {
        const value = getPath(t, stat, null);
        return typeof value === "number" && Number.isFinite(value) ? value : null;
      }),
    })),
  };
}

export interface RadarOptions {
  sections: { name: string }[];
  lines: { name: string; times: { name: string; path: string }[] }[];
}

/** The radial axis runs from 0 to 4, v5's rating scale, or to the largest value above it. */
export const RADAR_MAX = 4;

export interface RadarLines extends ChartValues {
  /** The end of the radial axis. */
  max: number;
  /** True when some team has a value: "none" alone is nothing to draw. */
  measured: boolean;
}

/**
 * RadarChart: a closed line per entry of `lines` (per team when several are shown), a point per
 * section. A time's `path` of "none" is 0. The first section closes the line: v5 needed it
 * repeated last in the configuration, and a configuration that repeats it still works.
 */
export function radarLines(
  dataset: Dataset,
  teams: readonly TeamKey[],
  options: RadarOptions,
): RadarLines {
  const names = options.sections.map((s) => s.name);
  const closed = names.length > 1 && names[0] === names[names.length - 1];
  const labels = closed || names.length === 0 ? names : [...names, names[0]];
  let measured = false;
  const series = teams.flatMap((team) =>
    options.lines.map((line) => {
      const values = names.map((_, i): number | null => {
        const path = line.times[i]?.path;
        if (path === "none") return 0;
        if (path === undefined) return null;
        const value = getPath(dataset.teams[team], path, null);
        if (typeof value !== "number" || !Number.isFinite(value)) return null;
        measured = true;
        return value;
      });
      return {
        name: teams.length > 1 ? `${team} ${line.name}` : line.name,
        values: closed || values.length === 0 ? values : [...values, values[0]],
      };
    }),
  );
  const largest = Math.max(...series.flatMap((s) => s.values.filter((v) => v !== null)));
  return { labels, series, max: Math.max(RADAR_MAX, largest), measured };
}
