/**
 * A schedule typed by an admin (D-4, AD-22 to AD-25a, #355), for an event TBA does not cover.
 *
 * Teams are typed as an admin reads them: `3061`, `frc3061`, `2338b` are all fine and become
 * team keys (RT-23b, DM-1a, BL-308). A blank slot is allowed while the schedule is being typed.
 * Anything else is refused with the match and slot, so the admin can find it.
 *
 * Each row has a level (DV-17): `qual` unless it says `playoff`. Numbers count within a level, so
 * there can be a Qual 5 and a Playoff 5.
 */
import { compareTeamKeys, toTeamKey, type TeamKey } from "@/data/team";
import type { MatchLevel, ScheduledMatch } from "@/data/types";
import { matchLabel } from "./labels";

export interface TypedMatch {
  level?: unknown;
  number: unknown;
  red: unknown;
  blue: unknown;
  locked?: unknown;
}

export class ScheduleError extends Error {}

const SLOTS = ["Red 1", "Red 2", "Red 3", "Blue 1", "Blue 2", "Blue 3"];

/** Read a typed schedule, or throw `ScheduleError` naming the first problem. */
export function parseManualSchedule(typed: unknown): ScheduledMatch[] {
  if (!Array.isArray(typed)) throw new ScheduleError("The schedule must be a list of matches.");
  const seen = new Set<string>();
  const out = typed.map((m: TypedMatch, i) => {
    const level: MatchLevel = m?.level === "playoff" ? "playoff" : "qual";
    if (m?.level !== undefined && m.level !== "qual" && m.level !== "playoff")
      throw new ScheduleError(`Row ${i + 1}: the level must be qual or playoff.`);
    const n = m?.number;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1)
      throw new ScheduleError(`Row ${i + 1}: the match number must be a whole number from 1.`);
    const name = matchLabel(level, n);
    if (seen.has(`${level}:${n}`)) throw new ScheduleError(`${name} appears twice.`);
    seen.add(`${level}:${n}`);
    if (
      !Array.isArray(m.red) ||
      !Array.isArray(m.blue) ||
      m.red.length !== 3 ||
      m.blue.length !== 3
    )
      throw new ScheduleError(`${name}: each alliance has three teams.`);
    const slots = [...m.red, ...m.blue].map((value: unknown, s): TeamKey | null => {
      if (value === null || (typeof value === "string" && value.trim() === "")) return null;
      const key = toTeamKey(value);
      if (!key)
        throw new ScheduleError(
          `${name}, ${SLOTS[s]}: "${String(value)}" is not a team number. Type a number such as 3061, or 2338B for a second robot.`,
        );
      return key;
    });
    const filled = slots.filter((t): t is TeamKey => t !== null);
    const twice = filled.find((t, j) => filled.indexOf(t) !== j);
    if (twice) throw new ScheduleError(`${name}: team ${twice} is in it twice.`);
    return {
      level,
      number: n,
      key: `manual_${level === "qual" ? "qm" : "p"}${n}`,
      red: slots.slice(0, 3) as ScheduledMatch["red"],
      blue: slots.slice(3) as ScheduledMatch["blue"],
      ...(m.locked === true ? { locked: true } : {}),
    };
  });
  return out.sort(compareMatches);
}

/** Qualifications first, then playoffs, each by number. */
export function compareMatches(a: ScheduledMatch, b: ScheduledMatch): number {
  return (a.level === b.level ? 0 : a.level === "qual" ? -1 : 1) || a.number - b.number;
}

/** Every team in a schedule, once each, in team order. Replaces v5's `tempTeams` (F-12). */
export function scheduleTeams(matches: ScheduledMatch[]): TeamKey[] {
  const teams = new Set<TeamKey>();
  for (const m of matches) for (const t of [...m.red, ...m.blue]) if (t) teams.add(t);
  return [...teams].sort(compareTeamKeys);
}
