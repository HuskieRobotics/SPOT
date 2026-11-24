/**
 * The match schedule from The Blue Alliance (RT-22, RT-23a, #355): `/event/{key}/matches`,
 * turned into SPOT's schedule.
 *
 * Numbering (RT-22a, decided 2026-11-24): a qualification match keeps TBA's number, which is
 * what analysis joins TBA's results on (DM-11). Playoff matches continue after the last
 * qualification, one number each, in TBA's order of level, set and match. v5 added TBA's
 * `match_number` to an offset per level, but in a double-elimination playoff every semifinal
 * match is number 1 of its own set, so v5 gave all 13 of them the same number.
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

const LEVELS = ["qm", "ef", "qf", "sf", "f"];

function alliance(keys: string[]): ScheduledMatch["red"] {
  const teams = keys.map((k) => toTeamKey(k));
  return [teams[0] ?? null, teams[1] ?? null, teams[2] ?? null];
}

export function scheduleFromTba(matches: TbaMatch[]): ScheduledMatch[] {
  const quals = matches.filter((m) => m.comp_level === "qm");
  const lastQual = Math.max(0, ...quals.map((m) => m.match_number));
  const playoffs = matches
    .filter((m) => m.comp_level !== "qm" && LEVELS.includes(m.comp_level))
    .sort(
      (a, b) =>
        LEVELS.indexOf(a.comp_level) - LEVELS.indexOf(b.comp_level) ||
        a.set_number - b.set_number ||
        a.match_number - b.match_number,
    );
  const out: ScheduledMatch[] = [
    ...quals.map((m) => ({ ...m, number: m.match_number })),
    ...playoffs.map((m, i) => ({ ...m, number: lastQual + i + 1 })),
  ].map((m) => ({
    number: m.number,
    key: m.key,
    red: alliance(m.alliances.red.team_keys),
    blue: alliance(m.alliances.blue.team_keys),
  }));
  return out.sort((a, b) => a.number - b.number);
}

export class TbaError extends Error {}

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
    response = await fetchImpl(
      `https://www.thebluealliance.com/api/v3/event/${encodeURIComponent(eventKey)}/matches`,
      { headers: { "X-TBA-Auth-Key": apiKey }, signal: AbortSignal.timeout(TBA_TIMEOUT_MS) },
    );
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
