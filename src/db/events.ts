/**
 * Events (docs/spec/21, DM-6). The join code gates writes and never appears in a public read
 * (SEC-3). A new event gets a fresh code; an admin can rotate it.
 */
import { ObjectId, type Db } from "mongodb";
import { newJoinCode } from "@/auth/join-code";
import { assertValidDocument, COLLECTIONS } from "@/data/validate";
import {
  DEFAULT_TENANT,
  PRIVATE_EVENT_FIELDS,
  type ObjectIdHex,
  type PublicEvent,
  type SpotEvent,
  type TenantId,
} from "@/data/types";

const HIDE_PRIVATE = Object.fromEntries(PRIVATE_EVENT_FIELDS.map((f) => [f, 0]));

export function eventCollection(db: Db) {
  return db.collection<SpotEvent>(COLLECTIONS.event);
}

export interface NewEvent {
  tbaKey: string;
  label: string;
  /** Omitted: a fresh code (SEC-3). `null`: none, so writes are refused until one is made. */
  joinCode?: string | null;
  tenantId?: TenantId;
  now?: number;
}

/** Create an event; its code is `<TBA key>_<label>` (DM-6). Refuses a code already in use. */
export async function createEvent(db: Db, event: NewEvent): Promise<SpotEvent> {
  const code = event.joinCode === undefined ? newJoinCode() : event.joinCode;
  const doc: SpotEvent = {
    _id: new ObjectId().toHexString(),
    tenantId: event.tenantId ?? DEFAULT_TENANT,
    code: `${event.tbaKey}_${event.label}`,
    tbaKey: event.tbaKey,
    label: event.label,
    joinCode: code,
    joinCodeRotatedAt: code === null ? null : (event.now ?? Date.now()),
  };
  assertValidDocument("event", doc);
  await eventCollection(db).insertOne({ ...doc });
  return doc;
}

/**
 * Give the event a new code (SEC-3). Devices with the old code keep scouting, and their
 * submissions are refused until they enter the new one (SEC-9). Null if there is no such event.
 */
export async function rotateJoinCode(
  db: Db,
  id: ObjectIdHex,
  { tenantId = DEFAULT_TENANT, now = Date.now() }: { tenantId?: TenantId; now?: number } = {},
): Promise<SpotEvent | null> {
  return eventCollection(db).findOneAndUpdate(
    { _id: id, tenantId },
    { $set: { joinCode: newJoinCode(), joinCodeRotatedAt: now } },
    { returnDocument: "after" },
  );
}

/** The whole event, join code included. For checking a submission and for admin pages. */
export async function getEvent(db: Db, id: ObjectIdHex, tenantId: TenantId = DEFAULT_TENANT) {
  return eventCollection(db).findOne({ _id: id, tenantId });
}

export async function findEventByCode(
  db: Db,
  code: string,
  tenantId: TenantId = DEFAULT_TENANT,
): Promise<SpotEvent | null> {
  return eventCollection(db).findOne({ code, tenantId });
}

/** Every event, for anyone: no join codes (SEC-3). Newest code first, as v5 listed them. */
export async function publicEvents(
  db: Db,
  tenantId: TenantId = DEFAULT_TENANT,
): Promise<PublicEvent[]> {
  return eventCollection(db)
    .find({ tenantId }, { projection: HIDE_PRIVATE, sort: { code: -1 } })
    .toArray() as Promise<PublicEvent[]>;
}

/** Every event with its code, for admin pages only (SEC-3, SEC-5). */
export async function adminEvents(
  db: Db,
  tenantId: TenantId = DEFAULT_TENANT,
): Promise<SpotEvent[]> {
  return eventCollection(db)
    .find({ tenantId }, { sort: { code: -1 } })
    .toArray();
}
