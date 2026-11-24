/**
 * Settings (ADR 0003, DV-13): one document per tenant, read on every request through a short
 * cache, so a change takes effect without a restart. A tenant with no document yet gets the
 * defaults, which reproduce v5's behavior where v5 had one (RT-12a: quorum 6, no start on the
 * first scouter).
 */
import type { Db } from "mongodb";
import { assertValidDocument, COLLECTIONS } from "@/data/validate";
import { DEFAULT_TENANT, type Settings, type TenantId } from "@/data/types";

/** How long a read may be reused. A change made through `updateSettings` is seen at once. */
export const SETTINGS_CACHE_MS = 2000;

export function defaultSettings(tenantId: TenantId = DEFAULT_TENANT): Settings {
  return {
    _id: tenantId,
    tenantId,
    activeEventId: null,
    startRules: { quorum: 6, startOnFirstScouter: false },
    fieldFlipped: false,
    updatedAt: 0,
  };
}

export function settingsCollection(db: Db) {
  return db.collection<Settings>(COLLECTIONS.settings);
}

const cache = new WeakMap<Db, Map<TenantId, { at: number; value: Settings }>>();

function cacheOf(db: Db) {
  let map = cache.get(db);
  if (!map) cache.set(db, (map = new Map()));
  return map;
}

export async function getSettings(
  db: Db,
  { tenantId = DEFAULT_TENANT, now = Date.now() }: { tenantId?: TenantId; now?: number } = {},
): Promise<Settings> {
  const hit = cacheOf(db).get(tenantId);
  if (hit && now - hit.at < SETTINGS_CACHE_MS) return structuredClone(hit.value);
  const stored = await settingsCollection(db).findOne({ _id: tenantId });
  const value = stored ?? defaultSettings(tenantId);
  cacheOf(db).set(tenantId, { at: now, value });
  return structuredClone(value);
}

export type SettingsChange = Partial<Pick<Settings, "activeEventId" | "fieldFlipped">> & {
  startRules?: Partial<Settings["startRules"]>;
};

export async function updateSettings(
  db: Db,
  change: SettingsChange,
  { tenantId = DEFAULT_TENANT, now = Date.now() }: { tenantId?: TenantId; now?: number } = {},
): Promise<Settings> {
  const current =
    (await settingsCollection(db).findOne({ _id: tenantId })) ?? defaultSettings(tenantId);
  const next: Settings = {
    ...current,
    ...change,
    startRules: { ...current.startRules, ...change.startRules },
    updatedAt: now,
  };
  assertValidDocument("settings", next);
  await settingsCollection(db).replaceOne({ _id: tenantId }, next, { upsert: true });
  cacheOf(db).set(tenantId, { at: now, value: next });
  return structuredClone(next);
}
