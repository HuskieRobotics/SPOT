/**
 * How the dashboard names a team value it lists for choosing (#387; docs/spec/08 AN-16, AN-19):
 * `averageScores.autoShootingRating` is "Average Auto Shooting Rating", and
 * `opr.minorFoulCount` is "OPR Minor Foul Count".
 */

/**
 * A key in words: "autoShootingRating" is "Auto Shooting Rating", "activeShift1" is "Active
 * Shift 1" (but "scoreL4" is "Score L4"), and "Hub Total Fuel Count" stays as it is.
 */
export function words(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** The name of `averageScores.<key>` or `opr.<key>`. */
export function valueLabel(source: "averageScores" | "opr", key: string): string {
  return `${source === "opr" ? "OPR" : "Average"} ${words(key)}`;
}
