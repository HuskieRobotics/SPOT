/**
 * The analysis dataset: what the pipeline reads and writes (docs/spec/08 AN-9, docs/spec/09 TR-4).
 *
 * `tmps` holds one entry per scouted robot per match. Each is the stored performance minus every
 * field that identifies a scouter (SEC-8, ADR 0004: public views carry no scouter name, id or
 * initials; `matchKey` embeds the scouter id, so it goes too). Actions are as stored: the button
 * id plus the period it was pressed in (CS-16, docs/spec/20 §2.2). Pipeline entries add their
 * outputs to these objects at their `outputPath`.
 *
 * `teams` holds one object per team key (DM-1a) that appears in `tmps`; team entries write there.
 */
import type { Action, Coverage, Flag, PerformanceSource, TeamMatchPerformance } from "@/data/types";
import { compareTeamKeys, type TeamKey } from "@/data/team";

/** The stored fields analysis may see. Everything else on a performance is pipeline output. */
export interface AnalysisPerformanceFields {
  _id: string;
  eventId: string;
  matchNumber: number;
  team: TeamKey;
  source: PerformanceSource;
  clientVersion: string;
  submittedAt: number;
  coverage: Coverage;
  superseded: boolean;
  flag: Flag;
  notes: string | null;
  tags: string[];
  actions: readonly Action[];
}

export const ANALYSIS_PERFORMANCE_FIELDS = [
  "_id",
  "eventId",
  "matchNumber",
  "team",
  "source",
  "clientVersion",
  "submittedAt",
  "coverage",
  "superseded",
  "flag",
  "notes",
  "tags",
  "actions",
] as const satisfies readonly (keyof AnalysisPerformanceFields)[];

/** A performance as the pipeline sees it: stored fields plus whatever entries have written. */
export type AnalysisPerformance = AnalysisPerformanceFields & Record<string, unknown>;

export type TeamData = Record<string, unknown>;

export interface Dataset {
  tmps: AnalysisPerformance[];
  teams: Record<TeamKey, TeamData>;
}

/**
 * The public projection of a stored performance (SEC-8). This is the read-path filter as well:
 * a dataset endpoint returns exactly these fields.
 */
export function toAnalysisPerformance(
  performance: TeamMatchPerformance | AnalysisPerformanceFields,
): AnalysisPerformanceFields {
  const out = {} as Record<string, unknown>;
  for (const field of ANALYSIS_PERFORMANCE_FIELDS) {
    out[field] = structuredClone((performance as unknown as Record<string, unknown>)[field]);
  }
  return out as unknown as AnalysisPerformanceFields;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Order performances deterministically: by submission time, then by id.
 *
 * Order matters to entries that concatenate across performances (`aggregateArray`) and to
 * choosing between duplicates. v5 ordered by timestamp then `matchId`; v6 cannot use `matchKey`
 * because it is not public, and on the real exports the two orders agree (the one timestamp tie,
 * in 2026, is a record synced twice with identical content).
 */
export function comparePerformances(
  a: Pick<AnalysisPerformanceFields, "submittedAt" | "_id">,
  b: Pick<AnalysisPerformanceFields, "submittedAt" | "_id">,
): number {
  return a.submittedAt - b.submittedAt || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0);
}

export interface BuildDatasetOptions {
  /**
   * Runs on the projected performances before they are frozen, for steps that legitimately add
   * stored-like data, such as TBA score-breakdown actions (docs/spec/08 AN-7).
   */
  prepare?: (tmps: AnalysisPerformanceFields[]) => void;
}

/**
 * Build the dataset the pipeline runs on. The input is not modified. Stored fields are frozen,
 * so an entry that tries to change them (v5's `finalActionOccurrence` reversed the action list
 * in place, F-3) fails loudly instead of corrupting later entries.
 */
export function buildDataset(
  performances: readonly (TeamMatchPerformance | AnalysisPerformanceFields)[],
  options: BuildDatasetOptions = {},
): Dataset {
  const projected = performances.map(toAnalysisPerformance).sort(comparePerformances);
  options.prepare?.(projected);

  const tmps: AnalysisPerformance[] = projected.map((p) => {
    for (const field of ANALYSIS_PERFORMANCE_FIELDS) {
      // Neither replaceable nor deletable, and frozen all the way down; entries only add fields.
      Object.defineProperty(p, field, {
        value: deepFreeze(p[field]),
        writable: false,
        configurable: false,
        enumerable: true,
      });
    }
    return p as AnalysisPerformance;
  });

  const teams: Record<TeamKey, TeamData> = {};
  for (const team of [...new Set(tmps.map((t) => t.team))].sort(compareTeamKeys)) {
    teams[team] = {};
  }
  return { tmps, teams };
}

/** The team's performances, in dataset order (TR-4). */
export function performancesOf(dataset: Dataset, team: TeamKey): AnalysisPerformance[] {
  return dataset.tmps.filter((t) => t.team === team);
}
