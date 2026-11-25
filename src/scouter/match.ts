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
 */
import type { MatchScoutingConfig } from "@/config/types";
import type { TeamKey } from "@/data/team";
import type { Action, MatchLevel, ObjectIdHex } from "@/data/types";
import { matchLabel } from "@/schedule/labels";
import { holdingKey, type Alliance, type DeviceView } from "@/sessions/registry";
import type { DeviceAction } from "@/sessions/runtime";
import { initialState, recordedActions, type SessionState } from "@/scouting/session";

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
}

/** A match scouted on this device, kept until it is sent (#360). */
export interface FinishedMatch extends MatchKey {
  alliance: Alliance;
  scouterId: string;
  eventId: ObjectIdHex | null;
  nonce: string;
  configVersion: string;
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

const finishedFor = (finished: readonly FinishedMatch[], m: MatchKey) =>
  finished.some((f) => keyOf(f) === keyOf(m));

/**
 * Whether to open the match screen for what the registry says (RT-6, RT-27): the scouter was
 * sent into a match they have not finished, and is not scouting another match on this device.
 */
export function shouldEnter(
  view: DeviceView | null,
  active: ActiveMatch | null,
  finished: readonly FinishedMatch[],
): boolean {
  const m = viewMatch(view);
  if (!m || !view!.entered || view!.alliance === null || view!.status === "complete") return false;
  if (active && (keyOf(active) === keyOf(m) || started(active))) return false;
  return !finishedFor(finished, m);
}

/** A new match for the robot the registry sent the scouter to. */
export function beginMatch(
  view: DeviceView,
  args: {
    scouterId: string;
    eventId: ObjectIdHex | null;
    config: MatchScoutingConfig;
    configVersion: string;
    nonce: string;
    now: number;
  },
): ActiveMatch {
  return {
    ...viewMatch(view)!,
    alliance: view.alliance!,
    scouterId: args.scouterId,
    eventId: args.eventId,
    nonce: args.nonce,
    enteredAt: args.now,
    configVersion: args.configVersion,
    state: initialState(args.config),
  };
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
  finished: readonly FinishedMatch[],
  accepted: string | null,
): DeviceAction[] {
  const m = viewMatch(view);
  if (!view || !m) return [];
  const actions: DeviceAction[] = [];
  if (!view.accepted && accepted === keyOf(m)) actions.push("accept");
  if (active && keyOf(active) === keyOf(m) && started(active) && view.status === "waiting")
    actions.push("start");
  if (view.status !== "complete" && finishedFor(finished, m)) actions.push("finish", "ready");
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
