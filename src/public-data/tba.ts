/**
 * An event's TBA data for the analysis dashboard (#382; AN-6, AN-9, DM-11a, DM-13a): its matches
 * with score breakdowns, component OPRs, and the event's teams with their nicknames (AN-12).
 *
 * Kept in MongoDB under the event (DV-19, F-6) and read from TBA again when the copy is more than
 * five minutes old (NF-6). If TBA can't be read, the last copy is used and the answer says why,
 * so the dashboard works the same with a stale copy as without TBA at all: scouting data, fewer
 * values. Two requests for the same event at once share one read of TBA.
 */
import type { Db } from "mongodb";
import type { TbaCoprs, TbaMatch } from "@/analysis/enrichment/tba";
import { toTeamKey } from "@/data/team";
import type { SpotEvent, TbaData, TbaTeam } from "@/data/types";
import { getTbaData, saveTbaData } from "@/db/tba-data";
import { TbaError, tbaGet, type TbaFailure } from "@/tba/api";

/** How old a copy may be before TBA is read again (NF-6). */
export const TBA_DATA_STALE_MS = 5 * 60_000;

/** What the dashboard is told when TBA can't be read; it keeps showing scouting data. */
const MESSAGES: Record<TbaFailure, (tbaKey: string) => string> = {
  "no-key": () =>
    "This server has no TBA_API_KEY, so the dashboard shows scouting data without TBA's results and OPRs.",
  unreachable: () => "The Blue Alliance could not be reached.",
  refused: () => "TBA refused the server's TBA_API_KEY.",
  "not-found": (tbaKey) => `TBA has no event ${tbaKey}.`,
  status: () => "TBA did not answer as expected. Try again later.",
  shape: () => "TBA's answer was not what SPOT expected.",
};

export interface TbaView {
  /** The last copy, fresh or not; null when TBA was never read for this event. */
  data: Pick<TbaData, "matches" | "coprs" | "teams" | "fetchedAt"> | null;
  /** Why TBA could not be read just now, or null. */
  error: string | null;
}

export interface TbaOptions {
  now?: number;
  fetchImpl?: typeof fetch;
  apiKey?: string;
}

/** The parts of a TBA match that enrichment reads; the rest is dropped before it is kept. */
function trimMatch(m: unknown): TbaMatch | null {
  if (!m || typeof m !== "object") return null;
  const match = m as Record<string, unknown>;
  if (typeof match.comp_level !== "string" || typeof match.match_number !== "number") return null;
  const alliances: TbaMatch["alliances"] = {};
  for (const [color, a] of Object.entries((match.alliances ?? {}) as Record<string, unknown>)) {
    const keys = (a as { team_keys?: unknown })?.team_keys;
    alliances[color] = {
      team_keys: Array.isArray(keys) ? keys.filter((k): k is string => typeof k === "string") : [],
    };
  }
  const breakdown = match.score_breakdown;
  return {
    comp_level: match.comp_level,
    match_number: match.match_number,
    alliances,
    score_breakdown:
      breakdown && typeof breakdown === "object"
        ? (breakdown as TbaMatch["score_breakdown"])
        : null,
  };
}

function trimCoprs(body: unknown): TbaCoprs {
  const coprs: TbaCoprs = {};
  if (!body || typeof body !== "object") return coprs;
  for (const [name, byTeam] of Object.entries(body as Record<string, unknown>)) {
    if (!byTeam || typeof byTeam !== "object") continue;
    coprs[name] = Object.fromEntries(
      Object.entries(byTeam as Record<string, unknown>).filter(
        (e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]),
      ),
    );
  }
  return coprs;
}

function trimTeams(body: unknown): TbaTeam[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((t) => {
    const team = toTeamKey((t as { key?: unknown })?.key);
    const nickname = (t as { nickname?: unknown })?.nickname;
    return team
      ? [{ team, nickname: typeof nickname === "string" && nickname ? nickname : null }]
      : [];
  });
}

async function readTba(event: SpotEvent, apiKey: string | undefined, fetchImpl: typeof fetch) {
  const key = encodeURIComponent(event.tbaKey);
  const [matches, coprs, teams] = await Promise.all([
    tbaGet(`/event/${key}/matches`, apiKey, fetchImpl),
    tbaGet(`/event/${key}/coprs`, apiKey, fetchImpl),
    tbaGet(`/event/${key}/teams/simple`, apiKey, fetchImpl),
  ]);
  if (!Array.isArray(matches)) throw new TbaError("not a list of matches", "shape");
  return {
    matches: matches.map(trimMatch).filter((m): m is TbaMatch => m !== null),
    coprs: trimCoprs(coprs),
    teams: trimTeams(teams),
  };
}

/**
 * The answer being worked out for each event. A request joins it before anything is awaited, so
 * requests that arrive together share one read of the kept copy and at most one read of TBA; were
 * the kept copy read first, a slow database could let a second request miss the first's read of
 * TBA and start its own.
 */
const reading = new Map<string, Promise<TbaView>>();

/** The event's TBA data: the kept copy when it is fresh, else read again (NF-6). */
export function tbaDataFor(db: Db, event: SpotEvent, options: TbaOptions = {}): Promise<TbaView> {
  const pending = reading.get(event._id);
  if (pending) return pending;
  const read = answer(db, event, options).finally(() => reading.delete(event._id));
  reading.set(event._id, read);
  return read;
}

async function answer(
  db: Db,
  event: SpotEvent,
  {
    now = Date.now(),
    fetchImpl = fetch,
    apiKey = process.env.TBA_API_KEY || undefined,
  }: TbaOptions,
): Promise<TbaView> {
  const kept = await getTbaData(db, event._id, event.tenantId);
  const view = (d: TbaData | null) =>
    d && { matches: d.matches, coprs: d.coprs, teams: d.teams, fetchedAt: d.fetchedAt };
  if (kept && now - kept.fetchedAt < TBA_DATA_STALE_MS) return { data: view(kept), error: null };
  try {
    const fresh: TbaData = {
      _id: event._id,
      tenantId: event.tenantId,
      eventId: event._id,
      tbaKey: event.tbaKey,
      ...(await readTba(event, apiKey, fetchImpl)),
      fetchedAt: now,
    };
    await saveTbaData(db, fresh);
    return { data: view(fresh), error: null };
  } catch (error) {
    if (!(error instanceof TbaError)) throw error;
    return { data: view(kept), error: MESSAGES[error.reason](event.tbaKey) };
  }
}
