import type { Project, ScoutingConfig } from "../types";
import { blankScouting, defaultAnalysis, DEFAULT_MESSAGES, newUid } from "./defaults";

/** Fill in any missing fields so older or hand-edited project JSON always loads. */
export function normalizeScouting(s: Partial<ScoutingConfig> | undefined): ScoutingConfig {
  const base = blankScouting();
  const src = (s ?? {}) as Partial<ScoutingConfig>;
  const out: ScoutingConfig = {
    ...base,
    ...src,
    version: 2,
    grid: { rows: Math.max(1, Number(src.grid?.rows) || base.grid.rows), columns: Math.max(1, Number(src.grid?.columns) || base.grid.columns) },
    totalTime: Number(src.totalTime) || base.totalTime,
    phases: Array.isArray(src.phases) ? src.phases.map((p) => ({ ...p, at: Number(p.at), layer: Number.isFinite(Number(p.layer)) ? Number(p.layer) : -1, label: String(p.label ?? "") })) : base.phases,
    shifts: { ...base.shifts, ...(src.shifts || {}) },
    variables: { ...(src.variables || {}) },
    minQueueLength: Number.isFinite(Number(src.minQueueLength)) ? Number(src.minQueueLength) : 1,
    positionLockMs: Number.isFinite(Number(src.positionLockMs)) ? Number(src.positionLockMs) : 1000,
    aStop: { ...base.aStop, ...(src.aStop || {}) },
    messages: { ...DEFAULT_MESSAGES, ...(src.messages || {}) },
    field: { ...base.field, ...(src.field || {}) },
    knownActionIds: Array.isArray(src.knownActionIds) ? src.knownActionIds : [],
    layers: Array.isArray(src.layers) && src.layers.length ? src.layers : base.layers,
  };
  const seen = new Set<string>();
  out.layers = out.layers.map((l, i) => ({
    name: l?.name || `Layer ${i}`,
    buttons: (l?.buttons || []).map((b) => {
      let uid = b.uid && !seen.has(b.uid) ? b.uid : newUid();
      seen.add(uid);
      return {
        uid,
        id: String(b.id ?? ""),
        label: String(b.label ?? b.id ?? ""),
        type: b.type || "action",
        area: (Array.isArray(b.area) && b.area.length === 4 ? b.area.map(Number) : [1, 1, 2, 2]) as ScoutingConfig["layers"][0]["buttons"][0]["area"],
        color: b.color || "#475569",
        ...(b.textColor ? { textColor: b.textColor } : {}),
        ...(b.hint ? { hint: b.hint } : {}),
        executables: Array.isArray(b.executables) ? b.executables : [],
      };
    }),
  }));
  return out;
}

export function normalizeProject(p: Project): Project {
  const analysis = defaultAnalysis();
  return {
    ...p,
    _id: p._id ? String(p._id) : p._id,
    name: p.name || "Untitled project",
    description: p.description ?? "",
    season: p.season ?? "",
    revision: p.revision ?? 1,
    scouting: normalizeScouting(p.scouting),
    scoring: { ...{ version: 1, points: {}, suffixMatch: true }, ...(p.scoring || {}) },
    pipeline: Array.isArray(p.pipeline) ? p.pipeline : [],
    modules: Array.isArray(p.modules) ? p.modules : [],
    analysis: {
      ...analysis,
      ...(p.analysis || {}),
      tbaBreakdown: { ...analysis.tbaBreakdown, ...(p.analysis?.tbaBreakdown || {}) },
      features: { ...analysis.features, ...(p.analysis?.features || {}) },
      filterBands: p.analysis?.filterBands ?? analysis.filterBands,
      oprKeys: p.analysis?.oprKeys ?? [],
      comparePaths: p.analysis?.comparePaths ?? [],
    },
  };
}
