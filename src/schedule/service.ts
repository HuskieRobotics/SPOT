/**
 * The active event's schedule on the server (#355): TBA's, read and kept in the schedule
 * document (DV-14), and the manual one an admin types. The manual schedule wins when it is not
 * empty, one level at a time (AD-8).
 *
 * TBA's copy is re-read when an admin asks, or when the schedule is shown and the copy is older
 * than five minutes, so playoff matches appear as TBA adds them. If TBA cannot be read, the last
 * copy stays and the admin sees why.
 */
import type { Db } from "mongodb";
import { getEvent } from "@/db/events";
import { effectiveMatches, getSchedule, hasMatch, updateSchedule } from "@/db/schedules";
import type { MatchLevel, MatchRef, ObjectIdHex, ScheduledMatch } from "@/data/types";
import type { TeamKey } from "@/data/team";
import { parseManualSchedule, scheduleTeams } from "./manual";
import { fetchTbaMatches, scheduleFromTba, TbaError } from "./tba";

export const TBA_STALE_MS = 5 * 60_000;

export interface ScheduleView {
  eventId: ObjectIdHex;
  tbaKey: string;
  /** Where each level's matches come from (AD-8, per level). */
  source: Record<MatchLevel, "manual" | "tba" | "none">;
  matches: ScheduledMatch[];
  manual: ScheduledMatch[];
  tba: { fetchedAt: number; count: number } | null;
  /** Why TBA's schedule could not be read just now, for the admin to act on (RT-23). */
  tbaError: string | null;
  tbaKeyConfigured: boolean;
  currentMatch: MatchRef | null;
  /** Every team in the schedule in use; replaces v5's `tempTeams` (F-12). */
  teams: TeamKey[];
}

export interface ScheduleOptions {
  now?: number;
  fetchImpl?: typeof fetch;
  /** Read TBA now, whatever the age of the last copy. */
  refresh?: boolean;
}

let warnedNoKey = false;

function apiKey(): string | undefined {
  const key = process.env.TBA_API_KEY || undefined;
  if (!key && !warnedNoKey) {
    warnedNoKey = true;
    console.warn(
      "TBA_API_KEY is not set: SPOT cannot read schedules from The Blue Alliance (RT-23).",
    );
  }
  return key;
}

export async function scheduleView(
  db: Db,
  eventId: ObjectIdHex,
  { now = Date.now(), fetchImpl = fetch, refresh = false }: ScheduleOptions = {},
): Promise<ScheduleView> {
  const event = await getEvent(db, eventId);
  if (!event) throw new Error(`no event ${eventId}`);
  let schedule = await getSchedule(db, eventId);
  const key = apiKey();
  let tbaError: string | null = null;
  const stale = !schedule.tba || now - schedule.tba.fetchedAt >= TBA_STALE_MS;
  if (refresh || stale) {
    try {
      const matches = scheduleFromTba(await fetchTbaMatches(event.tbaKey, key, fetchImpl));
      schedule = await updateSchedule(db, eventId, { tba: { matches, fetchedAt: now } }, { now });
    } catch (error) {
      if (!(error instanceof TbaError)) throw error;
      tbaError = error.message;
    }
  }
  const matches = effectiveMatches(schedule);
  return {
    eventId,
    tbaKey: event.tbaKey,
    source: {
      qual: sourceOf(schedule, "qual"),
      playoff: sourceOf(schedule, "playoff"),
    },
    matches,
    manual: schedule.manual,
    tba: schedule.tba
      ? { fetchedAt: schedule.tba.fetchedAt, count: schedule.tba.matches.length }
      : null,
    tbaError,
    tbaKeyConfigured: key !== undefined,
    currentMatch: schedule.currentMatch,
    teams: scheduleTeams(matches),
  };
}

function sourceOf(
  schedule: { manual: ScheduledMatch[]; tba: { matches: ScheduledMatch[] } | null },
  level: MatchLevel,
): "manual" | "tba" | "none" {
  if (schedule.manual.some((m) => m.level === level)) return "manual";
  return schedule.tba?.matches.some((m) => m.level === level) ? "tba" : "none";
}

/**
 * Save the manual schedule an admin typed (a level with no typed matches uses TBA's). Throws
 * `ScheduleError` naming the first problem. If the current match is no longer in the schedule
 * in use, there is no current match.
 */
export async function saveManualSchedule(
  db: Db,
  eventId: ObjectIdHex,
  typed: unknown,
  now = Date.now(),
): Promise<void> {
  const manual = parseManualSchedule(typed);
  const schedule = await getSchedule(db, eventId);
  const inUse = effectiveMatches({ ...schedule, manual });
  const current = schedule.currentMatch;
  await updateSchedule(
    db,
    eventId,
    { manual, currentMatch: hasMatch(inUse, current) ? current : null },
    { now },
  );
}
