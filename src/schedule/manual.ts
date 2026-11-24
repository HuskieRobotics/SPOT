/**
 * A schedule typed by an admin (D-4, AD-22 to AD-25a, #355), for an event TBA does not cover.
 *
 * Teams are typed as an admin reads them: `3061`, `frc3061`, `2338b` are all fine and become
 * team keys (RT-23b, DM-1a, BL-308). A blank slot is allowed while the schedule is being typed.
 * Anything else is refused with the match and slot, so the admin can find it.
 */
import { compareTeamKeys, toTeamKey, type TeamKey } from "@/data/team";
import type { ScheduledMatch } from "@/data/types";

export interface TypedMatch {
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
  const seen = new Set<number>();
  const out = typed.map((m: TypedMatch, i) => {
    const n = m?.number;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1)
      throw new ScheduleError(`Row ${i + 1}: the match number must be a whole number from 1.`);
    if (seen.has(n)) throw new ScheduleError(`Match ${n} appears twice.`);
    seen.add(n);
    if (
      !Array.isArray(m.red) ||
      !Array.isArray(m.blue) ||
      m.red.length !== 3 ||
      m.blue.length !== 3
    )
      throw new ScheduleError(`Match ${n}: each alliance has three teams.`);
    const slots = [...m.red, ...m.blue].map((value: unknown, s): TeamKey | null => {
      if (value === null || (typeof value === "string" && value.trim() === "")) return null;
      const key = toTeamKey(value);
      if (!key)
        throw new ScheduleError(
          `Match ${n}, ${SLOTS[s]}: "${String(value)}" is not a team number. Type a number such as 3061, or 2338B for a second robot.`,
        );
      return key;
    });
    const filled = slots.filter((t): t is TeamKey => t !== null);
    const twice = filled.find((t, j) => filled.indexOf(t) !== j);
    if (twice) throw new ScheduleError(`Match ${n}: team ${twice} is in it twice.`);
    return {
      number: n,
      key: `manual_qm${n}`,
      red: slots.slice(0, 3) as ScheduledMatch["red"],
      blue: slots.slice(3) as ScheduledMatch["blue"],
      ...(m.locked === true ? { locked: true } : {}),
    };
  });
  return out.sort((a, b) => a.number - b.number);
}

/** Every team in a schedule, once each, in team order. Replaces v5's `tempTeams` (F-12). */
export function scheduleTeams(matches: ScheduledMatch[]): TeamKey[] {
  const teams = new Set<TeamKey>();
  for (const m of matches) for (const t of [...m.red, ...m.blue]) if (t) teams.add(t);
  return [...teams].sort(compareTeamKeys);
}
