/**
 * The match a device scouts, from the registry's word to a record kept on the device (#359).
 * Pure, so the rules below are tested without a browser:
 *
 * - The device opens the match screen when the registry has sent the scouter into a match
 *   (RT-6), and never again for a match it has already finished.
 * - Once Start Match is pressed, what the scouter recorded is never thrown away: a release, a
 *   sign-out or a match change keeps it as a finished record (RT-28). Before the start, the
 *   assignment can be withdrawn and the screen closes (BL-54).
 * - What the device did and the registry has not heard (a start, a finish, an OK pressed while
 *   the connection was down) is sent again when the registry next says where the scouter is.
 * - With no connection, the scouter can type the match and team and scout it (OF-1, SC-10, #361).
 *   The registry did not send them, so it neither closes that match nor hears of it, unless it
 *   gave the scouter the same robot.
 */
import type { MatchScoutingConfig } from "@/config/types";
import { toTeamKey, type TeamKey } from "@/data/team";
import type { Action, MatchLevel, ObjectIdHex } from "@/data/types";
import { matchLabel } from "@/schedule/labels";
import { holdingKey, type Alliance, type DeviceView } from "@/sessions/registry";
import type { DeviceAction } from "@/sessions/runtime";
import { initialState, recordedActions, type SessionState } from "@/scouting/session";
import type { Submission } from "@/submissions/submission";

/** The app's version, recorded on each match (`next.config.ts` sets it from package.json). */
export const CLIENT_VERSION = process.env.SPOT_VERSION ?? "0.0.0";

export interface MatchKey {
  level: MatchLevel;
  number: number;
  team: TeamKey;
}

/** The match being scouted: whose, which robot, and the scouting session (src/scouting). */
export interface ActiveMatch extends MatchKey {
  alliance: Alliance;
  scouterId: string;
  eventId: ObjectIdHex | null;
  /** The record's key, made on the device (DV-18). */
  nonce: string;
  enteredAt: number;
  configVersion: string;
  state: SessionState;
  /** Typed by the scouter with no connection (OF-1, SC-10): the registry did not send them. */
  manual?: true;
}

/** A match scouted on this device, kept until the server has it (#360, OF-2). */
export interface FinishedMatch extends MatchKey {
  alliance: Alliance;
  scouterId: string;
  eventId: ObjectIdHex | null;
  nonce: string;
  configVersion: string;
  clientVersion: string;
  submittedAt: number;
  actions: Action[];
  /** Why it ended before Submit: an admin released the robot, or the scouter was signed out. */
  cutShort: "released" | "signed-out" | null;
}

export function keyOf(m: MatchKey): string {
  return holdingKey(m.level, m.number, m.team);
}

/** The robot the registry gave the scouter, or null. */
export function viewMatch(view: DeviceView | null): MatchKey | null {
  if (!view || view.team === null || view.matchLevel === null || view.matchNumber === null)
    return null;
  return { level: view.matchLevel, number: view.matchNumber, team: view.team };
}

/** "Qual 12 | Team 3061", as the status line shows it (SC-1, DV-17). */
export function matchText(m: MatchKey): string {
  return `${matchLabel(m.level, m.number)} | Team ${m.team}`;
}

/** Whether the scouter has pressed Start Match. Before that, nothing is lost by closing it. */
export function started(match: ActiveMatch): boolean {
  return match.state.status !== "pre-match";
}

/**
 * Whether to open the match screen for what the registry says (RT-6, RT-27): the scouter was
 * sent into a match they have not finished, and is not scouting another match on this device.
 * `done` holds the `keyOf` of matches finished on this device.
 */
export function shouldEnter(
  view: DeviceView | null,
  active: ActiveMatch | null,
  done: readonly string[],
): boolean {
  const m = viewMatch(view);
  if (!m || !view!.entered || view!.alliance === null || view!.status === "complete") return false;
  if (active && (keyOf(active) === keyOf(m) || started(active))) return false;
  return !done.includes(keyOf(m));
}

export interface BeginArgs {
  scouterId: string;
  eventId: ObjectIdHex | null;
  config: MatchScoutingConfig;
  configVersion: string;
  nonce: string;
  now: number;
}

function newMatch(key: MatchKey, alliance: Alliance, args: BeginArgs): ActiveMatch {
  return {
    level: key.level,
    number: key.number,
    team: key.team,
    alliance,
    scouterId: args.scouterId,
    eventId: args.eventId,
    nonce: args.nonce,
    enteredAt: args.now,
    configVersion: args.configVersion,
    state: initialState(args.config),
  };
}

/** A new match for the robot the registry sent the scouter to. */
export function beginMatch(view: DeviceView, args: BeginArgs): ActiveMatch {
  return newMatch(viewMatch(view)!, view.alliance!, args);
}

/** A match the scouter typed, with no connection (OF-1, SC-10). */
export function beginManualMatch(key: MatchKey, alliance: Alliance, args: BeginArgs): ActiveMatch {
  return { ...newMatch(key, alliance, args), manual: true };
}

/** Whether the registry gave the scouter this robot, so it hears what they do with it. */
export function registryHas(view: DeviceView | null, m: MatchKey): boolean {
  const assigned = viewMatch(view);
  return assigned !== null && keyOf(assigned) === keyOf(m);
}

/**
 * Whether a match not yet started closes because of what the registry says (BL-54): the
 * registry gave the scouter no robot or another one. A match the scouter typed (OF-1) closes
 * only for another robot: the registry not knowing it is no reason.
 */
export function closesUnstarted(view: DeviceView | null, active: ActiveMatch): boolean {
  const assigned = viewMatch(view);
  if (active.manual) return assigned !== null && keyOf(assigned) !== keyOf(active);
  return assigned === null || keyOf(assigned) !== keyOf(active);
}

/** A match in the schedule the device keeps (#361): which teams are on each alliance. */
export interface ScheduleRow {
  level: MatchLevel;
  number: number;
  red: (TeamKey | null)[];
  blue: (TeamKey | null)[];
}

/** The team's alliance in that match, by the schedule, or null when the schedule does not say. */
export function allianceIn(schedule: readonly ScheduleRow[], m: MatchKey): Alliance | null {
  const row = schedule.find((r) => r.level === m.level && r.number === m.number);
  if (row?.red.includes(m.team)) return "red";
  if (row?.blue.includes(m.team)) return "blue";
  return null;
}

/** Playoff matches are numbered 1 to 16, as the field shows them (RT-22a). */
const MAX_NUMBER: Record<MatchLevel, number> = { qual: 999, playoff: 16 };

/** The match and team a scouter typed (SC-10), or what to fix. A B team is allowed. */
export function checkManualMatch(typed: {
  level: MatchLevel;
  number: string;
  team: string;
}): { ok: true; key: MatchKey } | { ok: false; message: string } {
  const number = Number(typed.number.trim());
  if (!/^\d+$/.test(typed.number.trim()) || number < 1 || number > MAX_NUMBER[typed.level])
    return {
      ok: false,
      message:
        typed.level === "playoff"
          ? "Type the playoff match number, 1 to 16, as the field shows it."
          : "Type the match number the field shows.",
    };
  const team = toTeamKey(typed.team);
  if (!team)
    return {
      ok: false,
      message: "Type the team number, such as 3061, or 3061B for a team's second robot.",
    };
  return { ok: true, key: { level: typed.level, number, team } };
}

/** The record of a match: what it recorded, as analysis receives it (DV-1). */
export function finishMatch(
  match: ActiveMatch,
  now: number,
  cutShort: FinishedMatch["cutShort"] = null,
): FinishedMatch {
  return {
    level: match.level,
    number: match.number,
    team: match.team,
    alliance: match.alliance,
    scouterId: match.scouterId,
    eventId: match.eventId,
    nonce: match.nonce,
    configVersion: match.configVersion,
    clientVersion: CLIENT_VERSION,
    submittedAt: now,
    actions: recordedActions(match.state),
    cutShort,
  };
}

/**
 * What to tell the registry so it agrees with the device (RT-27, RT-28): a start or a finish it
 * missed while the connection was down, or an OK pressed then. Sent when the registry says where
 * the scouter is; each is harmless if it arrives twice.
 */
export function reconcile(
  view: DeviceView | null,
  active: ActiveMatch | null,
  done: readonly string[],
  accepted: string | null,
): DeviceAction[] {
  const m = viewMatch(view);
  if (!view || !m) return [];
  const actions: DeviceAction[] = [];
  if (!view.accepted && accepted === keyOf(m)) actions.push("accept");
  if (active && keyOf(active) === keyOf(m) && started(active) && view.status === "waiting")
    actions.push("start");
  if (view.status !== "complete" && done.includes(keyOf(m))) actions.push("finish", "ready");
  else if (view.status === "complete") actions.push("ready");
  return actions;
}

/**
 * The assignment to show as "You have been assigned team T in match N" (SC-13), or null: a new
 * robot the scouter has not pressed OK on, here or on the server (RT-27).
 */
export function assignmentPrompt(view: DeviceView | null, accepted: string | null): string | null {
  const m = viewMatch(view);
  if (!m || view!.accepted || accepted === keyOf(m) || view!.status !== "waiting") return null;
  return `You have been assigned team ${m.team} in ${matchLabel(m.level, m.number)}.`;
}

/**
 * What the server receives (#360). A match that ended before Submit (released, signed out)
 * covers only part of the match (RT-34); the server also marks partial a replacement who took
 * the robot mid-match, which the device does not know.
 */
export function toSubmission(f: FinishedMatch): Submission {
  return {
    level: f.level,
    matchNumber: f.number,
    team: f.team,
    scouterId: f.scouterId,
    nonce: f.nonce,
    submittedAt: f.submittedAt,
    clientVersion: f.clientVersion,
    coverage: f.cutShort ? "partial" : "full",
    actions: f.actions,
  };
}
