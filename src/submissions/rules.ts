/**
 * Which record counts for a robot in a match, and which is flagged for review (#360). Pure, so
 * the rules are tested without a database:
 *
 * - **RT-14a** A re-scout replaces the earlier record: the later `submittedAt` wins, the time the
 *   scouter submitted, so a device that syncs late cannot replace a re-scout made after it.
 * - **RT-35** After a release, the record of whoever held the robot when the match ended wins
 *   over the released scouter's, whatever the submission times.
 * - **RT-34** A replacement who took the robot after the match started covers only part of it.
 * - **RT-36** A replacement's record is flagged for review when they joined mid-match, or when
 *   the released scouter sent a record too. A clean substitution before the start is not.
 *
 * Losers are kept, marked `superseded` (DV-7), and only records still current are weighed, so an
 * admin who promotes a superseded record (Phase 4) is not overruled until a new record arrives.
 */
import type { Assignment, Coverage, Flag } from "@/data/types";
import { holderAtEnd, wasReplacement } from "@/sessions/registry";

export interface RobotRecord {
  _id: string;
  nonce: string;
  scouterId: string | null;
  submittedAt: number;
  superseded: boolean;
  coverage: Coverage;
  flag: Flag;
}

/** Flag reasons. The flag is public (SEC-8), so they say "replacement" and name no one. */
export const REPLACEMENT_MID_MATCH =
  "Scouted by a replacement who took this robot after the match started, so the start of the match is missing. Check it against video.";
export const REPLACEMENT_TWO_RECORDS =
  "Scouted by a replacement. The scouter released from this robot also sent a record, which is kept as superseded. Check which one covers the match.";

const latestFirst = (a: RobotRecord, b: RobotRecord) =>
  b.submittedAt - a.submittedAt || a.nonce.localeCompare(b.nonce);

/** The record analysis uses (RT-14a, RT-35), from the records not superseded. */
export function winner(
  current: readonly RobotRecord[],
  assignment: Assignment | null,
): RobotRecord {
  if (current.length === 0) throw new Error("winner of no records");
  const byTime = [...current].sort(latestFirst);
  const end = assignment ? holderAtEnd(assignment) : null;
  if (!end || !byTime.some((r) => r.scouterId === end.scouterId)) return byTime[0];
  // Someone released from the robot loses to whoever held it at the end (RT-35); a re-scout by
  // anyone else still wins by time (RT-14a).
  const released = new Set(
    assignment!.holders.filter((h) => h.ended === "released").map((h) => h.scouterId),
  );
  released.delete(end.scouterId);
  return byTime.find((r) => r.scouterId === null || !released.has(r.scouterId))!;
}

function lastHolding(assignment: Assignment | null, scouterId: string | null) {
  if (!assignment || scouterId === null) return undefined;
  return assignment.holders.findLast((h) => h.scouterId === scouterId);
}

/** Partial if the device ended early, or the scouter took the robot mid-match (RT-34). */
export function coverageOf(
  sent: Coverage,
  scouterId: string | null,
  assignment: Assignment | null,
): Coverage {
  return sent === "partial" || lastHolding(assignment, scouterId)?.afterStart ? "partial" : "full";
}

/**
 * Why a record must be reviewed as a replacement's (RT-36), or null. `all` is every record for
 * the robot and match, superseded included.
 */
export function replacementReason(
  scouterId: string | null,
  assignment: Assignment | null,
  all: readonly Pick<RobotRecord, "scouterId">[],
): string | null {
  if (scouterId === null || !assignment || !wasReplacement(assignment, scouterId)) return null;
  if (lastHolding(assignment, scouterId)?.afterStart) return REPLACEMENT_MID_MATCH;
  const i = assignment.holders.findLastIndex((h) => h.scouterId === scouterId);
  const released = new Set(
    assignment.holders
      .slice(0, i)
      .filter((h) => h.ended === "released" && h.scouterId !== scouterId)
      .map((h) => h.scouterId),
  );
  return all.some((r) => r.scouterId !== null && released.has(r.scouterId))
    ? REPLACEMENT_TWO_RECORDS
    : null;
}

/** What to change on each record after one arrives: superseded, and machine flags. */
export function resolve(
  all: readonly RobotRecord[],
  assignment: Assignment | null,
  now: number,
): Map<string, Partial<Pick<RobotRecord, "superseded" | "flag">>> {
  const changes = new Map<string, Partial<Pick<RobotRecord, "superseded" | "flag">>>();
  const current = all.filter((r) => !r.superseded);
  const win = current.length > 0 ? winner(current, assignment) : null;
  for (const r of all) {
    const change: Partial<Pick<RobotRecord, "superseded" | "flag">> = {};
    if (!r.superseded && win && r._id !== win._id) change.superseded = true;
    // Never over a flag already set, by an admin or by an earlier arrival.
    const reason = r.flag.flagged ? null : replacementReason(r.scouterId, assignment, all);
    if (reason) change.flag = { flagged: true, reason, source: "machine", at: now };
    if (Object.keys(change).length > 0) changes.set(r._id, change);
  }
  return changes;
}
