/**
 * The scouter registry: who is signed in, who holds which robot, and when scouters enter a match
 * (docs/spec/06 RT-9 to RT-36, ADR 0006, #353).
 *
 * Pure TypeScript with no transport and no database. `apply(state, event)` returns the next state
 * and the effects the caller must carry out: messages to devices, and documents to save behind
 * the registry (DV-15, DV-16). The transport (#354) owns the one state per process and applies
 * the effects; tests drive `apply` directly, which is how the rules that go wrong at events are
 * checked without a network.
 *
 * The rules, and which scouters each one counts (RT-30):
 *  - One entry per person, keyed by student ID (RT-24), whatever happens to their connection.
 *  - A robot has at most one holder (RT-14a). A seventh waiting scouter waits.
 *  - A disconnected scouter keeps their robot, and it is offered to no one else (RT-25). Only
 *    an admin's release frees it (RT-31), never a timeout.
 *  - Only connected waiting scouters are given robots (RT-11), in sign-in order.
 *  - Start rules count connected scouters only (RT-12a, F-22).
 *  - A released scouter never gets that robot back for that match (RT-33).
 */
import {
  assignmentId,
  sessionId,
  type Assignment,
  type Holder,
  type ObjectIdHex,
  type ScheduledMatch,
  type ScouterSession,
  type SessionStatus,
  type StartRules,
  type TenantId,
} from "@/data/types";
import type { TeamKey } from "@/data/team";

/** The current match, as the schedule gives it (red 1 to 3, then blue 1 to 3; RT-9). */
export type CurrentMatch = Pick<ScheduledMatch, "number" | "red" | "blue">;

export interface Entry extends ScouterSession {
  /** Whether the device is connected now. Never saved (DV-15). */
  connected: boolean;
}

export interface RegistryState {
  tenantId: TenantId;
  eventId: ObjectIdHex;
  rules: StartRules;
  match: CurrentMatch | null;
  /** When scouters were first sent into the current match, or null. The quorum fires once. */
  startedAt: number | null;
  entries: Record<string, Entry>;
  /**
   * Who held each robot, for every match of the event, by `holdingKey`. Kept whole, a few hundred
   * small records per event, so going back to an earlier match continues its history (RT-33).
   */
  assignments: Record<string, Assignment>;
}

export type Alliance = "red" | "blue";

/** What a device needs to know about its scouter. */
export interface DeviceView {
  status: SessionStatus;
  matchNumber: number | null;
  team: TeamKey | null;
  alliance: Alliance | null;
  accepted: boolean;
  entered: boolean;
}

export type DeviceMessage =
  /** Everything, on (re)connect (docs/spec/15, condition 2). */
  | { kind: "state"; view: DeviceView }
  /** A new robot. The device shows the assignment unless `view.accepted` (RT-27). */
  | { kind: "assigned"; view: DeviceView }
  /** Open the match screen (RT-6). */
  | { kind: "enter-match"; view: DeviceView }
  /** The robot was taken away: released, or the match changed before they started (BL-54). */
  | { kind: "unassigned"; view: DeviceView; reason: "released" | "match-changed" }
  /** The session ended; the device must sign in again (doc 15, condition 3). */
  | { kind: "signed-out" };

export type Effect =
  | { type: "send"; to: string; message: DeviceMessage }
  | { type: "saveEntry"; entry: ScouterSession }
  | { type: "removeEntry"; id: string }
  | { type: "saveAssignment"; assignment: Assignment };

export type RegistryEvent =
  // From devices.
  | { type: "signIn"; scouterId: string; now: number }
  | { type: "connect"; scouterId: string; now: number }
  | { type: "disconnect"; scouterId: string; now: number }
  | { type: "accept"; scouterId: string; now: number }
  /** The scouter pressed Start Match. */
  | { type: "start"; scouterId: string; now: number }
  /** The scouter submitted the match. */
  | { type: "finish"; scouterId: string; now: number }
  /** Back on the waiting page after submitting. */
  | { type: "ready"; scouterId: string; now: number }
  | { type: "signOut"; scouterId: string; now: number }
  // From admins.
  | { type: "setMatch"; match: CurrentMatch | null; now: number }
  /** Start the current match for its connected, waiting scouters (RT-12a, admin start). */
  | { type: "adminStart"; now: number }
  /** Free a scouter's robot (RT-31), to the pool or to the scouter named in `to` (RT-32). */
  | { type: "release"; scouterId: string; to?: string; now: number }
  /** Remove an entry (RT-29); the device, if connected, is signed out. */
  | { type: "remove"; scouterId: string; now: number }
  | { type: "setRules"; rules: StartRules; now: number };

export interface Result {
  state: RegistryState;
  effects: Effect[];
  /** Why the event changed nothing, in words for whoever sent it. */
  error?: string;
}

// ------------------------------------------------------------------- reading the state

/** The key of a robot's history in `RegistryState.assignments`. */
export function holdingKey(matchNumber: number, team: TeamKey): string {
  return `${matchNumber}:${team}`;
}

/** The current match's history for a robot. */
export function currentAssignment(state: RegistryState, team: TeamKey): Assignment | undefined {
  return state.match ? state.assignments[holdingKey(state.match.number, team)] : undefined;
}

export function robotsOf(match: CurrentMatch): { team: TeamKey; alliance: Alliance }[] {
  return [
    ...match.red.map((team) => ({ team, alliance: "red" as const })),
    ...match.blue.map((team) => ({ team, alliance: "blue" as const })),
  ].filter((r): r is { team: TeamKey; alliance: Alliance } => r.team !== null);
}

function allianceOf(match: CurrentMatch | null, team: TeamKey | null): Alliance | null {
  if (!match || team === null) return null;
  return robotsOf(match).find((r) => r.team === team)?.alliance ?? null;
}

/** Whether the entry holds a robot of the current match. */
export function holdsCurrent(state: RegistryState, entry: Entry): boolean {
  return entry.team !== null && state.match !== null && entry.matchNumber === state.match.number;
}

export function deviceView(state: RegistryState, entry: Entry): DeviceView {
  return {
    status: entry.status,
    matchNumber: entry.matchNumber,
    team: entry.team,
    alliance:
      entry.matchNumber === state.match?.number ? allianceOf(state.match, entry.team) : null,
    accepted: entry.accepted,
    entered: entry.entered,
  };
}

/** Entries in the order waiting scouters are assigned: sign-in time, then student ID. */
export function inOrder(state: RegistryState): Entry[] {
  return Object.values(state.entries).sort(
    (a, b) => a.signedInAt - b.signedInAt || a.scouterId.localeCompare(b.scouterId),
  );
}

/** Someone has pressed Start Match on the current match, so it is under way (RT-34). */
export function underWay(state: RegistryState): boolean {
  return Object.values(state.entries).some(
    (e) => holdsCurrent(state, e) && (e.status === "scouting" || e.status === "complete"),
  );
}

// ------------------------------------------------------------------- building a result

class Changes {
  readonly effects: Effect[] = [];
  private readonly entries = new Set<string>();
  private readonly removed = new Set<string>();
  private readonly assignments = new Set<string>();

  constructor(private readonly state: RegistryState) {}

  entry(e: Entry, now: number) {
    e.updatedAt = now;
    this.entries.add(e.scouterId);
    this.removed.delete(e.scouterId);
  }

  remove(scouterId: string) {
    this.entries.delete(scouterId);
    this.removed.add(scouterId);
  }

  assignment(key: string) {
    this.assignments.add(key);
  }

  send(e: Entry, message: DeviceMessage) {
    if (e.connected) this.effects.push({ type: "send", to: e.scouterId, message });
  }

  finish(): Effect[] {
    for (const key of this.assignments) {
      const a = this.state.assignments[key];
      if (a) this.effects.push({ type: "saveAssignment", assignment: structuredClone(a) });
    }
    for (const id of this.removed)
      this.effects.push({ type: "removeEntry", id: sessionId(this.state.eventId, id) });
    for (const id of this.entries) {
      const e = this.state.entries[id];
      if (!e) continue;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { connected, ...saved } = e;
      this.effects.push({ type: "saveEntry", entry: structuredClone(saved) });
    }
    return this.effects;
  }
}

// ------------------------------------------------------------------- the rules

function assignmentFor(state: RegistryState, team: TeamKey): Assignment {
  const match = state.match!;
  return (state.assignments[holdingKey(match.number, team)] ??= {
    _id: assignmentId(state.eventId, match.number, team),
    tenantId: state.tenantId,
    eventId: state.eventId,
    matchNumber: match.number,
    team,
    holders: [],
  });
}

function currentHolder(a: Assignment | undefined): Holder | undefined {
  const last = a?.holders.at(-1);
  return last && last.until === null ? last : undefined;
}

/** Give a robot of the current match to an entry. */
function give(state: RegistryState, ch: Changes, e: Entry, team: TeamKey, now: number) {
  const a = assignmentFor(state, team);
  const afterStart = underWay(state);
  a.holders.push({ scouterId: e.scouterId, from: now, until: null, ended: null, afterStart });
  ch.assignment(holdingKey(state.match!.number, team));
  Object.assign(e, {
    status: "waiting",
    matchNumber: state.match!.number,
    team,
    accepted: false,
    entered: false,
  });
  ch.entry(e, now);
  ch.send(e, { kind: "assigned", view: deviceView(state, e) });
  // A replacement for a robot whose match is under way joins at once (RT-34): an admin chose it.
  const replaced = a.holders.slice(0, -1).some((h) => h.ended === "released");
  if (replaced && afterStart) enter(state, ch, e, now);
}

/** Take an entry's robot back: of the current match, or of an earlier one still being scouted. */
function take(
  state: RegistryState,
  ch: Changes,
  e: Entry,
  ended: "released" | "unassigned",
  now: number,
) {
  // Any match, not only the current one: someone still scouting an earlier match may sign out.
  endHolding(state, ch, e, ended, now);
  clear(e);
  ch.entry(e, now);
}

/**
 * Close the entry's open holding of its robot: `ended` says why, or null for a scouter who
 * finished the match (they stay its holder at the end, RT-35).
 */
function endHolding(
  state: RegistryState,
  ch: Changes,
  e: Entry,
  ended: Holder["ended"],
  now: number,
) {
  if (e.team === null || e.matchNumber === null) return;
  const key = holdingKey(e.matchNumber, e.team);
  const holder = currentHolder(state.assignments[key]);
  if (holder?.scouterId !== e.scouterId) return;
  holder.until = now;
  holder.ended = ended;
  ch.assignment(key);
}

/** Back to waiting, with no robot. */
function clear(e: Entry) {
  Object.assign(e, {
    status: "waiting",
    matchNumber: null,
    team: null,
    accepted: false,
    entered: false,
  });
}

function enter(state: RegistryState, ch: Changes, e: Entry, now: number) {
  e.entered = true;
  state.startedAt ??= now;
  ch.entry(e, now);
  ch.send(e, { kind: "enter-match", view: deviceView(state, e) });
}

/** Whether this scouter was released from this robot in this match (RT-33). */
function releasedFrom(state: RegistryState, scouterId: string, team: TeamKey): boolean {
  return (
    currentAssignment(state, team)?.holders.some(
      (h) => h.scouterId === scouterId && h.ended === "released",
    ) ?? false
  );
}

/** Hand free robots to connected waiting scouters, then apply the start rules. */
function settle(state: RegistryState, ch: Changes, now: number, adminStart = false) {
  const match = state.match;
  if (!match) return;

  // RT-9 to RT-11, RT-14a, RT-25: a robot is free if no entry, connected or not, holds it.
  const held = new Set(
    Object.values(state.entries)
      .filter((e) => holdsCurrent(state, e))
      .map((e) => e.team!),
  );
  const free = robotsOf(match)
    .map((r) => r.team)
    .filter((t) => !held.has(t));
  for (const e of inOrder(state)) {
    if (free.length === 0) break;
    if (!e.connected || e.status !== "waiting" || holdsCurrent(state, e)) continue;
    const i = free.findIndex((t) => !releasedFrom(state, e.scouterId, t));
    if (i < 0) continue;
    give(state, ch, e, free.splice(i, 1)[0], now);
  }

  // RT-12a: who is waiting to be sent in, and whether a rule sends them.
  const onMatch = Object.values(state.entries).filter((e) => e.connected && holdsCurrent(state, e));
  const waiting = onMatch.filter((e) => e.status === "waiting");
  const toEnter = waiting.filter((e) => !e.entered);
  if (toEnter.length === 0) return;
  const quorum = state.startedAt === null && waiting.length >= state.rules.quorum;
  const firstScouter =
    state.rules.startOnFirstScouter && onMatch.some((e) => e.status === "scouting");
  if (adminStart || quorum || firstScouter) for (const e of toEnter) enter(state, ch, e, now);
}

// ------------------------------------------------------------------- applying an event

export function emptyRegistry(
  eventId: ObjectIdHex,
  rules: StartRules,
  tenantId: TenantId,
): RegistryState {
  return {
    tenantId,
    eventId,
    rules,
    match: null,
    startedAt: null,
    entries: {},
    assignments: {},
  };
}

/**
 * Rebuild the registry from what was saved, after a restart. Every scouter is disconnected
 * (DV-15) and keeps their robot (RT-25); their devices bring them back.
 */
export function restore(args: {
  eventId: ObjectIdHex;
  tenantId: TenantId;
  rules: StartRules;
  match: CurrentMatch | null;
  entries: ScouterSession[];
  assignments: Assignment[];
  now: number;
}): RegistryState {
  const state = emptyRegistry(args.eventId, args.rules, args.tenantId);
  state.match = args.match;
  for (const s of args.entries)
    state.entries[s.scouterId] = { ...structuredClone(s), connected: false };
  for (const a of args.assignments)
    state.assignments[holdingKey(a.matchNumber, a.team)] = structuredClone(a);
  if (Object.values(state.entries).some((e) => holdsCurrent(state, e) && e.entered))
    state.startedAt = args.now;
  return state;
}

export function apply(previous: RegistryState, event: RegistryEvent): Result {
  const state = structuredClone(previous);
  const ch = new Changes(state);
  const refuse = (error: string): Result => ({ state: previous, effects: [], error });
  const { now } = event;

  if ("scouterId" in event && event.type !== "signIn" && !state.entries[event.scouterId])
    return event.type === "connect"
      ? {
          // A removed or disconnected session: the device must sign in again (doc 15, cond. 3).
          state: previous,
          effects: [{ type: "send", to: event.scouterId, message: { kind: "signed-out" } }],
          error: "Not signed in.",
        }
      : refuse("That scouter is not signed in.");

  switch (event.type) {
    case "signIn":
    case "connect": {
      let e = state.entries[event.scouterId];
      if (!e) {
        e = state.entries[event.scouterId] = {
          _id: sessionId(state.eventId, event.scouterId),
          tenantId: state.tenantId,
          eventId: state.eventId,
          scouterId: event.scouterId,
          status: "waiting",
          matchNumber: null,
          team: null,
          accepted: false,
          entered: false,
          signedInAt: now,
          updatedAt: now,
          connected: true,
        };
      }
      e.connected = true;
      ch.entry(e, now);
      // RT-27: the device learns where it was, without a new assignment prompt.
      ch.send(e, { kind: "state", view: deviceView(state, e) });
      break;
    }
    case "disconnect": {
      // RT-25, RT-29: the entry and its robot stay; only the connection is gone.
      state.entries[event.scouterId].connected = false;
      break;
    }
    case "accept": {
      const e = state.entries[event.scouterId];
      if (e.accepted) return { state: previous, effects: [] };
      e.accepted = true;
      ch.entry(e, now);
      break;
    }
    case "start": {
      const e = state.entries[event.scouterId];
      if (!holdsCurrent(state, e)) return refuse("You have no robot in the current match.");
      if (e.status === "scouting") return { state: previous, effects: [] };
      Object.assign(e, { status: "scouting", accepted: true, entered: true });
      state.startedAt ??= now;
      ch.entry(e, now);
      break;
    }
    case "finish": {
      const e = state.entries[event.scouterId];
      if (e.team === null) return refuse("You have no robot to finish.");
      e.status = "complete";
      ch.entry(e, now);
      break;
    }
    case "ready": {
      const e = state.entries[event.scouterId];
      // Finished the current match: they hold its robot until the match changes.
      if (e.status !== "complete" || holdsCurrent(state, e))
        return { state: previous, effects: [] };
      endHolding(state, ch, e, null, now);
      clear(e);
      ch.entry(e, now);
      break;
    }
    case "signOut":
    case "remove": {
      const e = state.entries[event.scouterId];
      take(state, ch, e, "unassigned", now);
      if (event.type === "remove") ch.send(e, { kind: "signed-out" });
      delete state.entries[event.scouterId];
      ch.remove(event.scouterId);
      break;
    }
    case "setMatch": {
      if (event.match?.number === state.match?.number && event.match !== null)
        return { state: previous, effects: [] };
      for (const e of Object.values(state.entries)) {
        // Someone still scouting the old match finishes it (and is free once `ready`).
        if (e.status === "scouting") continue;
        if (e.status === "waiting" && holdsCurrent(state, e)) {
          // Assigned but not started: the robot is taken back, and they are told (BL-54).
          take(state, ch, e, "unassigned", now);
          ch.send(e, { kind: "unassigned", view: deviceView(state, e), reason: "match-changed" });
        } else if (e.status === "complete") {
          // Finished the old match: free for the new one.
          endHolding(state, ch, e, null, now);
          clear(e);
          ch.entry(e, now);
        }
      }
      state.match = event.match;
      state.startedAt = null;
      break;
    }
    case "adminStart": {
      if (!state.match) return refuse("Choose a match first.");
      settle(state, ch, now, true);
      return { state, effects: ch.finish() };
    }
    case "release": {
      const e = state.entries[event.scouterId];
      if (!holdsCurrent(state, e))
        return refuse("That scouter holds no robot in the current match.");
      const team = e.team!;
      let to: Entry | undefined;
      if (event.to !== undefined) {
        to = state.entries[event.to];
        if (!to) return refuse("The replacement is not signed in.");
        if (!to.connected) return refuse("The replacement is not connected.");
        if (to === e) return refuse("Choose someone else as the replacement.");
        if (holdsCurrent(state, to) || to.status === "scouting")
          return refuse("The replacement already has a robot.");
      }
      take(state, ch, e, "released", now);
      ch.send(e, { kind: "unassigned", view: deviceView(state, e), reason: "released" });
      if (to) {
        // A replacement who finished an earlier match stays its holder at the end.
        endHolding(state, ch, to, null, now);
        clear(to);
        give(state, ch, to, team, now);
      }
      break;
    }
    case "setRules": {
      state.rules = { ...event.rules };
      break;
    }
  }
  settle(state, ch, now);
  return { state, effects: ch.finish() };
}

// ------------------------------------------------------------------- for #360

/**
 * Who held the robot when the match ended: the last holder whose holding was not ended by a
 * release or a withdrawal (RT-35). Null if nobody finished holding it.
 */
export function holderAtEnd(assignment: Assignment): Holder | null {
  const last = assignment.holders.at(-1);
  return last && last.ended === null ? last : null;
}

/** Whether a scouter's record for this robot comes from a replacement (RT-36). */
export function wasReplacement(assignment: Assignment, scouterId: string): boolean {
  const i = assignment.holders.findLastIndex((h) => h.scouterId === scouterId);
  return i > 0 && assignment.holders.slice(0, i).some((h) => h.ended === "released");
}
