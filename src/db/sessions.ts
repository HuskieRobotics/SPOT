/**
 * The saved copy of the scouter registry (DV-15, DV-16, decided 2026-11-24 for #351).
 *
 * The registry (`src/sessions/registry.ts`, #353) lives in memory and is the only thing
 * assignment reads. Each change is handed to a store here, which writes it to MongoDB in the
 * background, so a slow or unreachable database never delays a scouter. The database is read
 * once, when the server starts, to rebuild the registry; nothing stored says whether a scouter
 * is connected, so after a restart every scouter is disconnected, keeps their robot (RT-25),
 * and comes back when their device reconnects, exactly as after a dropped connection.
 *
 * Two stores share the mechanism: registry entries (`scouterSessions`) and who held each robot
 * in each match (`assignments`, for RT-34 to RT-36).
 *
 * Writes for one document are applied in order and coalesced: if it changes three times while
 * a write is in flight, only the last state is written next. A failed write is retried until it
 * succeeds or a newer change replaces it.
 */
import type { Collection, Db, Filter, OptionalUnlessRequiredId } from "mongodb";
import { assertValidDocument, COLLECTIONS, type DocumentKind } from "@/data/validate";
import {
  DEFAULT_TENANT,
  type Assignment,
  type ObjectIdHex,
  type ScouterSession,
  type TenantId,
} from "@/data/types";

interface EventDocument {
  _id: string;
  tenantId: TenantId;
  eventId: ObjectIdHex;
}

export function sessionCollection(db: Db) {
  return db.collection<ScouterSession>(COLLECTIONS["scouter-session"]);
}

export function assignmentCollection(db: Db) {
  return db.collection<Assignment>(COLLECTIONS.assignment);
}

/** The collection operations a store uses, so a test can make them fail. */
export type StoreCollection<T extends EventDocument> = Pick<
  Collection<T>,
  "replaceOne" | "deleteOne" | "deleteMany" | "find"
>;
export type SessionCollection = StoreCollection<ScouterSession>;

type Write<T> =
  | { kind: "save"; doc: T }
  | { kind: "remove"; tenantId: TenantId }
  | { kind: "removeEvent"; tenantId: TenantId; eventId: ObjectIdHex };

export interface WriteBehindStore<T extends EventDocument> {
  /** Queue the document's current state. Returns at once; the write happens in the background. */
  save(doc: T): void;
  /** Queue the removal of one document. */
  remove(id: string, tenantId?: TenantId): void;
  /** Queue the removal of every document of an event, for when the active event changes. */
  removeEvent(eventId: ObjectIdHex, tenantId?: TenantId): void;
  /** The saved documents of an event, read when the server starts. */
  load(eventId: ObjectIdHex, tenantId?: TenantId): Promise<T[]>;
  /** Resolve when every queued write has reached the database. For tests and shutdown. */
  flush(): Promise<void>;
}

export type SessionStore = WriteBehindStore<ScouterSession>;
export type AssignmentStore = WriteBehindStore<Assignment>;

export interface StoreOptions {
  retryMs?: number;
  onError?: (error: unknown) => void;
}

export function createWriteBehindStore<T extends EventDocument>(
  collection: StoreCollection<T>,
  kind: DocumentKind,
  {
    retryMs = 1000,
    onError = (e) => console.error(`Saving a ${kind} failed:`, e),
  }: StoreOptions = {},
): WriteBehindStore<T> {
  // Writes not yet started, by key; a newer write for a key replaces the queued one.
  const queued = new Map<string, Write<T>>();
  const running = new Map<string, Promise<void>>();
  const retrying = new Map<string, ReturnType<typeof setTimeout>>();

  const apply = async (key: string, write: Write<T>) => {
    if (write.kind === "save")
      await collection.replaceOne(
        { _id: write.doc._id } as Filter<T>,
        write.doc as unknown as OptionalUnlessRequiredId<T>,
        { upsert: true },
      );
    else if (write.kind === "remove")
      await collection.deleteOne({ _id: key, tenantId: write.tenantId } as Filter<T>);
    else
      await collection.deleteMany({
        tenantId: write.tenantId,
        eventId: write.eventId,
      } as Filter<T>);
  };

  const pump = (key: string) => {
    if (running.has(key) || retrying.has(key)) return;
    const write = queued.get(key);
    if (!write) return;
    queued.delete(key);
    const done = apply(key, write)
      .catch((error) => {
        onError(error);
        if (!queued.has(key)) queued.set(key, write);
        retrying.set(
          key,
          setTimeout(() => {
            retrying.delete(key);
            pump(key);
          }, retryMs),
        );
      })
      .finally(() => {
        running.delete(key);
        pump(key);
      });
    running.set(key, done);
  };

  const enqueue = (key: string, write: Write<T>) => {
    queued.set(key, write);
    pump(key);
  };

  return {
    save(doc) {
      assertValidDocument(kind, doc);
      enqueue(doc._id, { kind: "save", doc: structuredClone(doc) });
    },
    remove(id, tenantId = DEFAULT_TENANT) {
      enqueue(id, { kind: "remove", tenantId });
    },
    removeEvent(eventId, tenantId = DEFAULT_TENANT) {
      // Its own key, so it does not wait behind (or replace) writes for single documents. Stop
      // saving the event's documents first, or a write in flight can recreate one.
      enqueue(`event:${tenantId}:${eventId}`, { kind: "removeEvent", tenantId, eventId });
    },
    async load(eventId, tenantId = DEFAULT_TENANT) {
      return (await collection
        .find({ tenantId, eventId } as Filter<T>, { sort: { _id: 1 } })
        .toArray()) as T[];
    },
    async flush() {
      while (queued.size > 0 || running.size > 0 || retrying.size > 0) {
        // Waiting out a retry delay would only slow the flush down; try again now.
        for (const [key, timer] of retrying) {
          clearTimeout(timer);
          retrying.delete(key);
          pump(key);
        }
        await Promise.all(running.values());
      }
    },
  };
}

export function createSessionStore(
  collection: SessionCollection,
  options: StoreOptions = {},
): SessionStore {
  return createWriteBehindStore(collection, "scouter-session", options);
}

export function createAssignmentStore(
  collection: StoreCollection<Assignment>,
  options: StoreOptions = {},
): AssignmentStore {
  return createWriteBehindStore(collection, "assignment", options);
}
