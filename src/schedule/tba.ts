/**
 * The match schedule from The Blue Alliance (RT-22, RT-23a, #355): `/event/{key}/matches`,
 * turned into SPOT's schedule.
 *
 * Numbering (RT-22a, revised 2026-11-24): each match has a level and a number within it, as the
 * field shows it (DV-17). A qualification match keeps TBA's number, which analysis joins TBA's
 * results on (DM-11). In FRC's double-elimination playoff (2023 onward) TBA keys the bracket's
 * matches `sf1m1` to `sf13m1` and the finals `f1m1` to `f1m3`; they are playoffs 1 to 13 and 14
 * to 16, the numbers the field shows ("Match 5", "Final 2" is playoff 15). Any other playoff
 * format (best-of-three rounds before 2023, or an off-season event's own bracket) is numbered
 * from 1 in TBA's order of level, set and match.
 *
 * v5 added TBA's `match_number` to an offset per level, so all 13 bracket matches, each number 1
 * of its own set, shared one number.
 */
import { toTeamKey } from "@/data/team";
import type { ScheduledMatch } from "@/data/types";

export interface TbaMatch {
  key: string;
  comp_level: string;
  set_number: number;
  match_number: number;
  alliances: { red: { team_keys: string[] }; blue: { team_keys: string[] } };
}

const PLAYOFF_LEVELS = ["ef", "qf", "sf", "f"];
/** Matches in FRC's double-elimination bracket before the finals. */
export const BRACKET_MATCHES = 13;

function alliance(keys: string[]): ScheduledMatch["red"] {
  const teams = keys.map((k) => toTeamKey(k));
  return [teams[0] ?? null, teams[1] ?? null, teams[2] ?? null];
}

/** Whether the playoffs are FRC's double-elimination bracket: sf1m1 to sf13m1, then f1m*. */
function isDoubleElimination(playoffs: TbaMatch[]): boolean {
  return (
    playoffs.length > 0 &&
    playoffs.every(
      (m) =>
        (m.comp_level === "sf" &&
          m.match_number === 1 &&
          m.set_number >= 1 &&
          m.set_number <= BRACKET_MATCHES) ||
        (m.comp_level === "f" && m.set_number === 1),
    )
  );
}

export function scheduleFromTba(matches: TbaMatch[]): ScheduledMatch[] {
  const quals = matches.filter((m) => m.comp_level === "qm");
  const playoffs = matches
    .filter((m) => PLAYOFF_LEVELS.includes(m.comp_level))
    .sort(
      (a, b) =>
        PLAYOFF_LEVELS.indexOf(a.comp_level) - PLAYOFF_LEVELS.indexOf(b.comp_level) ||
        a.set_number - b.set_number ||
        a.match_number - b.match_number,
    );
  const bracket = isDoubleElimination(playoffs);
  const playoffNumber = (m: TbaMatch, i: number) =>
    !bracket ? i + 1 : m.comp_level === "sf" ? m.set_number : BRACKET_MATCHES + m.match_number;
  const shape = (m: TbaMatch, level: ScheduledMatch["level"], number: number): ScheduledMatch => ({
    level,
    number,
    key: m.key,
    red: alliance(m.alliances.red.team_keys),
    blue: alliance(m.alliances.blue.team_keys),
  });
  return [
    ...quals.map((m) => shape(m, "qual", m.match_number)).sort((a, b) => a.number - b.number),
    ...playoffs.map((m, i) => shape(m, "playoff", playoffNumber(m, i))),
  ];
}

export class TbaError extends Error {}

/** TBA's read API (v3). */
export const TBA_API_URL = "https://www.thebluealliance.com/api/v3";

/**
 * Where to read TBA: `TBA_API_URL` when it is set, which only the browser tests do, to answer
 * from recorded responses (T-9). Leave it unset everywhere else.
 */
export function tbaApiUrl(): string {
  return (process.env.TBA_API_URL || TBA_API_URL).replace(/\/+$/, "");
}

/** How long to wait for TBA before giving up (OF-7: no request may hang). */
export const TBA_TIMEOUT_MS = 10_000;

/**
 * Read an event's matches from TBA. Throws `TbaError` with a message for an admin when the key
 * is missing or wrong, the event is unknown, or TBA cannot be reached.
 */
export async function fetchTbaMatches(
  eventKey: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<TbaMatch[]> {
  if (!apiKey)
    throw new TbaError(
      "This server has no TBA_API_KEY, so it cannot read TBA's schedule. Set it, or type the schedule by hand.",
    );
  let response: Response;
  try {
    response = await fetchImpl(`${tbaApiUrl()}/event/${encodeURIComponent(eventKey)}/matches`, {
      headers: { "X-TBA-Auth-Key": apiKey },
      signal: AbortSignal.timeout(TBA_TIMEOUT_MS),
    });
  } catch {
    throw new TbaError(
      "The Blue Alliance could not be reached. Try again, or type the schedule by hand.",
    );
  }
  if (response.status === 401)
    throw new TbaError(
      "TBA refused the TBA_API_KEY. Check the key on thebluealliance.com/account.",
    );
  if (response.status === 404)
    throw new TbaError(`TBA has no event ${eventKey}. Check the event's TBA key.`);
  if (!response.ok) throw new TbaError(`TBA answered ${response.status}. Try again later.`);
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) throw new TbaError("TBA's answer was not a list of matches.");
  return body as TbaMatch[];
}
