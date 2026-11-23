import "server-only";
import { type Match, type ScouterState, ScouterStatus } from "../types";

/**
 * In-memory scouter registry (one Node process owns it; see docs/deploy). Scouters poll every
 * ~2 s; a scouter not heard from for CONNECTED_MS is shown as disconnected.
 *
 * Assignment rules:
 *  - a robot is never given to two scouters at once (re-scouting later is still possible);
 *  - a waiting scouter keeps their robot between polls while it is still free;
 *  - "auto" start: everyone waiting enters the match once every robot has a scouter, or as soon
 *    as someone is already scouting it; "admin": only when an admin presses Start.
 */
const CONNECTED_MS = 8000;
const PRUNE_MS = 60_000;
const SCOUTING_KEEP_MS = 10 * 60_000;

interface Registry {
  scouters: Map<string, ScouterState>;
  match: Match | null;
  kicked: Set<string>;
  /** "<match>-<robot>" pairs submitted since the match was selected. */
  completed: Set<string>;
  startRule: "auto" | "admin";
  demo: boolean;
}

const g = globalThis as unknown as { __spotRegistry?: Registry };
const reg: Registry = (g.__spotRegistry ??= { scouters: new Map(), match: null, kicked: new Set(), completed: new Set(), startRule: "auto", demo: false });

export function configureRegistry(opts: { startRule: "auto" | "admin"; demo: boolean }) {
  reg.startRule = opts.startRule;
  reg.demo = opts.demo;
}

const isConnected = (s: ScouterState, now = Date.now()) => now - s.lastSeen < CONNECTED_MS;

function prune(now = Date.now()) {
  for (const [id, s] of reg.scouters) {
    const idle = now - s.lastSeen;
    if (s.status === ScouterStatus.SCOUTING ? idle > SCOUTING_KEEP_MS : idle > PRUNE_MS) reg.scouters.delete(id);
  }
}

export function robotsOf(match: Match | null): string[] {
  return match ? [...match.robots.red, ...match.robots.blue].map(String) : [];
}

function assign() {
  const now = Date.now();
  const match = reg.match;
  const robots = robotsOf(match);
  for (const s of reg.scouters.values()) s.connected = isConnected(s, now);
  if (!match) return;

  const taken = new Set<string>();
  // Robots already being scouted in this match stay taken (even if that phone briefly dropped).
  for (const s of reg.scouters.values()) if (s.status === ScouterStatus.SCOUTING && s.matchNumber === match.number && s.robotNumber) taken.add(s.robotNumber);
  // Robots already submitted for this match are done.
  for (const r of robots) if (reg.completed.has(`${match.number}-${r}`)) taken.add(r);
  const waiting = [...reg.scouters.values()].filter((s) => s.status === ScouterStatus.WAITING && s.connected);
  // Keep existing assignments first so nobody's robot jumps around between polls.
  for (const s of waiting) {
    if (s.matchNumber === match.number && s.robotNumber && robots.includes(s.robotNumber) && !taken.has(s.robotNumber)) taken.add(s.robotNumber);
    else {
      s.matchNumber = null;
      s.robotNumber = null;
    }
  }
  for (const s of waiting) {
    if (s.robotNumber) continue;
    const free = robots.find((r) => !taken.has(r));
    if (!free) break;
    taken.add(free);
    s.matchNumber = match.number;
    s.robotNumber = free;
  }

  const assigned = waiting.filter((s) => s.matchNumber === match.number && s.robotNumber);
  if (reg.demo) return enter(assigned);
  if (reg.startRule === "admin") return;
  const someoneScouting = [...reg.scouters.values()].some((s) => s.status === ScouterStatus.SCOUTING && s.matchNumber === match.number);
  if (someoneScouting || (robots.length > 0 && assigned.length >= robots.length)) enter(assigned);
}

function enter(list: ScouterState[]) {
  for (const s of list) {
    // Only bump once per assignment so the client shows the modal once.
    const key = `${s.matchNumber}-${s.robotNumber}`;
    if ((s as any).__entered === key) continue;
    (s as any).__entered = key;
    s.enterSeq++;
  }
}

export interface HeartbeatInput {
  sessionId: string;
  scouterId?: string;
  status?: ScouterStatus;
  /** Offline / self-selected assignment sent by the client. */
  matchNumber?: number | null;
  robotNumber?: string | null;
}

export function heartbeat(input: HeartbeatInput) {
  prune();
  if (reg.kicked.has(input.sessionId)) {
    reg.kicked.delete(input.sessionId);
    reg.scouters.delete(input.sessionId);
    return { kicked: true as const };
  }
  let s = reg.scouters.get(input.sessionId);
  if (!s) {
    s = { sessionId: input.sessionId, scouterId: "", status: ScouterStatus.NEW, matchNumber: null, robotNumber: null, connected: true, lastSeen: Date.now(), enterSeq: 0 };
    reg.scouters.set(input.sessionId, s);
  }
  s.lastSeen = Date.now();
  if (input.scouterId !== undefined) s.scouterId = input.scouterId;
  if (input.status !== undefined) s.status = input.status;
  if (input.status === ScouterStatus.SCOUTING || input.status === ScouterStatus.COMPLETE) {
    if (input.matchNumber !== undefined) s.matchNumber = input.matchNumber;
    if (input.robotNumber !== undefined) s.robotNumber = input.robotNumber;
  }
  if (input.status === ScouterStatus.COMPLETE && s.matchNumber != null && s.robotNumber) reg.completed.add(`${s.matchNumber}-${s.robotNumber}`);
  assign();
  const { __entered, ...state } = s as any;
  return { kicked: false as const, scouter: state as ScouterState, match: reg.match };
}

export function setCurrentMatch(match: Match | null) {
  // Re-selecting a match (e.g. to re-scout it) starts fresh.
  reg.completed.clear();
  reg.match = match;
  assign();
}

export const getCurrentMatch = () => reg.match;

export function adminStart() {
  assign();
  const match = reg.match;
  if (!match) return 0;
  const list = [...reg.scouters.values()].filter((s) => s.status === ScouterStatus.WAITING && s.connected && s.matchNumber === match.number && s.robotNumber);
  enter(list);
  return list.length;
}

export function kick(sessionId: string) {
  const s = reg.scouters.get(sessionId);
  if (!s) return false;
  s.status = ScouterStatus.DISCONNECTED_BY_ADMIN;
  reg.kicked.add(sessionId);
  assign();
  return true;
}

export function listScouters(): ScouterState[] {
  prune();
  assign();
  return [...reg.scouters.values()].map(({ ...s }) => {
    delete (s as any).__entered;
    return s;
  });
}
