/**
 * Synthetic TBA responses for generated matches (T-4, #317), so the entries that read what TBA
 * enrichment adds have data before any real event exists: config:check runs the pipeline on
 * generated matches, and without this every count of a score-breakdown result would be 0 and
 * every component OPR null.
 *
 * - Score breakdowns: each configured `knownIds` entry `<key>_<value>` is a result TBA can report
 *   for `<key>` (`endGameTowerRobot_Level3`); each robot gets one of its key's values, or "None"
 *   as TBA reports for a robot that did not do it. An idle robot always gets "None".
 * - Component OPRs: a value for each configured name and team; 0 for an idle robot.
 *
 * The alliances are the generator's lineups: the first half of a match's performances are red,
 * the rest blue, each in slot order.
 */
import type { TbaEnrichment, TbaEventData, TbaMatch } from "@/analysis/enrichment/tba";
import type { TeamKey } from "@/data/team";
import type { TeamMatchPerformance } from "@/data/types";
import { Random } from "./random";

export interface GenerateTbaOptions {
  enrichment: TbaEnrichment;
  /** Same seed, same responses. */
  seed: string | number;
  /** Robots that never did anything (`GenerateOptions.idleTeams`). */
  idleTeams?: readonly TeamKey[];
}

/** The values each score-breakdown key can take, from the configured known ids. */
function breakdownValues(enrichment: TbaEnrichment): Map<string, string[]> {
  const { prefixes, knownIds = [] } = enrichment.scoreBreakdown;
  const byKey = new Map<string, string[]>();
  for (const id of knownIds) {
    const cut = id.lastIndexOf("_");
    if (cut <= 0 || !prefixes.some((p) => id.startsWith(p.prefix))) continue;
    const key = id.slice(0, cut);
    byKey.set(key, [...(byKey.get(key) ?? []), id.slice(cut + 1)]);
  }
  return byKey;
}

export function generateTba(
  performances: readonly Pick<TeamMatchPerformance, "matchNumber" | "team">[],
  { enrichment, seed, idleTeams = [] }: GenerateTbaOptions,
): TbaEventData {
  const random = new Random(seed);
  const idle = new Set(idleTeams);
  const values = breakdownValues(enrichment);

  const lineups = new Map<number, TeamKey[]>();
  for (const p of performances) {
    const lineup = lineups.get(p.matchNumber) ?? [];
    if (!lineup.includes(p.team)) lineup.push(p.team);
    lineups.set(p.matchNumber, lineup);
  }

  const matches: TbaMatch[] = [];
  for (const [matchNumber, lineup] of [...lineups].sort((a, b) => a[0] - b[0])) {
    const half = Math.ceil(lineup.length / 2);
    const alliances = { red: lineup.slice(0, half), blue: lineup.slice(half) };
    const breakdown: Record<string, Record<string, unknown>> = {};
    for (const [color, teams] of Object.entries(alliances)) {
      const fields: Record<string, unknown> = {};
      teams.forEach((team, i) => {
        for (const [key, options] of values) {
          fields[`${key}${i + 1}`] = idle.has(team) ? "None" : random.pick([...options, "None"]);
        }
      });
      breakdown[color] = fields;
    }
    matches.push({
      comp_level: "qm",
      match_number: matchNumber,
      alliances: {
        red: { team_keys: alliances.red.map((t) => `frc${t}`) },
        blue: { team_keys: alliances.blue.map((t) => `frc${t}`) },
      },
      score_breakdown: breakdown,
    });
  }

  const teams = [...new Set(performances.map((p) => p.team))];
  const coprs: TbaEventData["coprs"] = {};
  for (const name of enrichment.componentOprs) {
    coprs[name] = Object.fromEntries(
      teams.map((t) => [`frc${t}`, idle.has(t) ? 0 : Math.round(random.next() * 400) / 10]),
    );
  }
  return { matches, coprs };
}
