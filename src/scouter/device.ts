/**
 * What a device remembers across reloads and restarts (RT-26, SEC-2, SEC-7, #356, #359): its
 * device id, the event's join code, the roster it last read, scouters added on it but not yet
 * sent, who is signed in on it, what the server last said about them, the scouting
 * configuration, the match being scouted, and which matches it has finished.
 *
 * Kept in `localStorage`, which survives a reload and a browser restart. Where storage is
 * unavailable (a private window that refuses it), the device remembers in memory only. The
 * finished records wait in IndexedDB until the server has them (`records.ts`, #360).
 */
import { normalizeJoinCode } from "@/auth/join-code";
import { THEME_KEY } from "@/lib/theme";
import type { MatchScoutingConfig } from "@/config/types";
import type { ObjectIdHex } from "@/data/types";
import type { DeviceView } from "@/sessions/registry";
import type { ActiveMatch, FinishedMatch } from "./match";

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RosterEntry {
  id: string;
  name: string;
}

export interface SignedIn {
  scouterId: string;
  name: string;
  at: number;
}

const KEYS = {
  device: "spot.deviceId",
  joinCode: "spot.joinCode",
  roster: "spot.roster",
  pending: "spot.pendingScouters",
  signedIn: "spot.signedIn",
  view: "spot.view",
  settings: "spot.settings",
  accepted: "spot.accepted",
  config: "spot.config",
  match: "spot.match",
  matchConfig: "spot.matchConfig",
  done: "spot.done",
  finishing: "spot.finishing",
} as const;

/** What an admin set for every device, as the stream last sent it (A-19, SC-28). */
export interface DeviceSettings {
  fieldFlipped: boolean;
  eventId: ObjectIdHex | null;
}

/** The scouting configuration and its version (CS-17). */
export interface CachedConfig {
  version: string;
  config: MatchScoutingConfig;
}

/** Enough finished matches to cover any the registry may still ask about. */
const DONE_KEPT = 50;

class MemoryStore implements KeyValue {
  private readonly map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

/** The browser's `localStorage`, or memory where it is refused. */
export function browserStore(): KeyValue {
  try {
    const s = window.localStorage;
    s.setItem("spot.probe", "1");
    s.removeItem("spot.probe");
    return s;
  } catch {
    return new MemoryStore();
  }
}

export function memoryStore(): KeyValue {
  return new MemoryStore();
}

function newDeviceId(): string {
  return `d-${crypto.randomUUID()}`;
}

const byName = (a: RosterEntry, b: RosterEntry) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);

export class DeviceStore {
  constructor(private readonly store: KeyValue) {}

  private read<T>(key: string): T | null {
    try {
      const raw = this.store.getItem(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown) {
    try {
      this.store.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or refused: the device works on, forgetting it at the next reload.
    }
  }

  /** This device's id, made once and kept (docs/spec/15 Part 1). */
  deviceId(): string {
    let id = this.read<string>(KEYS.device);
    if (!id) this.write(KEYS.device, (id = newDeviceId()));
    return id;
  }

  /** The join code, entered once per device (SEC-2). */
  joinCode(): string | null {
    return this.read<string>(KEYS.joinCode);
  }

  setJoinCode(typed: string) {
    this.write(KEYS.joinCode, normalizeJoinCode(typed));
  }

  clearJoinCode() {
    this.store.removeItem(KEYS.joinCode);
  }

  /** The roster as last read, for signing in offline (SEC-7, OF-1). */
  roster(): { scouters: RosterEntry[]; readAt: number } | null {
    return this.read(KEYS.roster);
  }

  setRoster(scouters: RosterEntry[], readAt: number) {
    this.write(KEYS.roster, { scouters, readAt });
  }

  /** Scouters added on this device that the server has not confirmed yet (SEC-7). */
  pending(): RosterEntry[] {
    return this.read<RosterEntry[]>(KEYS.pending) ?? [];
  }

  addPending(entry: RosterEntry) {
    this.write(KEYS.pending, [...this.pending().filter((p) => p.id !== entry.id), entry]);
  }

  removePending(ids: string[]) {
    this.write(
      KEYS.pending,
      this.pending().filter((p) => !ids.includes(p.id)),
    );
  }

  /** The roster to pick from: what the server sent, plus scouters added here, by name. */
  pickList(): (RosterEntry & { pending: boolean })[] {
    const pending = this.pending();
    const ids = new Set(pending.map((p) => p.id));
    return [
      ...(this.roster()?.scouters ?? [])
        .filter((s) => !ids.has(s.id))
        .map((s) => ({ ...s, pending: false })),
      ...pending.map((s) => ({ ...s, pending: true })),
    ].sort(byName);
  }

  /** Who is signed in on this device; a reload keeps them (RT-26). */
  signedIn(): SignedIn | null {
    return this.read<SignedIn>(KEYS.signedIn);
  }

  setSignedIn(signedIn: SignedIn) {
    this.write(KEYS.signedIn, signedIn);
  }

  /** Sign-out is how a device changes hands (ADR 0006). The join code and roster stay. */
  signOut() {
    this.store.removeItem(KEYS.signedIn);
    this.store.removeItem(KEYS.view);
    this.store.removeItem(KEYS.accepted);
  }

  /** What the server last said about the signed-in scouter (RT-26). */
  view(): DeviceView | null {
    return this.read<DeviceView>(KEYS.view);
  }

  setView(view: DeviceView) {
    this.write(KEYS.view, view);
  }

  settings(): DeviceSettings {
    return this.read<DeviceSettings>(KEYS.settings) ?? { fieldFlipped: false, eventId: null };
  }

  setSettings(settings: DeviceSettings) {
    this.write(KEYS.settings, settings);
  }

  /**
   * The assignment the scouter pressed OK on, as `holdingKey` text, so a reload or a missed
   * request never asks again (RT-27).
   */
  accepted(): string | null {
    return this.read<string>(KEYS.accepted);
  }

  setAccepted(key: string) {
    this.write(KEYS.accepted, key);
  }

  /** The scouting configuration as last loaded, for a reload without a connection (OF-1). */
  config(): CachedConfig | null {
    return this.read<CachedConfig>(KEYS.config);
  }

  setConfig(config: CachedConfig) {
    this.write(KEYS.config, config);
  }

  /**
   * The match being scouted, saved after every press so a reload resumes it (RT-26), with the
   * configuration it began with: a configuration that changes mid-match never reaches it.
   */
  match(): { match: ActiveMatch; config: CachedConfig } | null {
    const match = this.read<ActiveMatch>(KEYS.match);
    const config = this.read<CachedConfig>(KEYS.matchConfig);
    return match && config?.version === match.configVersion ? { match, config } : null;
  }

  setMatch(match: ActiveMatch, config?: CachedConfig) {
    if (config) this.write(KEYS.matchConfig, config);
    this.write(KEYS.match, match);
  }

  clearMatch() {
    this.store.removeItem(KEYS.match);
    this.store.removeItem(KEYS.matchConfig);
  }

  /**
   * The matches finished on this device, as `keyOf` text, latest last: the screen never opens
   * again for one, and the registry is told it was finished if it missed that (RT-27, RT-28).
   * The records themselves wait in `records.ts` until the server has them.
   */
  done(): string[] {
    return this.read<string[]>(KEYS.done) ?? [];
  }

  addDone(key: string) {
    this.write(KEYS.done, [...this.done().filter((k) => k !== key), key].slice(-DONE_KEPT));
  }

  /**
   * Matches just finished, on their way to the record store (`records.ts`). Writing here is
   * synchronous, so the match leaves the screen and its record is safe in the same moment; the
   * app moves each to IndexedDB, and moves any left by a reload when it starts.
   */
  finishing(): { record: FinishedMatch; config: CachedConfig }[] {
    return this.read(KEYS.finishing) ?? [];
  }

  addFinishing(record: FinishedMatch, config: CachedConfig) {
    this.write(KEYS.finishing, [
      ...this.finishing().filter((f) => f.record.nonce !== record.nonce),
      { record, config },
    ]);
  }

  removeFinishing(nonce: string) {
    this.write(
      KEYS.finishing,
      this.finishing().filter((f) => f.record.nonce !== nonce),
    );
  }

  /** Forget everything SPOT keeps on this device (OF-8). */
  reset() {
    for (const key of [...Object.values(KEYS), THEME_KEY]) this.store.removeItem(key);
  }
}

/** A join code from a link such as `/?join=K7QF2M`, as the admin page's QR code makes (SEC-3b). */
export function joinCodeFromUrl(search: string): string | null {
  const code = new URLSearchParams(search).get("join");
  return code && normalizeJoinCode(code) !== "" ? normalizeJoinCode(code) : null;
}
