/**
 * Team match performances (docs/spec/21). Reads come in two kinds, so the caller states which
 * view it serves and the private fields are removed here, on the read path (SEC-8), never by
 * the caller.
 */
import type { Db } from "mongodb";
import { assertValidDocument, COLLECTIONS } from "@/data/validate";
import {
  DEFAULT_TENANT,
  PRIVATE_PERFORMANCE_FIELDS,
  type DeletedPerformance,
  type MatchLevel,
  type ObjectIdHex,
  type PublicPerformance,
  type TeamMatchPerformance,
  type TenantId,
} from "@/data/types";
import type { TeamKey } from "@/data/team";

const HIDE_PRIVATE = Object.fromEntries(PRIVATE_PERFORMANCE_FIELDS.map((f) => [f, 0]));

export function performanceCollection(db: Db) {
  return db.collection<TeamMatchPerformance>(COLLECTIONS["team-match-performance"]);
}

export async function insertPerformance(db: Db, performance: TeamMatchPerformance) {
  assertValidDocument("team-match-performance", performance);
  await performanceCollection(db).insertOne({ ...performance });
}

/** An event's performances for anyone: no scouter information (SEC-1, SEC-8). */
export async function publicPerformances(
  db: Db,
  eventId: ObjectIdHex,
  tenantId: TenantId = DEFAULT_TENANT,
): Promise<PublicPerformance[]> {
  return performanceCollection(db)
    .find({ tenantId, eventId }, { projection: HIDE_PRIVATE, sort: { matchNumber: 1, team: 1 } })
    .toArray() as Promise<PublicPerformance[]>;
}

/** An event's performances for an admin page, with the scouter (SEC-5). */
export async function adminPerformances(
  db: Db,
  eventId: ObjectIdHex,
  tenantId: TenantId = DEFAULT_TENANT,
): Promise<TeamMatchPerformance[]> {
  return performanceCollection(db)
    .find({ tenantId, eventId }, { sort: { matchNumber: 1, team: 1 } })
    .toArray();
}

/** An event's records for the edit page (#410, SEC-5): with the scouter, without the actions. */
export type PerformanceSummary = Omit<TeamMatchPerformance, "actions"> & { actionCount: number };

export async function adminPerformanceSummaries(
  db: Db,
  eventId: ObjectIdHex,
  tenantId: TenantId = DEFAULT_TENANT,
): Promise<PerformanceSummary[]> {
  return performanceCollection(db)
    .aggregate<PerformanceSummary>([
      { $match: { tenantId, eventId } },
      { $set: { actionCount: { $size: "$actions" } } },
      { $unset: "actions" },
      { $sort: { submittedAt: -1, _id: 1 } },
    ])
    .toArray();
}

/** One record, for an admin (SEC-5). */
export async function getPerformance(
  db: Db,
  id: ObjectIdHex,
  tenantId: TenantId = DEFAULT_TENANT,
): Promise<TeamMatchPerformance | null> {
  return performanceCollection(db).findOne({ _id: id, tenantId });
}

export function deletedCollection(db: Db) {
  return db.collection<DeletedPerformance>(COLLECTIONS["deleted-performance"]);
}

/**
 * Delete a record (AD-15, DV-20): it is kept, whole, in `deletedPerformances`, then removed. Run
 * again after a failure between the two, it finishes the job.
 */
export async function moveToDeleted(db: Db, record: TeamMatchPerformance, deletedAt: number) {
  const deleted: DeletedPerformance = { ...record, deletedAt };
  assertValidDocument("deleted-performance", deleted);
  await deletedCollection(db).replaceOne(
    { _id: record._id, tenantId: record.tenantId },
    { ...deleted },
    { upsert: true },
  );
  await performanceCollection(db).deleteOne({ _id: record._id, tenantId: record.tenantId });
}

/** Whether a record with this nonce was deleted at the event (DV-20). */
export async function wasDeleted(
  db: Db,
  eventId: ObjectIdHex,
  nonce: string,
  tenantId: TenantId = DEFAULT_TENANT,
): Promise<boolean> {
  return (
    (await deletedCollection(db).countDocuments({ tenantId, eventId, nonce }, { limit: 1 })) > 0
  );
}

/** The stored record with this nonce, superseded or not (DV-18: a record arrives once). */
export async function performanceByNonce(
  db: Db,
  eventId: ObjectIdHex,
  nonce: string,
  tenantId: TenantId = DEFAULT_TENANT,
) {
  return performanceCollection(db).findOne({ tenantId, eventId, nonce });
}

/** Every record for one robot in one match, superseded included (RT-14a, RT-35). */
export async function robotPerformances(
  db: Db,
  eventId: ObjectIdHex,
  level: MatchLevel,
  matchNumber: number,
  team: TeamKey,
  tenantId: TenantId = DEFAULT_TENANT,
): Promise<TeamMatchPerformance[]> {
  return performanceCollection(db).find({ tenantId, eventId, level, matchNumber, team }).toArray();
}

/** Mark a record superseded or current, or flag it (DV-7, BL-208). */
export async function updatePerformance(
  db: Db,
  id: ObjectIdHex,
  change: Partial<Pick<TeamMatchPerformance, "superseded" | "flag">>,
  tenantId: TenantId = DEFAULT_TENANT,
) {
  await performanceCollection(db).updateOne({ _id: id, tenantId }, { $set: change });
}
