/**
 * Matches scouted on this device and not yet stored on the server (OF-2, BL-93, #360), kept in
 * IndexedDB: it survives a reload and a browser restart, and holds a multi-day event's worth of
 * matches with no server, which `localStorage`'s few megabytes might not. Each record leaves only
 * when the server has acknowledged it.
 *
 * Beside the records, the scouting configuration each was scouted with, by version, so its QR
 * code can still be drawn after the configuration changes; a configuration goes when no record
 * needs it.
 */
import type { CachedConfig } from "./device";
import type { FinishedMatch } from "./match";

/** A match waiting to be sent, and why the server last refused it, if it did. */
export interface PendingRecord extends FinishedMatch {
  problem: string | null;
}

export interface RecordStore {
  /** Oldest first. */
  all(): Promise<PendingRecord[]>;
  /** Keep a finished match, with the configuration it was scouted with. Same nonce, same record. */
  put(match: FinishedMatch, config: CachedConfig): Promise<void>;
  remove(nonces: readonly string[]): Promise<void>;
  setProblem(nonce: string, problem: string | null): Promise<void>;
  config(version: string): Promise<CachedConfig | null>;
  clear(): Promise<void>;
  /** False when the records live in memory only, and a reload loses them. */
  readonly durable: boolean;
}

const oldestFirst = (a: PendingRecord, b: PendingRecord) =>
  a.submittedAt - b.submittedAt || a.nonce.localeCompare(b.nonce);

/** In memory: for tests, and for a browser that refuses IndexedDB. */
export function memoryRecords(): RecordStore {
  const records = new Map<string, PendingRecord>();
  const configs = new Map<string, CachedConfig>();
  const prune = () => {
    const used = new Set([...records.values()].map((r) => r.configVersion));
    for (const v of configs.keys()) if (!used.has(v)) configs.delete(v);
  };
  return {
    durable: false,
    all: async () => [...records.values()].map((r) => structuredClone(r)).sort(oldestFirst),
    put: async (match, config) => {
      records.set(match.nonce, { ...structuredClone(match), problem: null });
      configs.set(config.version, config);
    },
    remove: async (nonces) => {
      for (const n of nonces) records.delete(n);
      prune();
    },
    setProblem: async (nonce, problem) => {
      const r = records.get(nonce);
      if (r) r.problem = problem;
    },
    config: async (version) => configs.get(version) ?? null,
    clear: async () => {
      records.clear();
      configs.clear();
    },
  };
}

const DB_NAME = "spot";
const RECORDS = "records";
const CONFIGS = "configs";

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  const r = factory.open(DB_NAME, 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore(RECORDS, { keyPath: "nonce" });
    r.result.createObjectStore(CONFIGS, { keyPath: "version" });
  };
  return request(r);
}

/** IndexedDB, or memory where the browser refuses it (some private windows). */
export async function browserRecords(): Promise<RecordStore> {
  let db: IDBDatabase;
  try {
    db = await open(indexedDB);
  } catch {
    return memoryRecords();
  }
  const all = async () =>
    (
      (await request(db.transaction(RECORDS).objectStore(RECORDS).getAll())) as PendingRecord[]
    ).sort(oldestFirst);
  return {
    durable: true,
    all,
    put: async (match, config) => {
      const tx = db.transaction([RECORDS, CONFIGS], "readwrite");
      tx.objectStore(RECORDS).put({ ...match, problem: null });
      tx.objectStore(CONFIGS).put(config);
      await done(tx);
    },
    remove: async (nonces) => {
      const tx = db.transaction([RECORDS, CONFIGS], "readwrite");
      const records = tx.objectStore(RECORDS);
      for (const n of nonces) records.delete(n);
      const left = (await request(records.getAll())) as PendingRecord[];
      const used = new Set(left.map((r) => r.configVersion));
      const configs = tx.objectStore(CONFIGS);
      for (const v of (await request(configs.getAllKeys())) as string[])
        if (!used.has(v)) configs.delete(v);
      await done(tx);
    },
    setProblem: async (nonce, problem) => {
      const tx = db.transaction(RECORDS, "readwrite");
      const store = tx.objectStore(RECORDS);
      const r = (await request(store.get(nonce))) as PendingRecord | undefined;
      if (r) store.put({ ...r, problem });
      await done(tx);
    },
    config: async (version) =>
      ((await request(db.transaction(CONFIGS).objectStore(CONFIGS).get(version))) as
        CachedConfig | undefined) ?? null,
    clear: async () => {
      const tx = db.transaction([RECORDS, CONFIGS], "readwrite");
      tx.objectStore(RECORDS).clear();
      tx.objectStore(CONFIGS).clear();
      await done(tx);
    },
  };
}
