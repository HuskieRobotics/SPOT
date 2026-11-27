/**
 * The chance of winning (#389; docs/spec/08 AN-23, AN-24): Simulate Match's
 * `percentChanceOfWinning` and the Auto Pick List. Plain functions of the dataset.
 *
 * An alliance's score is the sum of its teams' `averageScores.total`, with a standard deviation of
 * √(Σ sd²) from their `standardDeviation`. The difference of two alliances' scores is taken as
 * normal, with mean `a − b` and deviation √(sdₐ² + sd_b²), at least 0.01; the chance that the first
 * wins is the chance the difference is above 0: Φ((a − b) / sd). v5's formula, unchanged.
 *
 * Changed from v5:
 * - Φ is computed (an approximation good to 1.5 × 10⁻⁷); simple-statistics looked it up in a table
 *   of z rounded to 0.01, so a chance can differ from v5's in the third decimal place.
 * - A team without a total does not count, where v5 counted 0 (F-27): an alliance whose teams
 *   have none has no chance to show. A team without a standard deviation counts 0, as in v5.
 * - The Auto Pick List floors the deviation at 0.01 too; v5's divided by 0 for two teams with
 *   none, and ranked the result anywhere. Teams are sorted, not bubble-sorted.
 */
import type { Dataset } from "./engine";
import { getPath } from "./engine";
import type { TeamKey } from "@/data/team";

export const SCORE_PATH = "averageScores.total";
export const DEVIATION_PATH = "standardDeviation";
export const MIN_DEVIATION = 0.01;

/** Φ(z), the standard normal distribution: Abramowitz and Stegun 7.1.26. */
export function normalCdf(z: number): number {
  // Exactly even at 0, so two teams' chances against each other always add to 1.
  if (z === 0) return 0.5;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

function number(dataset: Dataset, team: TeamKey, path: string): number | null {
  const value = getPath(dataset.teams[team], path, null);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** An alliance's expected score and its deviation, over the teams with a total; null if none. */
export function allianceScore(
  dataset: Dataset,
  teams: readonly TeamKey[],
): { score: number; deviation: number } | null {
  let score = 0;
  let variance = 0;
  let counted = 0;
  for (const team of teams) {
    const total = number(dataset, team, SCORE_PATH);
    if (total === null) continue;
    counted++;
    score += total;
    variance += (number(dataset, team, DEVIATION_PATH) ?? 0) ** 2;
  }
  return counted === 0 ? null : { score, deviation: Math.sqrt(variance) };
}

/** The chance, 0 to 1, that `alliance` beats `opponents`; null when either has no total. */
export function chanceOfWinning(
  dataset: Dataset,
  alliance: readonly TeamKey[],
  opponents: readonly TeamKey[],
): number | null {
  const a = allianceScore(dataset, alliance);
  const b = allianceScore(dataset, opponents);
  if (!a || !b) return null;
  const deviation = Math.max(MIN_DEVIATION, Math.hypot(a.deviation, b.deviation));
  return normalCdf((a.score - b.score) / deviation);
}

export interface Pick {
  team: TeamKey;
  /** The average chance, 0 to 1, of beating each other ranked team one on one. */
  chance: number;
}

/**
 * AN-24: each team with a total, ranked by its average chance of beating each of the others, one
 * team against one, highest first; a tie keeps the teams' order. `unranked` are the teams without
 * a total. With fewer than two teams to compare, nobody is ranked.
 */
export function autoPickList(
  dataset: Dataset,
  teams: readonly TeamKey[],
): { ranked: Pick[]; unranked: TeamKey[] } {
  const scored = teams.filter((t) => number(dataset, t, SCORE_PATH) !== null);
  const unranked = teams.filter((t) => !scored.includes(t));
  if (scored.length < 2) return { ranked: [], unranked: teams.slice() };
  const ranked = scored.map((team) => {
    let sum = 0;
    for (const other of scored)
      if (other !== team) sum += chanceOfWinning(dataset, [team], [other]) ?? 0;
    return { team, chance: sum / (scored.length - 1) };
  });
  ranked.sort((a, b) => b.chance - a.chance);
  return { ranked, unranked };
}
