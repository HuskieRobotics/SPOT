/**
 * What the text modules show (#384; docs/spec/09 MO-3, MO-4, MO-4a, F-18, F-27): Stats,
 * ColumnDisplay, SingleDisplay and Grid, as plain functions of the dataset and the teams shown.
 * The dashboard draws them (`src/components/analysis/modules/`); `display.ts` formats each value,
 * as `config:preview` does, so a value reads the same in both.
 *
 * The teams are one team in the team view, and an alliance in Simulate Match (#389).
 *
 * Changed from v5: a missing value is No Data, not 0 (F-27). When values of several teams are
 * combined (`aggrMethod`), only the teams that have one count, and No Data when none has; v5
 * counted a missing value as 0, pulling an alliance's average down. Nothing here changes the
 * teams or the dataset it is given (F-18).
 */
import type { Dataset } from "../engine";
import { getPath } from "../engine";
import { displayValue, NO_DATA, rankTeams, type DisplayOptions, type Rank } from "./display";
import type { TeamKey } from "@/data/team";

export type Sort = 1 | -1 | 0;

/** The options every text module shares (MO-3). */
export interface ValueOptions extends DisplayOptions {
  path: string;
  /** "sum" adds the teams' values; anything else averages them. */
  aggrMethod?: string;
  sort?: Sort;
}

/** v5's rank bands (MO-4): the top 5 %, 25 % and 50 % of ranked teams, then the rest. */
export type RankBand = "top5" | "top25" | "top50" | "top100";

export interface Shown {
  /** What the module shows: the value with its unit, or No Data. */
  text: string;
  /** The value after `multiplier` and `addend`, or null for No Data. */
  value: number | null;
  /** Among every team at the event with a value, when `sort` is set and one team is shown. */
  rank?: Rank & { band: RankBand };
}

/** A team's raw value at `path`, or null. */
export function teamValue(dataset: Dataset, team: TeamKey, path: string): unknown {
  return getPath(dataset.teams[team], path, null);
}

/** v5's thresholds, rounded as v5 rounded them, so a rank keeps its colour. */
export function rankBand({ rank, of }: Rank): RankBand {
  if (rank <= Math.round(of * 0.05)) return "top5";
  if (rank <= Math.round(of * 0.25)) return "top25";
  if (rank <= Math.round(of * 0.5)) return "top50";
  return "top100";
}

/** Every team's displayed value at `path`, for ranking (MO-4a: ties share a rank). */
function rankFor(
  dataset: Dataset,
  team: TeamKey,
  options: ValueOptions,
): (Rank & { band: RankBand }) | undefined {
  const sort = options.sort;
  if (sort !== 1 && sort !== -1) return undefined;
  const values = new Map<TeamKey, number | null>();
  for (const t of Object.keys(dataset.teams))
    values.set(t, displayValue(teamValue(dataset, t, options.path), options).value);
  const rank = rankTeams(values, sort).get(team);
  return rank && { ...rank, band: rankBand(rank) };
}

/**
 * The teams' value at `path`, combined: the sum with `aggrMethod: "sum"`, else the average, over
 * the teams that have a number. Null when none has.
 */
export function combined(
  dataset: Dataset,
  teams: readonly TeamKey[],
  path: string,
  aggrMethod?: string,
): number | null {
  const numbers = teams
    .map((t) => teamValue(dataset, t, path))
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (numbers.length === 0) return null;
  const sum = numbers.reduce((a, b) => a + b, 0);
  return aggrMethod === "sum" ? sum : sum / numbers.length;
}

/** One value of Stats or SingleDisplay: the teams combined, ranked when one team is shown. */
export function shownValue(
  dataset: Dataset,
  teams: readonly TeamKey[],
  options: ValueOptions,
): Shown {
  if (options.string) {
    const raw = teams.length === 1 ? teamValue(dataset, teams[0], options.path) : null;
    return { ...displayValue(raw, options) };
  }
  const shown = displayValue(combined(dataset, teams, options.path, options.aggrMethod), options);
  if (shown.value === null || teams.length !== 1) return shown;
  const rank = rankFor(dataset, teams[0], options);
  return rank ? { ...shown, rank } : shown;
}

/** ColumnDisplay: one column per team, each ranked among the event's teams (MO-4). */
export function columns(
  dataset: Dataset,
  teams: readonly TeamKey[],
  options: ValueOptions,
): (Shown & { team: TeamKey })[] {
  return teams.map((team) => {
    const shown = displayValue(teamValue(dataset, team, options.path), options);
    const rank =
      shown.value === null || options.string ? undefined : rankFor(dataset, team, options);
    return rank ? { team, ...shown, rank } : { team, ...shown };
  });
}

export interface GridOptions {
  rows: number;
  cols: number;
  decimals?: number;
  /** The value at the faintest colour; 0 when not set. */
  min?: number;
  /** The value at the full colour; the largest cell's value when not set. */
  max?: number;
  cells: { x: number; y: number; path: string; hex: string }[];
}

export interface GridCell {
  x: number;
  y: number;
  text: string;
  /** The cell's colour, its alpha scaled between `min` and `max`. */
  color: string;
}

/**
 * Grid: each cell's value summed over the teams, on its colour with an alpha from 30 at `min` to
 * 255 at `max` and beyond, as in v5. v5's alpha fell below 30 for a value under `min`, and was
 * not a number without `min` and `max`, and either broke the colour; here it stays between 30 and
 * 255, `min` is 0 and `max` the largest value when not set. A cell with no value shows No Data,
 * faint.
 */
export function gridCells(
  dataset: Dataset,
  teams: readonly TeamKey[],
  options: GridOptions,
): GridCell[] {
  const values = options.cells.map((cell) => combined(dataset, teams, cell.path, "sum"));
  const min = options.min ?? 0;
  const max = options.max ?? Math.max(min, ...values.filter((v): v is number => v !== null));
  const slope = 225 / (max - min || 1);
  return options.cells.map((cell, i) => {
    const value = values[i];
    const alpha =
      value === null ? 30 : Math.floor(Math.min(255, Math.max(30, 30 + slope * (value - min))));
    return {
      x: cell.x,
      y: cell.y,
      text: value === null ? NO_DATA : displayValue(value, { decimals: options.decimals }).text,
      color: `${cell.hex}${alpha.toString(16).padStart(2, "0")}`,
    };
  });
}
