/**
 * Points map + scouter accuracy.
 *
 * Each action id can be worth points. Scouted points per robot are summed per alliance and
 * compared with the official TBA alliance score; the difference (residual) is attributed to
 * the alliance's scouters, weighted by their historical error, so consistently inaccurate
 * scouters absorb more of the blame.
 */
import type { Action, ScoringConfig } from "./types";

export const emptyScoring = (): ScoringConfig => ({ version: 1, points: {}, suffixMatch: true });

export function normalizePoints(points: Record<string, unknown> | undefined | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(points || {})) {
    if (id && Number.isFinite(Number(v))) out[id] = Number(v);
  }
  return out;
}

/** Exact id first, then (if enabled) the longest configured id that the action id ends with. */
export function resolvePointsKey(actionId: string, points: Record<string, number>, suffixMatch = true): string | null {
  if (Object.prototype.hasOwnProperty.call(points, actionId)) return actionId;
  if (!suffixMatch) return null;
  const lower = actionId.toLowerCase();
  let best: string | null = null;
  for (const key of Object.keys(points)) {
    if (lower.endsWith(key.toLowerCase()) && (!best || key.length > best.length)) best = key;
  }
  return best;
}

export function pointsForAction(actionId: string, scoring: Pick<ScoringConfig, "points" | "suffixMatch"> | undefined): number {
  if (!scoring) return 0;
  const key = resolvePointsKey(actionId, scoring.points, scoring.suffixMatch);
  return key ? scoring.points[key] : 0;
}

export function calculatePredictedScore(actionQueue: Action[], scoring: Pick<ScoringConfig, "points" | "suffixMatch">) {
  const rules = normalizePoints(scoring.points);
  const breakdown: Record<string, { count: number; points: number }> = {};
  let total = 0;
  for (const a of actionQueue || []) {
    if (!a || typeof a.id !== "string") continue;
    const key = resolvePointsKey(a.id, rules, scoring.suffixMatch);
    const p = key ? rules[key] : 0;
    breakdown[a.id] ??= { count: 0, points: 0 };
    breakdown[a.id].count++;
    breakdown[a.id].points += p;
    total += p;
  }
  return { total, breakdown };
}

export interface AccuracyRecord {
  scouterId: string;
  robotNumber: number | string;
  matchKey: string | null | undefined;
  actionQueue: Action[];
  /** Points snapshot stored with the match when it was scouted (falls back to current map). */
  scoringRules?: Record<string, number>;
}

export interface OfficialMatch {
  key: string;
  alliances: { red: { score: number; team_keys: string[] }; blue: { score: number; team_keys: string[] } };
}

export interface ScouterAccuracy {
  scouterId: string;
  matches: number;
  averageAttributedError: number;
  signedBias: number;
  accuracy: number | null;
  confidence: "high" | "medium" | "low";
}

export interface AllianceResult {
  matchKey: string;
  alliance: "red" | "blue";
  predictedScore: number;
  officialScore: number;
  residual: number;
  scouters: string[];
}

const historicalWeight = (s: { matches: number; absoluteError: number } | undefined) =>
  !s || s.matches === 0 ? 1 : Math.max(s.absoluteError / s.matches, 0.01);

export function calculateScouterAccuracy(records: AccuracyRecord[], officialMatches: OfficialMatch[], scoring: ScoringConfig) {
  const current = { points: normalizePoints(scoring.points), suffixMatch: scoring.suffixMatch };
  const matches = new Map(
    officialMatches
      .filter((m) => m?.key && m.alliances && m.alliances.red?.score >= 0 && m.alliances.blue?.score >= 0)
      .map((m) => [m.key, m]),
  );

  type Report = { scouterId: string; robotNumber: string; alliance: "red" | "blue"; predictedScore: number };
  const reportsByMatch = new Map<string, Report[]>();
  const stats = new Map<string, { scouterId: string; matches: number; absoluteError: number; signedBias: number; accuracyTotal: number }>();

  for (const r of records) {
    if (!r.matchKey || !r.scouterId || !matches.has(r.matchKey)) continue;
    const m = matches.get(r.matchKey)!;
    const robot = String(r.robotNumber);
    const alliance = (["red", "blue"] as const).find((c) => (m.alliances[c].team_keys || []).some((k) => k.replace(/^frc/, "") === robot));
    if (!alliance) continue;
    const rules = r.scoringRules && Object.keys(r.scoringRules).length ? { points: r.scoringRules, suffixMatch: current.suffixMatch } : current;
    const list = reportsByMatch.get(r.matchKey) || [];
    list.push({ scouterId: r.scouterId, robotNumber: robot, alliance, predictedScore: calculatePredictedScore(r.actionQueue, rules).total });
    reportsByMatch.set(r.matchKey, list);
    if (!stats.has(r.scouterId)) stats.set(r.scouterId, { scouterId: r.scouterId, matches: 0, absoluteError: 0, signedBias: 0, accuracyTotal: 0 });
  }

  const processed: AllianceResult[] = [];
  const ordered = [...reportsByMatch.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  for (const [matchKey, reports] of ordered) {
    const m = matches.get(matchKey)!;
    for (const alliance of ["red", "blue"] as const) {
      const expected = new Set((m.alliances[alliance].team_keys || []).map((k) => k.replace(/^frc/, "")));
      const byRobot = new Map<string, Report>();
      // Latest report per robot wins (re-scouts replace earlier data).
      for (const rep of reports) if (rep.alliance === alliance && expected.has(rep.robotNumber)) byRobot.set(rep.robotNumber, rep);
      if (byRobot.size !== expected.size) continue;
      const selected = [...byRobot.values()];
      const predictedScore = selected.reduce((a, r) => a + r.predictedScore, 0);
      const officialScore = m.alliances[alliance].score;
      const residual = officialScore - predictedScore;
      const weights = selected.map((r) => historicalWeight(stats.get(r.scouterId)));
      const totalWeight = weights.reduce((a, w) => a + w, 0);
      selected.forEach((r, i) => {
        const err = residual * (weights[i] / totalWeight);
        const s = stats.get(r.scouterId)!;
        s.matches++;
        s.absoluteError += Math.abs(err);
        s.signedBias += err;
        s.accuracyTotal += Math.max(0, 100 * (1 - Math.abs(err) / Math.max(officialScore, 1)));
      });
      processed.push({ matchKey, alliance, predictedScore, officialScore, residual, scouters: selected.map((r) => r.scouterId) });
    }
  }

  const scouters: ScouterAccuracy[] = [...stats.values()]
    .map((s) => ({
      scouterId: s.scouterId,
      matches: s.matches,
      averageAttributedError: s.matches ? s.absoluteError / s.matches : 0,
      signedBias: s.matches ? s.signedBias / s.matches : 0,
      accuracy: s.matches ? s.accuracyTotal / s.matches : null,
      confidence: (s.matches >= 10 ? "high" : s.matches >= 5 ? "medium" : "low") as ScouterAccuracy["confidence"],
    }))
    .sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1));

  return { scoringVersion: scoring.version, matches: processed, scouters };
}
