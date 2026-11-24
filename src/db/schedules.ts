/**
 * Schedules (DV-14, D-4): an event's matches from TBA and by hand, and its current match,
 * stored so a restart keeps them. Reading TBA and the manual schedule page are #355; this is
 * where they are kept.
 */
import type { Db } from "mongodb";
import { assertValidDocument, COLLECTIONS } from "@/data/validate";
import {
  DEFAULT_TENANT,
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
    currentMatchNumber: null,
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

/** The matches assignment runs on: the manual schedule when it is not empty (AD-8). */
export function effectiveMatches(schedule: Schedule): ScheduledMatch[] {
  return schedule.manual.length > 0 ? schedule.manual : (schedule.tba?.matches ?? []);
}

export type ScheduleChange = Partial<Pick<Schedule, "tba" | "manual" | "currentMatchNumber">>;

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
