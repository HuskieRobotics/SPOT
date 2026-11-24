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
  type ObjectIdHex,
  type PublicPerformance,
  type TeamMatchPerformance,
  type TenantId,
} from "@/data/types";

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
