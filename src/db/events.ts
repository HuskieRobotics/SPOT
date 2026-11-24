/**
 * Events (docs/spec/21, DM-6). The event code gates writes and never appears in a public read
 * (SEC-3). Generating and rotating it is the admin's job (#352); an event created here starts
 * without one unless the caller supplies it.
 */
import { ObjectId, type Db } from "mongodb";
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
  eventCode?: string | null;
  tenantId?: TenantId;
  now?: number;
}

/** Create an event; its code is `<TBA key>_<label>` (DM-6). Refuses a code already in use. */
export async function createEvent(db: Db, event: NewEvent): Promise<SpotEvent> {
  const code = event.eventCode ?? null;
  const doc: SpotEvent = {
    _id: new ObjectId().toHexString(),
    tenantId: event.tenantId ?? DEFAULT_TENANT,
    code: `${event.tbaKey}_${event.label}`,
    tbaKey: event.tbaKey,
    label: event.label,
    eventCode: code,
    eventCodeRotatedAt: code === null ? null : (event.now ?? Date.now()),
  };
  assertValidDocument("event", doc);
  await eventCollection(db).insertOne({ ...doc });
  return doc;
}

/** The whole event, event code included. For checking a submission and for admin pages. */
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

/** Every event, for anyone: no event codes (SEC-3). Newest code first, as v5 listed them. */
export async function publicEvents(
  db: Db,
  tenantId: TenantId = DEFAULT_TENANT,
): Promise<PublicEvent[]> {
  return eventCollection(db)
    .find({ tenantId }, { projection: HIDE_PRIVATE, sort: { code: -1 } })
    .toArray() as Promise<PublicEvent[]>;
}
