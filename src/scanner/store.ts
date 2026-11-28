/**
 * What the QR scanner keeps on its device (#411; OF-4, OF-5): the records it scanned and the
 * server has not acknowledged, and what it needs to read codes (every season's scouting
 * configuration and the events). Kept in IndexedDB, so a reload or a browser restart at an event
 * with no connection loses nothing. The analysis page reads the records too (AN-8).
 */
import type { ScannedRecord, ScannerInputs } from "./scan";

export interface ScannerStore {
  /** Oldest scan first. */
  pending(): Promise<ScannedRecord[]>;
  /** Keep a scanned record. The same nonce is the same record. */
  put(record: ScannedRecord): Promise<void>;
  remove(nonces: readonly string[]): Promise<void>;
  setProblem(nonce: string, problem: string | null): Promise<void>;
  inputs(): Promise<ScannerInputs | null>;
  putInputs(inputs: ScannerInputs): Promise<void>;
  /** False when it lives in memory only, and a reload loses it. */
  readonly durable: boolean;
}

const oldestFirst = (a: ScannedRecord, b: ScannedRecord) =>
  a.scannedAt - b.scannedAt || a.record.nonce.localeCompare(b.record.nonce);

/** In memory: for tests, and for a browser that refuses IndexedDB. */
export function memoryScannerStore(): ScannerStore {
  const records = new Map<string, ScannedRecord>();
  let kept: ScannerInputs | null = null;
  return {
    durable: false,
    pending: async () => [...records.values()].map((r) => structuredClone(r)).sort(oldestFirst),
    put: async (r) => void records.set(r.record.nonce, structuredClone(r)),
    remove: async (nonces) => nonces.forEach((n) => records.delete(n)),
    setProblem: async (nonce, problem) => {
      const r = records.get(nonce);
      if (r) r.problem = problem;
    },
    inputs: async () => (kept ? structuredClone(kept) : null),
    putInputs: async (inputs) => void (kept = structuredClone(inputs)),
  };
}

const DB_NAME = "spot-scanner";
const PENDING = "pending";
const INPUTS = "inputs";
const INPUTS_KEY = "inputs";

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
    r.result.createObjectStore(PENDING, { keyPath: "record.nonce" });
    r.result.createObjectStore(INPUTS);
  };
  return request(r);
}

/** IndexedDB, or memory where the browser refuses it (some private windows). */
export async function browserScannerStore(factory: IDBFactory = indexedDB): Promise<ScannerStore> {
  let db: IDBDatabase;
  try {
    db = await open(factory);
  } catch {
    return memoryScannerStore();
  }
  const write = async (stores: string[], body: (tx: IDBTransaction) => void) => {
    const tx = db.transaction(stores, "readwrite");
    body(tx);
    await done(tx);
  };
  return {
    durable: true,
    pending: async () =>
      (
        (await request(db.transaction(PENDING).objectStore(PENDING).getAll())) as ScannedRecord[]
      ).sort(oldestFirst),
    put: (r) => write([PENDING], (tx) => tx.objectStore(PENDING).put(r)),
    remove: (nonces) =>
      write([PENDING], (tx) => nonces.forEach((n) => tx.objectStore(PENDING).delete(n))),
    setProblem: async (nonce, problem) => {
      const tx = db.transaction(PENDING, "readwrite");
      const store = tx.objectStore(PENDING);
      const r = (await request(store.get(nonce))) as ScannedRecord | undefined;
      if (r) store.put({ ...r, problem });
      await done(tx);
    },
    inputs: async () =>
      ((await request(db.transaction(INPUTS).objectStore(INPUTS).get(INPUTS_KEY))) as
        ScannerInputs | undefined) ?? null,
    putInputs: (inputs) => write([INPUTS], (tx) => tx.objectStore(INPUTS).put(inputs, INPUTS_KEY)),
  };
}

/**
 * The records this device scanned and has not sent, for one event (AN-8), without opening a
 * database that does not exist yet: a device that never scanned has none.
 */
export async function unsentScans(eventCode: string): Promise<ScannedRecord[]> {
  try {
    if (typeof indexedDB === "undefined") return [];
    const known = await indexedDB.databases?.();
    if (known && !known.some((d) => d.name === DB_NAME)) return [];
    const store = await browserScannerStore();
    return (await store.pending()).filter((r) => r.eventCode === eventCode);
  } catch {
    return [];
  }
}
