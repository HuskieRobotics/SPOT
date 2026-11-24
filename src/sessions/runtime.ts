/**
 * The one registry per process (AR-21, docs/spec/15 condition 4), wired to devices and the
 * database. `src/sessions/registry.ts` decides; this carries out its effects: messages go to
 * the open streams (`hub.ts`), and entries and assignment histories are saved behind it
 * (DV-15, DV-16).
 *
 * Events are applied one at a time, in arrival order, so two requests never interleave.
 *
 * The registry belongs to the active event (DV-12a). When an admin changes it, the old event's
 * devices are signed out and its entries removed; its assignment histories stay, because a late
 * record for that event still needs them (RT-35).
 */
import type { Db } from "mongodb";
import { checkEventCode, type EventCodeCheck } from "@/auth/event-code";
import { getDb } from "@/db/client";
import { getEvent } from "@/db/events";
import { effectiveMatches, getSchedule, updateSchedule } from "@/db/schedules";
import {
  assignmentCollection,
  createAssignmentStore,
  createSessionStore,
  sessionCollection,
  type AssignmentStore,
  type SessionStore,
} from "@/db/sessions";
import { getSettings } from "@/db/settings";
import { DEFAULT_TENANT, type ObjectIdHex, type TenantId } from "@/data/types";
import { Hub, HEARTBEAT_MS, type Connection } from "./hub";
import {
  apply,
  deviceView,
  restore,
  type CurrentMatch,
  type DeviceView,
  type RegistryEvent,
  type RegistryState,
  type Result,
} from "./registry";

type Without<T> = T extends unknown ? Omit<T, "now"> : never;

/** A refusal with an HTTP status and a message a person can act on. */
export class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }

  response(): Response {
    return Response.json({ error: this.code, message: this.message }, { status: this.status });
  }
}

const NO_EVENT = new Refusal(
  409,
  "no-active-event",
  "No event is active. An admin must choose one.",
);
const NOT_SIGNED_IN = new Refusal(401, "not-signed-in", "Sign in again.");

export interface RuntimeOptions {
  db: Db;
  tenantId?: TenantId;
  now?: () => number;
  heartbeatMs?: number;
  sessions?: SessionStore;
  assignments?: AssignmentStore;
}

export interface AdminEntry {
  scouterId: string;
  status: DeviceView["status"];
  connected: boolean;
  matchNumber: number | null;
  team: string | null;
  alliance: DeviceView["alliance"];
  accepted: boolean;
  entered: boolean;
}

/** What admin views poll (NF-5, RT-14c). Names are joined in by the admin page (#357). */
export interface AdminSnapshot {
  eventId: ObjectIdHex;
  match: CurrentMatch | null;
  rules: RegistryState["rules"];
  entries: AdminEntry[];
}

export type DeviceAction = "accept" | "start" | "finish" | "ready" | "sign-out";

export class Runtime {
  readonly hub = new Hub();
  private state: RegistryState | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly db: Db;
  private readonly tenantId: TenantId;
  private readonly now: () => number;
  private readonly heartbeatMs: number;
  private readonly sessions: SessionStore;
  private readonly assignments: AssignmentStore;

  constructor(options: RuntimeOptions) {
    this.db = options.db;
    this.tenantId = options.tenantId ?? DEFAULT_TENANT;
    this.now = options.now ?? Date.now;
    this.heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
    this.sessions = options.sessions ?? createSessionStore(sessionCollection(options.db));
    this.assignments =
      options.assignments ?? createAssignmentStore(assignmentCollection(options.db));
  }

  /** Run `task` after every earlier one, so events never interleave. */
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** The registry for the active event, loaded or switched as needed; null if none is active. */
  private async current(): Promise<RegistryState | null> {
    const settings = await getSettings(this.db, { tenantId: this.tenantId, now: this.now() });
    const eventId = settings.activeEventId;
    if (this.state && this.state.eventId !== eventId) {
      // The active event changed: its devices sign in again, to the new event.
      this.hub.signOutAll();
      this.sessions.removeEvent(this.state.eventId, this.tenantId);
      this.state = null;
    }
    if (eventId === null) return null;
    if (!this.state) {
      const schedule = await getSchedule(this.db, eventId, this.tenantId);
      const [entries, assignments] = await Promise.all([
        this.sessions.load(eventId, this.tenantId),
        this.assignments.load(eventId, this.tenantId),
      ]);
      this.state = restore({
        eventId,
        tenantId: this.tenantId,
        rules: settings.startRules,
        match: currentMatchOf(effectiveMatches(schedule), schedule.currentMatchNumber),
        entries,
        assignments,
        now: this.now(),
      });
    }
    const { rules } = this.state;
    const wanted = settings.startRules;
    if (rules.quorum !== wanted.quorum || rules.startOnFirstScouter !== wanted.startOnFirstScouter)
      this.dispatch({ type: "setRules", rules: wanted });
    return this.state;
  }

  private async required(): Promise<RegistryState> {
    const state = await this.current();
    if (!state) throw NO_EVENT;
    return state;
  }

  /** Apply one event and carry out its effects. Call only inside `serial`. */
  private dispatch(event: Without<RegistryEvent>): Result {
    const result = apply(this.state!, { ...event, now: this.now() } as RegistryEvent);
    this.state = result.state;
    for (const effect of result.effects) {
      if (effect.type === "send") this.hub.send(effect.to, effect.message);
      else if (effect.type === "saveEntry") this.sessions.save(effect.entry);
      else if (effect.type === "removeEntry") this.sessions.remove(effect.id, this.tenantId);
      else this.assignments.save(effect.assignment);
    }
    return result;
  }

  private refuseIfError(result: Result) {
    if (result.error) throw new Refusal(409, "refused", result.error);
  }

  /** The scouter's session, if this device holds it. */
  private sessionOf(state: RegistryState, scouterId: string, deviceId: string) {
    const entry = state.entries[scouterId];
    if (!entry) throw NOT_SIGNED_IN;
    if (entry.deviceId !== null && entry.deviceId !== deviceId)
      throw new Refusal(
        401,
        "other-device",
        "You signed in on another device. Sign in here again.",
      );
    return entry;
  }

  // ----------------------------------------------------------------- devices

  /**
   * Sign in for assignment (RT-1). The event code is checked here, so a stranger cannot take
   * robots. Scouting without the server never needs this (SEC-9).
   */
  signIn(scouterId: string, deviceId: string, eventCode: string | null): Promise<DeviceView> {
    return this.serial(async () => {
      const state = await this.required();
      const event = await getEvent(this.db, state.eventId, this.tenantId);
      const check: EventCodeCheck = event
        ? checkEventCode(event, eventCode)
        : { ok: false, reason: "no-code", message: NO_EVENT.message };
      if (!check.ok) throw new Refusal(403, "event-code", check.message);
      // The old device first, so it never sees the new device's state.
      this.hub.signOutOtherDevices(scouterId, deviceId);
      this.dispatch({ type: "signIn", scouterId, deviceId });
      return deviceView(this.state!, this.state!.entries[scouterId]);
    });
  }

  /** What a device does on the waiting and match screens. */
  act(scouterId: string, deviceId: string, action: DeviceAction): Promise<DeviceView | null> {
    return this.serial(async () => {
      const state = await this.required();
      this.sessionOf(state, scouterId, deviceId);
      const type = action === "sign-out" ? "signOut" : action;
      const result = this.dispatch({ type, scouterId } as Without<RegistryEvent>);
      this.refuseIfError(result);
      if (action === "sign-out") {
        this.hub.signOutOtherDevices(scouterId, "");
        return null;
      }
      return deviceView(this.state!, this.state!.entries[scouterId]);
    });
  }

  /**
   * Open a device's stream (RT-5 to RT-8). The first message is the scouter's state, so every
   * reconnect resynchronizes (docs/spec/15, condition 2). Closing it marks the scouter
   * disconnected at once if it was their last stream (RT-29).
   */
  async openStream(scouterId: string, deviceId: string, signal: AbortSignal): Promise<Response> {
    let connection: Connection | undefined;
    const onClosed = (c: Connection) =>
      void this.serial(async () => {
        if (this.hub.forget(c) && this.state?.entries[c.scouterId])
          this.dispatch({ type: "disconnect", scouterId: c.scouterId });
      });
    const opened = await this.serial(async () => {
      const state = await this.required();
      this.sessionOf(state, scouterId, deviceId);
      let ready!: (c: ReadableStreamDefaultController<Uint8Array>) => void;
      const controller = new Promise<ReadableStreamDefaultController<Uint8Array>>(
        (r) => (ready = r),
      );
      const body = new ReadableStream<Uint8Array>({
        start: (c) => ready(c),
        cancel: () => connection?.close(),
      });
      connection = this.hub.connect(
        scouterId,
        deviceId,
        await controller,
        onClosed,
        this.heartbeatMs,
      );
      this.dispatch({ type: "connect", scouterId });
      return body;
    });
    if (signal.aborted) connection?.close();
    else signal.addEventListener("abort", () => connection?.close(), { once: true });
    return new Response(opened, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        // nginx: do not buffer the stream (docs/spec/15, condition 5).
        "x-accel-buffering": "no",
      },
    });
  }

  // ----------------------------------------------------------------- admins

  snapshot(): Promise<AdminSnapshot | null> {
    return this.serial(async () => {
      const state = await this.current();
      if (!state) return null;
      return {
        eventId: state.eventId,
        match: state.match,
        rules: state.rules,
        entries: Object.values(state.entries)
          .sort((a, b) => a.signedInAt - b.signedInAt || a.scouterId.localeCompare(b.scouterId))
          .map((e) => {
            const view = deviceView(state, e);
            return { scouterId: e.scouterId, connected: e.connected, ...view };
          }),
      };
    });
  }

  /** Choose the current match by its number in the schedule, or none (RT-16). */
  setMatch(matchNumber: number | null): Promise<void> {
    return this.serial(async () => {
      const state = await this.required();
      const schedule = await getSchedule(this.db, state.eventId, this.tenantId);
      const match = currentMatchOf(effectiveMatches(schedule), matchNumber);
      if (matchNumber !== null && !match)
        throw new Refusal(404, "no-such-match", `Match ${matchNumber} is not in the schedule.`);
      await updateSchedule(
        this.db,
        state.eventId,
        { currentMatchNumber: matchNumber },
        { tenantId: this.tenantId, now: this.now() },
      );
      this.dispatch({ type: "setMatch", match });
    });
  }

  adminStart(): Promise<void> {
    return this.serial(async () => {
      await this.required();
      this.refuseIfError(this.dispatch({ type: "adminStart" }));
    });
  }

  release(scouterId: string, to?: string): Promise<void> {
    return this.serial(async () => {
      await this.required();
      this.refuseIfError(this.dispatch({ type: "release", scouterId, to }));
    });
  }

  remove(scouterId: string): Promise<void> {
    return this.serial(async () => {
      await this.required();
      this.refuseIfError(this.dispatch({ type: "remove", scouterId }));
    });
  }

  /** Wait for every queued event and every write behind them. For tests and shutdown. */
  async flush(): Promise<void> {
    await this.serial(async () => undefined);
    await Promise.all([this.sessions.flush(), this.assignments.flush()]);
  }
}

function currentMatchOf(
  matches: ReturnType<typeof effectiveMatches>,
  number: number | null,
): CurrentMatch | null {
  const m = number === null ? undefined : matches.find((x) => x.number === number);
  return m ? { number: m.number, red: m.red, blue: m.blue } : null;
}

// ------------------------------------------------------------------- the process's runtime

const store = globalThis as typeof globalThis & { __spotRuntime?: Promise<Runtime> };

/**
 * The process's runtime, kept on `globalThis` so `next dev` reloads keep the registry and the
 * open streams (docs/spec/15 Part 2).
 */
export function getRuntime(): Promise<Runtime> {
  store.__spotRuntime ??= getDb().then((db) => new Runtime({ db }));
  store.__spotRuntime.catch(() => delete store.__spotRuntime);
  return store.__spotRuntime;
}

/** Forget the process's runtime. Tests only. */
export function resetRuntime() {
  delete store.__spotRuntime;
}

/** Turn a thrown refusal into its response; anything else is a server error. */
export function refusalResponse(error: unknown): Response {
  if (error instanceof Refusal) return error.response();
  console.error(error);
  return Response.json(
    { error: "server", message: "Something went wrong on the server. Try again." },
    { status: 500 },
  );
}
