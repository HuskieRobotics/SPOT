/**
 * How a module shows a team value (docs/spec/09 MO-3, MO-4): the common options `multiplier`,
 * `addend`, `hideIfValue`, `decimals` and `unit`, and the rank among teams when `sort` is set.
 * Pure, so config:preview (#318) and the Phase 3 dashboard show the same text.
 *
 * Changed from v5: a missing value is No Data (DM-1b). v5 read a missing path as 0, so a module
 * naming a path the pipeline never wrote showed 0 for every team and ranked them all (F-27).
 * Ties share a rank: five teams with the best value are all #1, and the next is #6.
 */
import type { TeamKey } from "@/data/team";

export interface DisplayOptions {
  multiplier?: number;
  addend?: number;
  decimals?: number;
  unit?: string;
  hideIfValue?: unknown;
  /** ColumnDisplay: show the raw string. */
  string?: boolean;
}

export const NO_DATA = "No Data";

export interface Displayed {
  /** The number after `multiplier` and `addend`, or null for No Data. */
  value: number | null;
  /** What the module shows. */
  text: string;
}

/** A team value as a module shows it. `maxDecimals` rounds when `decimals` is not set. */
export function displayValue(
  raw: unknown,
  options: DisplayOptions = {},
  maxDecimals?: number,
): Displayed {
  if (options.string) {
    return raw === null || raw === undefined || raw === ""
      ? { value: null, text: NO_DATA }
      : { value: null, text: String(raw) };
  }
  if (typeof raw !== "number" || !Number.isFinite(raw)) return { value: null, text: NO_DATA };
  const value = raw * (options.multiplier ?? 1) + (options.addend ?? 0);
  if (!Number.isFinite(value) || value === options.hideIfValue) {
    return { value: null, text: NO_DATA };
  }
  const decimals =
    options.decimals ??
    (maxDecimals !== undefined && !Number.isInteger(value) ? maxDecimals : undefined);
  const number =
    decimals === undefined
      ? String(value)
      : options.decimals === undefined
        ? String(Number(value.toFixed(decimals)))
        : value.toFixed(decimals);
  return { value, text: `${number}${options.unit ?? ""}` };
}

export interface Rank {
  rank: number;
  /** How many teams have a value to rank. */
  of: number;
}

/**
 * Each team's rank by its displayed value: `sort` 1 puts higher values first, -1 lower. Teams
 * with No Data are not ranked.
 */
export function rankTeams(
  values: ReadonlyMap<TeamKey, number | null>,
  sort: 1 | -1,
): Map<TeamKey, Rank> {
  const ranked = [...values].filter((e): e is [TeamKey, number] => e[1] !== null);
  const out = new Map<TeamKey, Rank>();
  for (const [team, value] of ranked) {
    const better = ranked.filter(([, other]) => (other - value) * sort > 0).length;
    out.set(team, { rank: better + 1, of: ranked.length });
  }
  return out;
}
