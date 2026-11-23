/**
 * Runs a project's analysis pipeline. Shared by the analysis dashboard (browser), the
 * builder's "test run" preview, and the server (CSV, tests).
 */
import type { AnalysisSettings, Dataset, PipelineStep, Project, TeamMatchPerformance } from "../types";
import { getTransformer, type PipelineContext } from "./transformers";
import { setPath } from "./path";
import { allActionIds } from "../scouting/ids";

export interface TbaMatch {
  key: string;
  comp_level: string;
  match_number: number;
  alliances: { red: { team_keys: string[]; score: number }; blue: { team_keys: string[]; score: number } };
  score_breakdown?: { red?: Record<string, unknown>; blue?: Record<string, unknown> } | null;
}

export interface TbaData {
  matches: TbaMatch[];
  teams: { team_number: number; nickname: string }[];
  coprs: Record<string, Record<string, number>>;
}

export interface StepResult {
  index: number;
  ok: boolean;
  error?: string;
  ms: number;
}

export interface PipelineRun {
  dataset: Dataset;
  steps: StepResult[];
  unknownActionIds: { id: string; count: number }[];
}

/** Append TBA score-breakdown values as synthetic actions (e.g. endGameTowerRobot_Level2). */
export function applyBreakdownEnrichment(tmps: TeamMatchPerformance[], tba: TbaData | null, settings: AnalysisSettings["tbaBreakdown"]) {
  if (!tba || !settings?.enabled || !settings.prefixes?.length) return;
  const qm = new Map(tba.matches.filter((m) => m.comp_level === "qm").map((m) => [m.match_number, m]));
  for (const tmp of tmps) {
    const m = qm.get(Number(tmp.matchNumber));
    if (!m) continue;
    let alliance: "red" | "blue" | "" = "";
    let slot = 0;
    for (const color of ["blue", "red"] as const) {
      m.alliances[color].team_keys.forEach((k, i) => {
        if (k.substring(3) === String(tmp.robotNumber)) {
          alliance = color;
          slot = i + 1;
        }
      });
    }
    if (!alliance) continue;
    const breakdown = m.score_breakdown?.[alliance];
    if (!breakdown) continue;
    for (const prefix of settings.prefixes) {
      for (const [key, value] of Object.entries(breakdown)) {
        if (key.startsWith(prefix) && key.endsWith(String(slot))) {
          tmp.actionQueue.push({ id: `${key.substring(0, key.length - 1)}_${value}`, ts: 0 });
          break;
        }
      }
    }
  }
}

export function attachOprs(teams: Dataset["teams"], tba: TbaData | null, oprKeys: string[]) {
  if (!tba || !oprKeys?.length) return;
  for (const [team, obj] of Object.entries(teams)) {
    for (const name of oprKeys) setPath(obj, `opr.${name}`, tba.coprs?.[name]?.[`frc${team}`]);
  }
}

export interface RunOptions {
  tba?: TbaData | null;
  /** Override (e.g. legacy action-id list for oracle tests). */
  actionIds?: string[];
  /** Stop after this many steps (builder preview of an intermediate step). */
  untilStep?: number;
}

export function runPipeline(project: Pick<Project, "scouting" | "scoring" | "pipeline" | "analysis">, tmpsIn: TeamMatchPerformance[], opts: RunOptions = {}): PipelineRun {
  // Work on a copy so callers can re-run with different configs.
  const tmps: TeamMatchPerformance[] = structuredClone(tmpsIn);
  for (const t of tmps) {
    t.actionQueue = (t.actionQueue || []).map((a) => {
      const { _id, ...rest } = a as typeof a & { _id?: unknown };
      return rest;
    });
  }

  applyBreakdownEnrichment(tmps, opts.tba ?? null, project.analysis?.tbaBreakdown);

  const teams: Dataset["teams"] = {};
  for (const t of [...tmps].sort((a, b) => a.robotNumber - b.robotNumber)) teams[String(t.robotNumber)] ??= {};
  attachOprs(teams, opts.tba ?? null, project.analysis?.oprKeys ?? []);

  const ctx: PipelineContext = {
    actionIds: opts.actionIds ?? allActionIds(project.scouting),
    totalTime: project.scouting.totalTime,
    scoring: project.scoring,
  };

  const known = new Set(ctx.actionIds);
  const unknown = new Map<string, number>();
  for (const t of tmps) for (const a of t.actionQueue) if (!known.has(a.id)) unknown.set(a.id, (unknown.get(a.id) || 0) + 1);

  let dataset: Dataset = { tmps, teams };
  const steps: StepResult[] = [];
  const pipeline: PipelineStep[] = project.pipeline || [];
  const last = opts.untilStep ?? pipeline.length - 1;
  pipeline.forEach((step, index) => {
    if (index > last || step.disabled) return;
    const t0 = performance.now();
    const def = getTransformer(step.name);
    const impl = def?.types[step.type];
    if (!impl) {
      steps.push({ index, ok: false, error: `No ${step.type} transformer named "${step.name}"`, ms: 0 });
      return;
    }
    try {
      dataset = impl.exec(dataset, step.outputPath, step.options ?? {}, ctx) ?? dataset;
      steps.push({ index, ok: true, ms: performance.now() - t0 });
    } catch (e) {
      steps.push({ index, ok: false, error: e instanceof Error ? e.message : String(e), ms: performance.now() - t0 });
    }
  });

  return {
    dataset,
    steps,
    unknownActionIds: [...unknown.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, count })),
  };
}
