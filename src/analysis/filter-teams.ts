/**
 * Filter Teams (#387; docs/spec/08 AN-19 to AN-21a, A-14): which teams match the values and
 * bands a user picks. The bands are `filterTeams.ratingBands` in analysis-modules.json (CS-13).
 *
 * A value is a key of a team's `averageScores` or `opr`; a team's value for it is its
 * `averageScores` value, else its OPR. The rules are v5's (AN-21):
 *
 * - Nothing picked: every team.
 * - Values only: the team has a positive value for **every** value picked.
 * - Bands only, all of them rating bands (`"rating": true`): the team has a positive average,
 *   and **every** positive average is at least the highest band picked (its lowest value).
 * - Bands only, otherwise: **any** average or OPR of the team is in **any** band picked.
 * - Both: every value picked is positive and in at least one band picked.
 *
 * v5 knew its rating bands by their ids, Rating1 to Rating4; v6 marks them in the configuration
 * (decided 2026-11-27). A value that is missing or not a number counts as no value (F-27).
 */
import type { Dataset, TeamData } from "./engine";
import { valueLabel } from "./labels";
import type { RatingBand } from "@/config/types";
import type { TeamKey } from "@/data/team";

export interface FilterChoice {
  id: string;
  label: string;
}

function numbers(source: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (source && typeof source === "object")
    for (const [key, value] of Object.entries(source))
      if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  return out;
}

const averages = (team: TeamData | undefined) => numbers(team?.averageScores);
const oprs = (team: TeamData | undefined) => numbers(team?.opr);

/** Every key of any team's `averageScores` or `opr`, by name (AN-19). */
export function filterChoices(dataset: Dataset): FilterChoice[] {
  const choices = new Map<string, FilterChoice>();
  for (const team of Object.values(dataset.teams)) {
    for (const key of Object.keys(averages(team)))
      choices.set(key, { id: key, label: valueLabel("averageScores", key) });
    for (const key of Object.keys(oprs(team)))
      if (!choices.has(key)) choices.set(key, { id: key, label: valueLabel("opr", key) });
  }
  return [...choices.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Whether `value` is in the band. A band missing the number its kind needs holds nothing. */
export function inBand(value: number, band: RatingBand): boolean {
  switch (band.kind) {
    case "exact":
      return band.value !== undefined && value === band.value;
    case "min":
      return band.value !== undefined && value >= band.value;
    case "range":
      return (
        band.min !== undefined && band.max !== undefined && value >= band.min && value <= band.max
      );
    case "negative":
      return value < 0;
  }
}

/** The lowest value in a band: a rating band's threshold. */
function floor(band: RatingBand): number {
  if (band.kind === "range") return band.min ?? Infinity;
  if (band.kind === "negative") return -Infinity;
  return band.value ?? Infinity;
}

/** The team's value for a choice: its average, else its OPR, else null. */
function valueOf(team: TeamData | undefined, id: string): number | null {
  return averages(team)[id] ?? oprs(team)[id] ?? null;
}

/** AN-21: whether a team matches the values and bands picked. */
export function teamMatches(
  team: TeamData | undefined,
  values: readonly string[],
  bands: readonly RatingBand[],
): boolean {
  if (values.length === 0 && bands.length === 0) return true;
  if (bands.length === 0)
    return values.every((id) => {
      const v = valueOf(team, id);
      return v !== null && v > 0;
    });
  if (values.length === 0) {
    if (bands.every((b) => b.rating)) {
      const threshold = Math.max(...bands.map(floor));
      const positive = Object.values(averages(team)).filter((v) => v > 0);
      return positive.length > 0 && positive.every((v) => v >= threshold);
    }
    const all = [...Object.values(averages(team)), ...Object.values(oprs(team))];
    return all.some((v) => bands.some((b) => inBand(v, b)));
  }
  return values.every((id) => {
    const v = valueOf(team, id);
    return v !== null && v > 0 && bands.some((b) => inBand(v, b));
  });
}

/** The teams, in the order given, that match. */
export function filterTeams(
  dataset: Dataset,
  teams: readonly TeamKey[],
  values: readonly string[],
  bands: readonly RatingBand[],
): TeamKey[] {
  return teams.filter((t) => teamMatches(dataset.teams[t], values, bands));
}
