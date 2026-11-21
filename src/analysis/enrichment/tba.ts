/**
 * TBA enrichment (docs/spec/03 DM-11, DM-13; docs/spec/08 AN-7, AN-9; CS-12; #315): what The Blue
 * Alliance knows about a match that a scouter does not record.
 *
 * - Score-breakdown actions: for each performance, the robot's slot (1-3) in its qualification
 *   match, and every breakdown key that starts with a configured prefix and ends with that slot,
 *   become an action `<key without the slot>_<value>` (`endGameTowerRobot_Level2`). The action
 *   is in the phase the configuration names for that prefix (decided 2026-11-20), and its `ts`
 *   is 0, because TBA gives no time.
 * - The configured `knownIds`, and every such id TBA reports anywhere at the event, are listed
 *   on the dataset, so `countActions(all)` starts them at 0 and a count means "how often" in
 *   every match (decided 2026-11-20; v5 listed the 2026 ids in a hidden layout layer, F-4).
 *   Without TBA data nothing is listed: an unknown result is No Data, not 0.
 * - Component OPRs: `teams[team].opr.<name>` for each configured name, null when TBA has none.
 *
 * Pure functions of the dataset, the configuration and TBA responses that the caller fetched:
 * nothing here fetches, reads a file, or depends on Node (ADR 0005, decided on #315). The page
 * passes live or cached responses; tests and the oracle pass recorded ones.
 */
import type { AnalysisPipelineConfig } from "@/config/types";
import type { Action, TeamMatchPerformance } from "@/data/types";
import { toTeamKey, type TeamKey } from "@/data/team";
import {
  buildDataset,
  type AnalysisPerformanceFields,
  type BuildDatasetOptions,
  type Dataset,
} from "../engine/dataset";
import { setPath } from "../engine/path";

/** The parts of a TBA API v3 match (`/event/{key}/matches`) that enrichment reads. */
export interface TbaMatch {
  comp_level: string;
  match_number: number;
  alliances: Record<string, { team_keys: string[] }>;
  score_breakdown?: Record<string, Record<string, unknown>> | null;
}

/** TBA API v3 `/event/{key}/coprs`: `{ "<component name>": { "frc3061": value } }`. */
export type TbaCoprs = Record<string, Record<string, number>>;

/** One event's TBA responses, as the caller fetched (or cached) them. */
export interface TbaEventData {
  matches: readonly TbaMatch[];
  coprs: TbaCoprs;
}

export type TbaEnrichment = AnalysisPipelineConfig["enrichment"]["tba"];

/** The alliance color and slot (1-3) of a team in a qualification match, or null. */
export function allianceSlot(
  matches: readonly TbaMatch[],
  matchNumber: number,
  team: TeamKey,
): { match: TbaMatch; alliance: string; slot: number } | null {
  const match = matches.find((m) => m.comp_level === "qm" && m.match_number === matchNumber);
  if (!match) return null;
  for (const [alliance, { team_keys }] of Object.entries(match.alliances)) {
    const i = team_keys.findIndex((key) => toTeamKey(key) === team);
    if (i >= 0) return { match, alliance, slot: i + 1 };
  }
  return null;
}

/**
 * The score-breakdown actions for one team in one qualification match, in the order of the
 * configured prefixes, then of the breakdown's keys. v5 took only the first key per prefix; the
 * 2025 and 2026 breakdowns have one per prefix and slot, so the results agree.
 */
export function scoreBreakdownActions(
  matches: readonly TbaMatch[],
  matchNumber: number,
  team: TeamKey,
  prefixes: TbaEnrichment["scoreBreakdown"]["prefixes"],
): Action[] {
  const found = allianceSlot(matches, matchNumber, team);
  const breakdown = found && found.match.score_breakdown?.[found.alliance];
  if (!found || !breakdown) return [];
  return slotActions(breakdown, found.slot, prefixes);
}

function slotActions(
  breakdown: Record<string, unknown>,
  robotSlot: number,
  prefixes: TbaEnrichment["scoreBreakdown"]["prefixes"],
): Action[] {
  const slot = String(robotSlot);
  const actions: Action[] = [];
  for (const { prefix, phase } of prefixes) {
    for (const [key, value] of Object.entries(breakdown)) {
      // The slot is the whole trailing number, so slot 1 never matches a key ending in 11.
      if (!key.startsWith(prefix) || key.match(/\d+$/)?.[0] !== slot) continue;
      actions.push({
        id: `${key.slice(0, -slot.length)}_${String(value)}`,
        ts: 0,
        phase,
        segment: null,
        segmentKind: null,
        segmentIndex: null,
      });
    }
  }
  return actions;
}

/**
 * Every score-breakdown action id TBA reports for any robot in any qualification match of the
 * event, in first-seen order. These are the ids `countActions(all)` starts at 0.
 */
export function eventScoreBreakdownIds(
  matches: readonly TbaMatch[],
  prefixes: TbaEnrichment["scoreBreakdown"]["prefixes"],
): string[] {
  const ids = new Set<string>();
  for (const match of matches) {
    if (match.comp_level !== "qm") continue;
    for (const [alliance, { team_keys }] of Object.entries(match.alliances)) {
      const breakdown = match.score_breakdown?.[alliance];
      if (!breakdown) continue;
      team_keys.forEach((_, i) => {
        for (const action of slotActions(breakdown, i + 1, prefixes)) ids.add(action.id);
      });
    }
  }
  return [...ids];
}

/** Set `opr.<name>` on every team for each configured component OPR; null when TBA has none. */
export function attachComponentOprs(
  teams: Dataset["teams"],
  names: readonly string[],
  coprs: TbaCoprs | null,
): void {
  for (const name of names) {
    const byTeam = new Map<string, number>();
    for (const [key, value] of Object.entries(coprs?.[name] ?? {})) {
      const team = toTeamKey(key);
      if (team) byTeam.set(team, value);
    }
    for (const [team, data] of Object.entries(teams)) {
      setPath(data, `opr.${name}`, byTeam.get(team) ?? null);
    }
  }
}

/**
 * Build the dataset with TBA enrichment applied: score-breakdown actions are added to each
 * performance before it is frozen, and component OPRs to each team. Without TBA data (offline
 * with nothing cached, or no API key) no actions are added and every configured OPR is null.
 */
export function buildEnrichedDataset(
  performances: readonly (TeamMatchPerformance | AnalysisPerformanceFields)[],
  enrichment: TbaEnrichment,
  tba: TbaEventData | null,
  options: Omit<BuildDatasetOptions, "prepare"> = {},
): Dataset {
  const { enabled, prefixes } = enrichment.scoreBreakdown;
  const dataset = buildDataset(performances, {
    ...options,
    prepare: (tmps) => {
      if (!tba || !enabled) return;
      for (const tmp of tmps) {
        const extra = scoreBreakdownActions(tba.matches, tmp.matchNumber, tmp.team, prefixes);
        if (extra.length > 0) tmp.actions = [...tmp.actions, ...extra];
      }
    },
  });
  if (tba && enabled) {
    const known = enrichment.scoreBreakdown.knownIds ?? [];
    dataset.scoreBreakdownIds = [
      ...new Set([...known, ...eventScoreBreakdownIds(tba.matches, prefixes)]),
    ];
  }
  attachComponentOprs(dataset.teams, enrichment.componentOprs, tba?.coprs ?? null);
  return dataset;
}
