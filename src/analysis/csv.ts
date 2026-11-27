/**
 * The CSV export (#388; docs/spec/08 AN-26 to AN-26b, BL-232, ADR 0005): the teams' values as a
 * spreadsheet, built in the browser from the dataset the dashboard already has, so it works
 * offline and the pipeline runs once. v5's server route ran it a second time on every
 * performance twice (F-7).
 *
 * v5's columns (AN-26): `Team #`, then for every key any team has, in the order the teams have
 * them: `<key> Average` (`averages`), `<key> Score Average` (`averageScores`), and for each cycle
 * `<key> Cycle Average Time` and `<key> Cycle Average Time Complete` (`cycles`). v6 counts each
 * action per period, so a key can be a path: `auto.StartShooting Average` is
 * `averages.auto.StartShooting`.
 *
 * Changed from v5:
 * - A missing value, or one that is not a number, is an empty cell, as the page shows No Data
 *   (F-27; decided 2026-11-27). v5 wrote 0, which a spreadsheet cannot tell from a real 0, and
 *   which counted in a column's average.
 * - A field with a comma, a quote or a line break is quoted (RFC 4180); v5 quoted nothing.
 * - A team without one of the groups gets empty cells; v5's route failed.
 * - A nested group gives a column per value inside it, named by its path.
 *
 * Only team values are written, never a performance, so no scouter appears (SEC-8, AN-26b).
 */
import type { Dataset, TeamData } from "./engine";
import { compareTeamKeys, type TeamKey } from "@/data/team";

interface Column {
  header: string;
  value: (team: TeamData) => unknown;
}

const isGroup = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Every value's place under `group`, as key lists, in the order the teams have them. A group can
 * nest: v6 counts each action per period, so `averages.auto.StartShooting` is a value.
 */
function leaves(teams: TeamData[], group: string): string[][] {
  const seen = new Map<string, string[]>();
  const walk = (value: unknown, path: string[]) => {
    if (isGroup(value)) for (const [k, v] of Object.entries(value)) walk(v, [...path, k]);
    else if (path.length > 0) seen.set(JSON.stringify(path), path);
  };
  for (const team of teams) walk(team[group], []);
  return [...seen.values()];
}

/** The value at `path` under `group`, or undefined. */
function at(team: TeamData, group: string, path: readonly string[]): unknown {
  let value: unknown = team[group];
  for (const key of path) value = isGroup(value) ? value[key] : undefined;
  return value;
}

/** The cycles: each one's key, its times under it. */
function cycleKeys(teams: TeamData[]): string[] {
  const keys = new Set<string>();
  for (const team of teams)
    if (isGroup(team.cycles)) for (const k of Object.keys(team.cycles)) keys.add(k);
  return [...keys];
}

/** AN-26: the columns after `Team #`. */
function columns(teams: TeamData[]): Column[] {
  const cycles = cycleKeys(teams);
  return [
    ...leaves(teams, "averages").map((path) => ({
      header: `${path.join(".")} Average`,
      value: (t: TeamData) => at(t, "averages", path),
    })),
    ...leaves(teams, "averageScores").map((path) => ({
      header: `${path.join(".")} Score Average`,
      value: (t: TeamData) => at(t, "averageScores", path),
    })),
    ...cycles.map((key) => ({
      header: `${key} Cycle Average Time`,
      value: (t: TeamData) => at(t, "cycles", [key, "averageTime"]),
    })),
    ...cycles.map((key) => ({
      header: `${key} Cycle Average Time Complete`,
      value: (t: TeamData) => at(t, "cycles", [key, "averageTimeComplete"]),
    })),
  ];
}

/**
 * A text field as a spreadsheet should read it. Quoted when it holds a comma, a quote or a line
 * break, or starts or ends with a space. One starting with `=`, `+`, `-` or `@` gets a `'` first,
 * so a spreadsheet never takes a header for a formula (keys can come from TBA).
 */
export function textField(text: string): string {
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]|^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** A value's cell: the number, or empty when there is none. */
export function numberField(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

/** The CSV of every team in the dataset, a row each, in team order. */
export function teamsCsv(dataset: Dataset): string {
  const keys = (Object.keys(dataset.teams) as TeamKey[]).sort(compareTeamKeys);
  const teams = keys.map((k) => dataset.teams[k]);
  const cols = columns(teams);
  const rows = [
    ["Team #", ...cols.map((c) => c.header)].map(textField),
    ...keys.map((key, i) => [textField(key), ...cols.map((c) => numberField(c.value(teams[i])))]),
  ];
  return rows.map((r) => `${r.join(",")}\r\n`).join("");
}

/** The file's name: the event's code (`2026mnwi_official.csv`). */
export function csvFileName(eventCode: string): string {
  return `${eventCode.replace(/[^\w.-]+/g, "_")}.csv`;
}
