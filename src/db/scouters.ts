/**
 * Scouters, keyed by student ID (SEC-6). Every read here returns full names, so only admin
 * pages and the roster (#356) may call it; public views show no scouter information (SEC-8).
 */
import type { Db } from "mongodb";
import { assertValidDocument, COLLECTIONS } from "@/data/validate";
import { DEFAULT_TENANT, type Scouter, type TenantId } from "@/data/types";

export function scouterCollection(db: Db) {
  return db.collection<Scouter>(COLLECTIONS.scouter);
}

/** Create the scouter, or replace the record with that student ID. */
export async function saveScouter(db: Db, scouter: Scouter): Promise<void> {
  assertValidDocument("scouter", scouter);
  await scouterCollection(db).replaceOne(
    { _id: scouter._id, tenantId: scouter.tenantId },
    { ...scouter },
    { upsert: true },
  );
}

export async function getScouter(db: Db, id: string, tenantId: TenantId = DEFAULT_TENANT) {
  return scouterCollection(db).findOne({ _id: id, tenantId });
}

/** The roster, by name. */
export async function listScouters(db: Db, tenantId: TenantId = DEFAULT_TENANT) {
  return scouterCollection(db)
    .find({ tenantId }, { sort: { displayName: 1 } })
    .toArray();
}
