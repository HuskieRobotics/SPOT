/**
 * A throwaway MongoDB for tests (doc 17, Phase 0 item 6).
 *
 * mongodb-memory-server downloads a real `mongod` binary on first use and caches it, so tests
 * need neither Docker nor a running database: plain Node is enough (no-Docker rule, CLAUDE.md).
 */
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

export interface TestMongo {
  db: Db;
  client: MongoClient;
  /** A connection string naming `db`, for code that connects by itself (`MONGODB_URI`). */
  uri: string;
  stop: () => Promise<void>;
}

export async function startMongo(dbName = "spot-test"): Promise<TestMongo> {
  const server = await MongoMemoryServer.create();
  const client = await MongoClient.connect(server.getUri());
  return {
    db: client.db(dbName),
    client,
    uri: `${server.getUri().replace(/\/$/, "")}/${dbName}`,
    stop: async () => {
      await client.close();
      await server.stop();
    },
  };
}
