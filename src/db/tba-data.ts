/**
 * What TBA last said about each event, for analysis (DV-19, #382). One document per event,
 * `_id` the event id, so two events never share a copy (F-6).
 */
import type { Db } from "mongodb";
import { assertValidDocument, COLLECTIONS } from "@/data/validate";
import { DEFAULT_TENANT, type ObjectIdHex, type TbaData, type TenantId } from "@/data/types";

export function tbaDataCollection(db: Db) {
  return db.collection<TbaData>(COLLECTIONS["tba-data"]);
}

/** The event's last copy, or null when TBA was never read for it. */
export async function getTbaData(
  db: Db,
  eventId: ObjectIdHex,
  tenantId: TenantId = DEFAULT_TENANT,
): Promise<TbaData | null> {
  return tbaDataCollection(db).findOne({ _id: eventId, tenantId });
}

/** Replace the event's copy with a fresh one. */
export async function saveTbaData(db: Db, data: TbaData): Promise<void> {
  assertValidDocument("tba-data", data);
  await tbaDataCollection(db).replaceOne({ _id: data._id, tenantId: data.tenantId }, data, {
    upsert: true,
  });
}
