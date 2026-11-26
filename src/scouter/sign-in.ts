/**
 * Signing in on a device (SEC-6, SEC-7, RT-26, #356), apart from the screen so it can be tested
 * without a browser.
 *
 * Online, sign-in reaches the registry and the scouter can be assigned. Offline, the device still
 * signs the scouter in from the cached roster, so they can scout without an assignment and record
 * by QR code (OF-1); the client signs in to the registry when the connection returns (#359).
 * A scouter added on the device ("I'm not on the list") is kept until the server confirms it.
 */
import type { DeviceView } from "@/sessions/registry";
import type { ScouterApi } from "./api";
import type { DeviceStore, RosterEntry } from "./device";

export type SignInOutcome =
  /** Signed in to the registry: the scouter can be assigned. */
  | { status: "online"; name: string; view: DeviceView }
  /** The server cannot be reached; signed in on this device only. */
  | { status: "offline"; name: string }
  /** The join code is missing or wrong (SEC-2): ask for it again. */
  | { status: "join-code"; message: string }
  /** Anything else the server refused, with its message. */
  | { status: "refused"; message: string };

export interface Notice {
  message: string;
}

/** Read the roster and keep it for offline use. False if the server cannot be reached. */
export async function refreshRoster(
  store: DeviceStore,
  api: ScouterApi,
  now = Date.now(),
): Promise<{ ok: true } | { ok: false; offline: boolean; error?: string; message?: string }> {
  const joinCode = store.joinCode();
  if (!joinCode) return { ok: false, offline: false, error: "join-code" };
  const reply = await api.roster(joinCode);
  if (reply.ok) {
    store.setRoster(reply.value.scouters, now);
    return { ok: true };
  }
  return reply.offline
    ? { ok: false, offline: true }
    : { ok: false, offline: false, error: reply.error, message: reply.message };
}

/**
 * Read the active event and its schedule and keep them (#361): the event a match typed offline is
 * filed under, and the alliance each team is on (OF-1, SC-28). Nothing changes when the server
 * cannot be reached or refuses.
 */
export async function refreshSchedule(
  store: DeviceStore,
  api: ScouterApi,
  now = Date.now(),
): Promise<boolean> {
  const joinCode = store.joinCode();
  if (!joinCode) return false;
  const reply = await api.schedule(joinCode);
  if (!reply.ok) return false;
  store.setSchedule(reply.value.eventId, reply.value.matches, now);
  store.setSettings({ ...store.settings(), eventId: reply.value.eventId });
  return true;
}

/**
 * Send the scouters added on this device (SEC-7). Each one the server created or already had
 * leaves the pending list; a student ID on the roster under another name is reported.
 */
export async function sendPendingScouters(store: DeviceStore, api: ScouterApi): Promise<Notice[]> {
  const joinCode = store.joinCode();
  const pending = store.pending();
  if (!joinCode || pending.length === 0) return [];
  const reply = await api.addScouters(joinCode, pending);
  if (!reply.ok) return [];
  store.removePending(reply.value.results.map((r) => r.id));
  return reply.value.results.filter((r) => r.message).map((r) => ({ message: r.message! }));
}

/**
 * Sign in as a scouter from the pick-list, or as a new one (`added`: "I'm not on the list").
 */
export async function signIn(
  store: DeviceStore,
  api: ScouterApi,
  who: RosterEntry & { added?: boolean },
  now = Date.now(),
): Promise<SignInOutcome> {
  const joinCode = store.joinCode();
  if (!joinCode)
    return {
      status: "join-code",
      message: "Enter the join code. An admin can tell you what it is.",
    };
  if (who.added) store.addPending({ id: who.id, name: who.name });
  const isPending = store.pending().some((p) => p.id === who.id);
  const reply = await api.signIn({
    scouterId: who.id,
    deviceId: store.deviceId(),
    joinCode,
    ...(isPending ? { name: who.name } : {}),
  });
  if (reply.ok) {
    store.removePending([who.id]);
    store.setSignedIn({ scouterId: who.id, name: reply.value.name, at: now });
    return { status: "online", name: reply.value.name, view: reply.value.view };
  }
  if (reply.offline) {
    store.setSignedIn({ scouterId: who.id, name: who.name, at: now, offline: true });
    return { status: "offline", name: who.name };
  }
  if (reply.error === "join-code") return { status: "join-code", message: reply.message };
  return { status: "refused", message: reply.message };
}

/** Sign out on this device, and in the registry if it can be reached (ADR 0006). */
export async function signOut(store: DeviceStore, api: ScouterApi): Promise<void> {
  const current = store.signedIn();
  store.signOut();
  if (current) await api.signOut(current.scouterId, store.deviceId());
}
