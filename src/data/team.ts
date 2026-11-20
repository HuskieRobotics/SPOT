/**
 * Team keys (DM-1a, BL-308).
 *
 * A robot is identified by its team key: the FRC team number as a string, plus an optional
 * one-letter suffix for the second robot a team brings to an off-season event ("2338B"). This
 * is The Blue Alliance's `team_key` without the `frc` prefix. It is a string on every path,
 * stored, compared and used as an object key, so nothing depends on `==` coercion (D-7).
 */

/** "3061", "2338B". */
export type TeamKey = string;

/** One to five digits without a leading zero, then at most one capital letter. */
export const TEAM_KEY_PATTERN = /^[1-9][0-9]{0,4}[A-Z]?$/;

export function isTeamKey(value: unknown): value is TeamKey {
  return typeof value === "string" && TEAM_KEY_PATTERN.test(value);
}

/**
 * Normalize what a source hands us into a team key, or null when it is not one.
 * Accepts numbers (FIRST API, v5 documents), digit strings, and TBA keys (`frc2338B`), and
 * tolerates surrounding whitespace and a lower-case prefix or suffix.
 */
export function toTeamKey(value: unknown): TeamKey | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? toTeamKey(String(value)) : null;
  }
  if (typeof value !== "string") return null;
  const key = value
    .trim()
    .replace(/^frc/i, "")
    .replace(/[a-z]$/, (letter) => letter.toUpperCase());
  return isTeamKey(key) ? key : null;
}

/** The numeric part: 2338 for "2338B". */
export function teamNumber(key: TeamKey): number {
  return Number.parseInt(key, 10);
}

/** The suffix letter, or "" for a team's first robot. */
export function teamSuffix(key: TeamKey): string {
  const last = key.at(-1) ?? "";
  return /[A-Z]/.test(last) ? last : "";
}

/** Numeric order, then suffix: 254, 2338, 2338B, 3061. */
export function compareTeamKeys(a: TeamKey, b: TeamKey): number {
  return teamNumber(a) - teamNumber(b) || teamSuffix(a).localeCompare(teamSuffix(b));
}
