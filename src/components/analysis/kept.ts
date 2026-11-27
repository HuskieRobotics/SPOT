/**
 * What the analysis dashboard keeps on the device (#390; docs/spec/18 OF-3, OF-5): the list of
 * events, and each event viewed online, so the dashboard opens it with no connection.
 *
 * An event is kept as its inputs (its performances, TBA data, three configuration files and
 * schedule), not as the analysis: the page runs the pipeline on a kept copy as it does on a fresh
 * one. They are in IndexedDB, in a database of their own (`spot-analysis`), since several events
 * outgrow `localStorage`'s few megabytes; the scouting client's database is not touched. A browser
 * that refuses IndexedDB keeps them in memory, for the page's life. The service worker answers no
 * `/api/` request: the page reads the network first and knows when it shows a kept copy.
 */
import type { Finding } from "@/config/check/report";
import type {
  AnalysisModulesConfig,
  AnalysisPipelineConfig,
  MatchScoutingConfig,
} from "@/config/types";
import type { PublicPerformance, ScheduledMatch, TbaData } from "@/data/types";
import type { EventSummary } from "@/public-data";

/** A match as Simulate Match reads it (#389). */
export type ScheduleMatch = Pick<ScheduledMatch, "level" | "number" | "key" | "red" | "blue">;

export type TbaInput = Pick<TbaData, "matches" | "coprs" | "teams" | "fetchedAt">;

/** Everything the dashboard reads for one event. */
export interface EventInputs {
  performances: PublicPerformance[];
  /** TBA's data, or null when TBA was never read for the event. */
  tba: TbaInput | null;
  matchScouting: MatchScoutingConfig;
  pipeline: AnalysisPipelineConfig;
  modules: AnalysisModulesConfig;
  /** What config:check finds in the two analysis files. */
  findings: Finding[];
  /** The event's matches, or null when they could not be read. */
  schedule: ScheduleMatch[] | null;
}

export interface KeptEvent {
  code: string;
  /** When it was read from the server, epoch milliseconds. */
  savedAt: number;
  summary: EventSummary;
  inputs: EventInputs;
}

export interface KeptEvents {
  savedAt: number;
  events: EventSummary[];
}

export interface KeptStore {
  events(): Promise<KeptEvents | null>;
  putEvents(kept: KeptEvents): Promise<void>;
  event(code: string): Promise<KeptEvent | null>;
  putEvent(kept: KeptEvent): Promise<void>;
}

/** In memory: for tests, and for a browser that refuses IndexedDB. */
export function memoryKept(): KeptStore {
  let list: KeptEvents | null = null;
  const events = new Map<string, KeptEvent>();
  return {
    events: async () => (list ? structuredClone(list) : null),
    putEvents: async (kept) => {
      list = structuredClone(kept);
    },
    event: async (code) => structuredClone(events.get(code) ?? null),
    putEvent: async (kept) => {
      events.set(kept.code, structuredClone(kept));
    },
  };
}

export const KEPT_DB = "spot-analysis";
const EVENTS = "events";
const LISTS = "lists";
const LIST_KEY = "events";

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  const r = factory.open(KEPT_DB, 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore(EVENTS, { keyPath: "code" });
    r.result.createObjectStore(LISTS);
  };
  return request(r);
}

async function idbKept(db: IDBDatabase): Promise<KeptStore> {
  // Let Reset app data delete the database while this page is open.
  db.onversionchange = () => db.close();
  const read = <T>(store: string, key: string) =>
    request(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
  const write = (store: string, value: unknown, key?: string) =>
    request(db.transaction(store, "readwrite").objectStore(store).put(value, key)).then(
      () => undefined,
    );
  return {
    events: async () => (await read<KeptEvents>(LISTS, LIST_KEY)) ?? null,
    putEvents: (kept) => write(LISTS, kept, LIST_KEY),
    event: async (code) => (await read<KeptEvent>(EVENTS, code)) ?? null,
    putEvent: (kept) => write(EVENTS, kept),
  };
}

let opened: Promise<KeptStore> | null = null;

/** The device's kept events: IndexedDB, or memory where the browser refuses it. */
export function keptStore(): Promise<KeptStore> {
  opened ??= open(indexedDB)
    .then(idbKept)
    .catch(() => memoryKept());
  return opened;
}

/** Forget every kept event (the scouting menu's Reset app data). */
export async function forgetKept(): Promise<void> {
  opened = null;
  await new Promise<void>((resolve) => {
    try {
      const r = indexedDB.deleteDatabase(KEPT_DB);
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
