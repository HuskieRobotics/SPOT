/**
 * The dashboard's team list (docs/spec/08 AN-12, A-37; #382): every team with data at the event,
 * in team order (254, 2338, 2338B, 3061), named as TBA names it.
 *
 * v5 listed only teams both in the data and in TBA's list (or the typed schedule's "temp team"
 * entries), so a team TBA didn't know, such as a B robot at an off-season event, disappeared.
 * v6 lists every team with data, and a team without a nickname is shown by its number.
 */
import { compareTeamKeys, type TeamKey } from "@/data/team";
import type { TbaTeam } from "@/data/types";

export interface ListedTeam {
  team: TeamKey;
  nickname: string | null;
}

export function teamList(
  performances: readonly { team: TeamKey }[],
  tbaTeams: readonly TbaTeam[] | null,
): ListedTeam[] {
  const names = new Map((tbaTeams ?? []).map((t) => [t.team, t.nickname]));
  return [...new Set(performances.map((p) => p.team))]
    .sort(compareTeamKeys)
    .map((team) => ({ team, nickname: names.get(team) ?? null }));
}
