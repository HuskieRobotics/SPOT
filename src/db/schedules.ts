/**
 * Schedules (DV-14, D-4): an event's matches from TBA and by hand, and its current match,
 * stored so a restart keeps them. Reading TBA and the manual schedule page are #355; this is
 * where they are kept.
 */
import type { Db } from "mongodb";
import { assertValidDocument, COLLECTIONS } from "@/data/validate";
import {
  DEFAULT_TENANT,
  type MatchRef,
  type ObjectIdHex,
  type Schedule,
  type ScheduledMatch,
  type TenantId,
} from "@/data/types";

export function scheduleCollection(db: Db) {
  return db.collection<Schedule>(COLLECTIONS.schedule);
}

export function emptySchedule(eventId: ObjectIdHex, tenantId: TenantId = DEFAULT_TENANT): Schedule {
  return {
    _id: eventId,
    tenantId,
    eventId,
    tba: null,
    manual: [],
    currentMatch: null,
    updatedAt: 0,
  };
}

export async function getSchedule(
  db: Db,
  eventId: ObjectIdHex,
  tenantId: TenantId = DEFAULT_TENANT,
): Promise<Schedule> {
  return (
    (await scheduleCollection(db).findOne({ _id: eventId, tenantId })) ??
    emptySchedule(eventId, tenantId)
  );
}

/**
 * The matches assignment runs on (AD-8, per level since 2026-11-24): for each level, the typed
 * matches if any were typed, otherwise TBA's. Typing the playoffs at an event whose
 * qualifications TBA has keeps TBA's qualifications.
 */
export function effectiveMatches(schedule: Schedule): ScheduledMatch[] {
  const tba = schedule.tba?.matches ?? [];
  return (["qual", "playoff"] as const).flatMap((level) => {
    const typed = schedule.manual.filter((m) => m.level === level);
    return typed.length > 0 ? typed : tba.filter((m) => m.level === level);
  });
}

/** Whether a schedule's matches include this one. */
export function hasMatch(matches: ScheduledMatch[], ref: MatchRef | null): boolean {
  return ref !== null && matches.some((m) => m.level === ref.level && m.number === ref.number);
}

export type ScheduleChange = Partial<Pick<Schedule, "tba" | "manual" | "currentMatch">>;

export async function updateSchedule(
  db: Db,
  eventId: ObjectIdHex,
  change: ScheduleChange,
  { tenantId = DEFAULT_TENANT, now = Date.now() }: { tenantId?: TenantId; now?: number } = {},
): Promise<Schedule> {
  const next: Schedule = {
    ...(await getSchedule(db, eventId, tenantId)),
    ...change,
    updatedAt: now,
  };
  assertValidDocument("schedule", next);
  await scheduleCollection(db).replaceOne({ _id: eventId, tenantId }, next, { upsert: true });
  return next;
}
