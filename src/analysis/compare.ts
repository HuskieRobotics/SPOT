/**
 * Compare Team Scores (#387; docs/spec/08 AN-16 to AN-18): every team as a bubble, placed by two
 * values and sized by a third.
 *
 * Changed from v5: the choices are every team's values, not only the first team's, and a team
 * missing a value chosen is left out and counted, where v5 drew it at 0 (F-27). So the values
 * first shown are the ones the most teams have.
 */
import type { Dataset } from "./engine";
import { getPath } from "./engine";
import { valueLabel } from "./labels";
import type { TeamKey } from "@/data/team";

/** The size choice that draws every bubble the same size. */
export const CONSTANT = "constant";

export interface AxisChoice {
  /** `averageScores.<key>`, `opr.<key>`, or `constant`. */
  path: string;
  label: string;
}

export interface Axes {
  x: string;
  y: string;
  size: string;
}

/**
 * AN-16: every `averageScores` value, then every OPR, each by name, then Constant; and the
 * values first shown, the three that the most teams have. v5 chose the first team's first
 * three, which was harmless while a missing value drew as 0; now that a team without a value is
 * left out, a value few teams have would leave most of the event off the chart.
 */
export function compareChoices(dataset: Dataset): { choices: AxisChoice[]; defaults: Axes } {
  // Each value, in the order the teams have them (the pipeline's), with how many teams have it.
  const held = new Map<string, { choice: AxisChoice; teams: number }>();
  for (const team of Object.values(dataset.teams))
    for (const source of ["averageScores", "opr"] as const) {
      const values = team[source];
      if (!values || typeof values !== "object") continue;
      for (const [key, value] of Object.entries(values)) {
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        const path = `${source}.${key}`;
        const entry = held.get(path) ?? {
          choice: { path, label: valueLabel(source, key) },
          teams: 0,
        };
        entry.teams++;
        held.set(path, entry);
      }
    }
  const byName = (source: string) =>
    [...held.values()]
      .map((e) => e.choice)
      .filter((c) => c.path.startsWith(`${source}.`))
      .sort((a, b) => a.label.localeCompare(b.label));
  const widest = [...held.values()]
    .map((e, i) => ({ ...e, i }))
    .sort((a, b) => b.teams - a.teams || a.i - b.i)
    .map((e) => e.choice.path);
  return {
    choices: [...byName("averageScores"), ...byName("opr"), { path: CONSTANT, label: "Constant" }],
    defaults: { x: widest[0] ?? CONSTANT, y: widest[1] ?? CONSTANT, size: widest[2] ?? CONSTANT },
  };
}

export interface Bubble {
  team: TeamKey;
  x: number;
  y: number;
  /** Null when the size is Constant. */
  size: number | null;
}

function valueAt(dataset: Dataset, team: TeamKey, path: string): number | null {
  if (path === CONSTANT) return 1;
  const value = getPath(dataset.teams[team], path, null);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** AN-17: a bubble per team with every value chosen; the others, left out. */
export function bubbles(
  dataset: Dataset,
  teams: readonly TeamKey[],
  axes: Axes,
): { shown: Bubble[]; missing: TeamKey[] } {
  const shown: Bubble[] = [];
  const missing: TeamKey[] = [];
  for (const team of teams) {
    const x = valueAt(dataset, team, axes.x);
    const y = valueAt(dataset, team, axes.y);
    const size = valueAt(dataset, team, axes.size);
    if (x === null || y === null || size === null) missing.push(team);
    else shown.push({ team, x, y, size: axes.size === CONSTANT ? null : size });
  }
  return { shown, missing };
}
