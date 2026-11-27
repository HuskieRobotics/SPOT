/**
 * The edit page's records (#410; document 07 AD-10 to AD-13): what each row shows, the filters,
 * and the count of each action. Pure, so it is tested without a server or a browser.
 */
import type { PerformanceSummary } from "@/db/performances";
import type {
  Action,
  Coverage,
  Flag,
  MatchLevel,
  PerformanceSource,
  ScheduledMatch,
} from "@/data/types";
import { toTeamKey, type TeamKey } from "@/data/team";
import { matchLabel } from "@/schedule/labels";

export type Alliance = "red" | "blue";

/** One record on the edit page. Admins only: it names the scouter (SEC-5, SEC-8). */
export interface EditRow {
  id: string;
  level: MatchLevel;
  matchNumber: number;
  /** "Qual 12", "Playoff 5", "Final 2" (RT-22a). */
  match: string;
  team: TeamKey;
  /** The robot's alliance in that match, from the schedule; null when the schedule lacks it. */
  alliance: Alliance | null;
  scouterId: string | null;
  /** The scouter's name, or null for a record with no scouter or an id not on the roster. */
  scouterName: string | null;
  source: PerformanceSource;
  submittedAt: number;
  coverage: Coverage;
  superseded: boolean;
  flag: Flag;
  actionCount: number;
}

/** Newest first (AD-11), each with its scouter's name and its alliance (AD-12). */
export function editRows(
  records: readonly PerformanceSummary[],
  names: ReadonlyMap<string, string>,
  matches: readonly ScheduledMatch[],
): EditRow[] {
  const alliance = (r: PerformanceSummary): Alliance | null => {
    const m = matches.find((x) => x.level === r.level && x.number === r.matchNumber);
    if (m?.red.includes(r.team)) return "red";
    if (m?.blue.includes(r.team)) return "blue";
    return null;
  };
  const key = (r: PerformanceSummary) =>
    matches.find((x) => x.level === r.level && x.number === r.matchNumber)?.key;
  return records
    .map((r) => ({
      id: r._id,
      level: r.level,
      matchNumber: r.matchNumber,
      match: matchLabel(r.level, r.matchNumber, key(r)),
      team: r.team,
      alliance: alliance(r),
      scouterId: r.scouterId,
      scouterName: r.scouterId === null ? null : (names.get(r.scouterId) ?? null),
      source: r.source,
      submittedAt: r.submittedAt,
      coverage: r.coverage,
      superseded: r.superseded,
      flag: r.flag,
      actionCount: r.actionCount,
    }))
    .sort((a, b) => b.submittedAt - a.submittedAt || a.id.localeCompare(b.id));
}

export interface EditFilters {
  /** Part of the scouter's name or student ID, in any case. */
  scouter: string;
  /** A match number: Qual 12 and Playoff 12 both match "12". */
  match: string;
  /** A team as an admin types it: "3061", "frc3061", "2338b". */
  team: string;
}

export const NO_FILTERS: EditFilters = { scouter: "", match: "", team: "" };

/** AD-11: the rows every filter typed matches. A filter left empty matches every row. */
export function filterRows(rows: readonly EditRow[], filters: EditFilters): EditRow[] {
  const scouter = filters.scouter.trim().toLowerCase();
  const match = filters.match.trim();
  const team = filters.team.trim();
  const teamKey = team === "" ? null : toTeamKey(team);
  return rows.filter(
    (r) =>
      (scouter === "" ||
        (r.scouterName ?? "").toLowerCase().includes(scouter) ||
        (r.scouterId ?? "").toLowerCase().includes(scouter)) &&
      (match === "" || String(r.matchNumber) === match.replace(/^0+(?=\d)/, "")) &&
      (team === "" || r.team === teamKey),
  );
}

/** AD-13: each action id with how many times it was pressed, in the order first pressed. */
export function actionCounts(actions: readonly Pick<Action, "id">[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const a of actions) counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
  return [...counts];
}

/** How a record reached the server, in words. */
export const SOURCE_LABELS: Record<PerformanceSource, string> = {
  app: "Sent from a phone",
  qr: "Scanned from a QR code",
  import: "Imported from v5",
};
