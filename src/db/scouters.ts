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

/** A name as typed: no spaces at either end, single spaces between words. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export type AddScouterResult =
  | { status: "created"; scouter: Scouter }
  /** The student ID was already on the roster under this name (ignoring case). */
  | { status: "exists"; scouter: Scouter }
  /** The student ID was already on the roster under another name; the record is unchanged. */
  | { status: "conflict"; scouter: Scouter };

/**
 * Add a scouter who signed in with "I'm not on the list" (SEC-7), keyed by the student ID they
 * typed, so a device can do it offline and send it later. An ID already on the roster is never
 * renamed by a device: a typo would otherwise rename someone else. An admin corrects names.
 */
export async function addScouter(
  db: Db,
  input: { id: string; name: string; now?: number; tenantId?: TenantId },
): Promise<AddScouterResult> {
  const tenantId = input.tenantId ?? DEFAULT_TENANT;
  const scouter: Scouter = {
    _id: input.id,
    tenantId,
    displayName: normalizeName(input.name),
    aliases: [],
    legacy: false,
    createdAt: input.now ?? Date.now(),
  };
  assertValidDocument("scouter", scouter);
  try {
    await scouterCollection(db).insertOne({ ...scouter });
    return { status: "created", scouter };
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const existing = (await getScouter(db, input.id, tenantId))!;
    const same = existing.displayName.toLowerCase() === scouter.displayName.toLowerCase();
    return { status: same ? "exists" : "conflict", scouter: existing };
  }
}

/**
 * The roster a device picks from (SEC-7): student IDs and names, by name. Records rebuilt from
 * v5 data are left out; their IDs are old concatenated names, not student IDs.
 */
export async function rosterFor(db: Db, tenantId: TenantId = DEFAULT_TENANT) {
  const scouters = await scouterCollection(db)
    .find({ tenantId, legacy: false }, { sort: { displayName: 1 }, projection: { displayName: 1 } })
    .toArray();
  return scouters.map((s) => ({ id: s._id, name: s.displayName }));
}
