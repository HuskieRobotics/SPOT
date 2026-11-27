/**
 * An admin's edits to stored records (#410; document 07 AD-13a to AD-15, SEC-5): flag, clear a
 * flag, delete, and make a superseded record the one that counts (RT-35's promotion).
 *
 * Each runs in the same queue as arriving records (`serial`), so an edit and an arrival never
 * settle one robot's records at once. The rules are in `rules.ts`.
 */
import type { Db } from "mongodb";
import {
  getPerformance,
  moveToDeleted,
  robotPerformances,
  updatePerformance,
} from "@/db/performances";
import {
  DEFAULT_TENANT,
  type Assignment,
  type Flag,
  type MatchLevel,
  type ObjectIdHex,
  type TeamMatchPerformance,
  type TenantId,
} from "@/data/types";
import type { TeamKey } from "@/data/team";
import { afterDelete, promote, type RobotRecord } from "./rules";
import { serial } from "./service";

export interface EditOptions {
  /** Who held the robot in that match (DV-16), for the rules that pick a record again. */
  assignmentOf(
    eventId: ObjectIdHex,
    level: MatchLevel,
    matchNumber: number,
    team: TeamKey,
  ): Promise<Assignment | null>;
  tenantId?: TenantId;
  now?: () => number;
}

/** The longest flag reason an admin may write. */
export const MAX_FLAG_REASON = 300;

/** Apply what the rules decided: supersede first, so one current record per nonce at a time. */
async function apply(
  db: Db,
  changes: Map<string, Partial<Pick<RobotRecord, "superseded">>>,
  tenantId: TenantId,
) {
  const ordered = [...changes].sort(
    ([, a], [, b]) => Number(!a.superseded) - Number(!b.superseded),
  );
  for (const [id, change] of ordered) await updatePerformance(db, id, change, tenantId);
}

const robotOf = (db: Db, r: TeamMatchPerformance) =>
  robotPerformances(db, r.eventId, r.level, r.matchNumber, r.team, r.tenantId);

/** Run `edit` on the record, or answer null when there is no such record. */
function onRecord<T>(
  db: Db,
  id: ObjectIdHex,
  options: EditOptions,
  edit: (record: TeamMatchPerformance, tenantId: TenantId, now: number) => Promise<T>,
): Promise<T | null> {
  const tenantId = options.tenantId ?? DEFAULT_TENANT;
  return serial(async () => {
    const record = await getPerformance(db, id, tenantId);
    return record ? edit(record, tenantId, (options.now ?? Date.now)()) : null;
  });
}

/**
 * AD-13a, AD-14: flag a record for review, or clear its flag. The reason is public, as every
 * flag is (SEC-8). A cleared flag keeps source "human", so no rule flags the record again.
 */
export function setFlag(
  db: Db,
  id: ObjectIdHex,
  flagged: boolean,
  reason: string | null,
  options: EditOptions,
): Promise<TeamMatchPerformance | null> {
  return onRecord(db, id, options, async (record, tenantId, now) => {
    const flag: Flag = flagged
      ? { flagged: true, reason, source: "human", at: now }
      : { flagged: false, reason: null, source: "human", at: now };
    await updatePerformance(db, id, { flag }, tenantId);
    return { ...record, flag };
  });
}

/**
 * AD-15: delete a record. It is kept in `deletedPerformances` (DV-20), so a copy sent again is a
 * duplicate. If it was the record that counted, the rules pick again from those left.
 */
export function deleteRecord(
  db: Db,
  id: ObjectIdHex,
  options: EditOptions,
): Promise<TeamMatchPerformance | null> {
  return onRecord(db, id, options, async (record, tenantId, now) => {
    await moveToDeleted(db, record, now);
    const left = await robotOf(db, record);
    const assignment = await options.assignmentOf(
      record.eventId,
      record.level,
      record.matchNumber,
      record.team,
    );
    await apply(db, afterDelete(left, assignment), tenantId);
    return record;
  });
}

/** RT-35: make a superseded record the one that counts; the robot's others are superseded. */
export function promoteRecord(
  db: Db,
  id: ObjectIdHex,
  options: EditOptions,
): Promise<TeamMatchPerformance | null> {
  return onRecord(db, id, options, async (record, tenantId) => {
    await apply(db, promote(await robotOf(db, record), id), tenantId);
    return { ...record, superseded: false };
  });
}
