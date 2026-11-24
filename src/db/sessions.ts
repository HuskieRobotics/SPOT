/**
 * The saved copy of the scouter registry (DV-15, decided 2026-11-24 for #351).
 *
 * The registry (#353) lives in memory and is the only thing assignment reads. Each change is
 * handed to this store, which writes it to MongoDB in the background, so a slow or unreachable
 * database never delays a scouter. The database is read once, when the server starts, to
 * rebuild the registry; nothing stored says whether a scouter is connected, so after a restart
 * every scouter is disconnected, keeps their robot (RT-25), and comes back when their device
 * reconnects, exactly as after a dropped connection.
 *
 * Writes for one entry are applied in order and coalesced: if an entry changes three times
 * while a write is in flight, only the last state is written next. A failed write is retried
 * until it succeeds or a newer change replaces it.
 */
import type { Collection, Db } from "mongodb";
import { assertValidDocument, COLLECTIONS } from "@/data/validate";
import { DEFAULT_TENANT, type ObjectIdHex, type ScouterSession, type TenantId } from "@/data/types";

export function sessionCollection(db: Db) {
  return db.collection<ScouterSession>(COLLECTIONS["scouter-session"]);
}

/** The collection operations the store uses, so a test can make them fail. */
export type SessionCollection = Pick<
  Collection<ScouterSession>,
  "replaceOne" | "deleteOne" | "deleteMany" | "find"
>;

type Write =
  | { kind: "save"; doc: ScouterSession }
  | { kind: "remove"; tenantId: TenantId }
  | { kind: "removeEvent"; tenantId: TenantId; eventId: ObjectIdHex };

export interface SessionStore {
  /** Queue the entry's current state. Returns at once; the write happens in the background. */
  save(entry: ScouterSession): void;
  /** Queue the removal of one entry (an admin removed it, or the scouter was disconnected). */
  remove(id: string, tenantId?: TenantId): void;
  /** Queue the removal of every entry of an event, for when the active event changes. */
  removeEvent(eventId: ObjectIdHex, tenantId?: TenantId): void;
  /** The saved entries of an event, read when the server starts. */
  load(eventId: ObjectIdHex, tenantId?: TenantId): Promise<ScouterSession[]>;
  /** Resolve when every queued write has reached the database. For tests and shutdown. */
  flush(): Promise<void>;
}

export interface SessionStoreOptions {
  retryMs?: number;
  onError?: (error: unknown) => void;
}

export function createSessionStore(
  collection: SessionCollection,
  {
    retryMs = 1000,
    onError = (e) => console.error("Saving a scouter session failed:", e),
  }: SessionStoreOptions = {},
): SessionStore {
  // Writes not yet started, by key; a newer write for a key replaces the queued one.
  const queued = new Map<string, Write>();
  const running = new Map<string, Promise<void>>();
  const retrying = new Map<string, ReturnType<typeof setTimeout>>();

  const apply = async (key: string, write: Write) => {
    if (write.kind === "save")
      await collection.replaceOne({ _id: write.doc._id }, write.doc, { upsert: true });
    else if (write.kind === "remove")
      await collection.deleteOne({ _id: key, tenantId: write.tenantId });
    else await collection.deleteMany({ tenantId: write.tenantId, eventId: write.eventId });
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

  const enqueue = (key: string, write: Write) => {
    queued.set(key, write);
    pump(key);
  };

  return {
    save(entry) {
      assertValidDocument("scouter-session", entry);
      enqueue(entry._id, { kind: "save", doc: structuredClone(entry) });
    },
    remove(id, tenantId = DEFAULT_TENANT) {
      enqueue(id, { kind: "remove", tenantId });
    },
    removeEvent(eventId, tenantId = DEFAULT_TENANT) {
      // Its own key, so it does not wait behind (or replace) writes for single entries.
      enqueue(`event:${tenantId}:${eventId}`, { kind: "removeEvent", tenantId, eventId });
    },
    async load(eventId, tenantId = DEFAULT_TENANT) {
      return collection.find({ tenantId, eventId }, { sort: { _id: 1 } }).toArray();
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
