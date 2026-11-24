/**
 * The application's one MongoDB connection (docs/spec/21 §6).
 *
 * One client per process, kept on `globalThis` so `next dev`, which reloads modules on every
 * edit, reuses it instead of opening a new pool each time (docs/spec/15 Part 2). The URI comes
 * from the environment only (ADR 0003); it names the database (`.env.example`).
 *
 * Code that reads or writes takes a `Db` argument, so tests pass the in-memory database and
 * only route handlers call `getDb()`.
 */
import { MongoClient, type Db } from "mongodb";
import { ensureCollections } from "./collections";

interface Connection {
  client: MongoClient;
  db: Promise<Db>;
}

const store = globalThis as typeof globalThis & { __spotMongo?: Connection };

export function getDb(): Promise<Db> {
  if (!store.__spotMongo) {
    const uri = process.env.MONGODB_URI;
    if (!uri)
      throw new Error(
        "MONGODB_URI is not set. Copy .env.example to .env.local and fill in the database's address.",
      );
    const client = new MongoClient(uri);
    const db = client.connect().then(async (connected) => {
      const db = connected.db();
      await ensureCollections(db);
      return db;
    });
    // A failed first connection is not cached, so the next request tries again.
    db.catch(() => {
      if (store.__spotMongo?.client === client) delete store.__spotMongo;
    });
    store.__spotMongo = { client, db };
  }
  return store.__spotMongo.db;
}
