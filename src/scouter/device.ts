/**
 * What a device remembers across reloads and restarts (RT-26, SEC-2, SEC-7, #356): its device
 * id, the event's join code, the roster it last read, scouters added on it but not yet sent, and
 * who is signed in on it.
 *
 * Kept in `localStorage`, which survives a reload and a browser restart. Small and read at
 * startup; the scouted matches waiting to sync go in IndexedDB instead (#360). Where storage is
 * unavailable (a private window that refuses it), the device remembers in memory only.
 */
import { normalizeJoinCode } from "@/auth/join-code";

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
} as const;

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
  }
}

/** A join code from a link such as `/?join=K7QF2M`, as the admin page's QR code makes (SEC-3b). */
export function joinCodeFromUrl(search: string): string | null {
  const code = new URLSearchParams(search).get("join");
  return code && normalizeJoinCode(code) !== "" ? normalizeJoinCode(code) : null;
}
