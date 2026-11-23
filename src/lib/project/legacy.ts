/**
 * Import legacy (SPOT v1–v5) configuration files into a v6 project.
 * Every past season's match-scouting.json converts without manual edits.
 */
import type { Executable, ExecutableType, GridArea, ModuleConfig, Phase, PipelineStep, ProjectInput, ScoutButton, ScoutingConfig } from "../types";
import { DEFAULT_MESSAGES, TYPE_DEFAULT_COLORS, defaultAnalysis, blankScouting } from "./defaults";

const LEGACY_CLASS_COLORS: Record<string, string> = {
  silver: "#919191",
  green: "#4caf50",
  orange: "#ef6c00",
  sherbert: "#ffa347",
  red: "#ff4436",
  navy: "#3f51b5",
  pink: "#f06292",
  yellow: "#d8c24f",
  bluegreen: "#0babab",
  lightbluegreen: "#56b8b8",
  darkbluegreen: "#077777",
  lightCoral: "#ff69b4",
  coral: "#ff1493",
  darkCoral: "#c71585",
  deepBlue: "#001f3f",
  shallowBlue: "#2063b1",
  highlight: "#2f5f77",
  fuel2026: "#e6bd39",
  blue2026: "#5a929e",
  lightblue2026: "#66be8c",
  orange2026: "#e65217",
  gray: "#707070",
  "rating-lowest": "#ff4545",
  "rating-second-lowest": "#ffa941",
  "rating-second-highest": "#a1c326",
  "rating-highest": "#00b844",
};

const KNOWN_EXECUTABLES: ExecutableType[] = ["layer", "conditionalLayer", "setVariable", "position", "constantPosition", "climbHighlight", "clearHighlight", "hide", "multiplier"];

function parseArea(a: unknown): GridArea {
  const parts = (Array.isArray(a) ? a : String(a ?? "").split("/")).map((x) => Number(String(x).trim()));
  const [r1 = 1, c1 = 1, r2 = r1 + 1, c2 = c1 + 1] = parts.map((n) => (Number.isFinite(n) && n > 0 ? n : NaN)) as number[];
  const safe = (n: number, d: number) => (Number.isFinite(n) ? n : d);
  return [safe(r1, 1), safe(c1, 1), safe(r2, safe(r1, 1) + 1), safe(c2, safe(c1, 1) + 1)];
}

function colorFor(cls: string | undefined, type: ScoutButton["type"]): string {
  for (const c of String(cls || "").split(/\s+/)) if (LEGACY_CLASS_COLORS[c]) return LEGACY_CLASS_COLORS[c];
  return TYPE_DEFAULT_COLORS[type] ?? TYPE_DEFAULT_COLORS.action;
}

function convertExecutables(list: unknown): Executable[] {
  const out: Executable[] = [];
  for (const e of Array.isArray(list) ? list : []) {
    const type = e?.type === "conditionalLayerUndo" ? "conditionalLayer" : e?.type;
    if (KNOWN_EXECUTABLES.includes(type)) out.push({ type, args: Array.isArray(e.args) ? e.args : [] });
  }
  return out;
}

interface LegacyMatchScouting {
  timing?: { totalTime?: number; timeTransitions?: Record<string, any> };
  variables?: Record<string, any>;
  layout?: { gridRows?: number; gridColumns?: number; layers?: any[][] };
}

export function convertLegacyScouting(legacy: LegacyMatchScouting): ScoutingConfig {
  const base = blankScouting();
  const layersIn = legacy.layout?.layers ?? [];
  let totalTime = Number(legacy.timing?.totalTime ?? 150000);
  // Very old templates expressed time in seconds.
  const secondsMode = totalTime > 0 && totalTime < 1000;
  if (secondsMode) totalTime *= 1000;

  const phases: Phase[] = Object.entries(legacy.timing?.timeTransitions ?? {})
    .map(([at, t]: [string, any]) => ({
      at: Number(at) * (secondsMode ? 1000 : 1),
      label: String(t.displayText ?? ""),
      layer: Number.isFinite(Number(t.layer)) ? Number(t.layer) : -1,
      ...(t.variables && Object.keys(t.variables).length ? { variables: t.variables } : {}),
      ...(t.conditional && Object.keys(t.conditional).length ? { conditional: t.conditional } : {}),
      ...(Array.isArray(t.always) && t.always.length ? { always: t.always } : {}),
    }))
    .sort((a, b) => b.at - a.at);

  // Which layers can actually be reached? (Unreachable trailing layers were id catalogs.)
  const reachable = new Set<number>([0, ...phases.map((p) => p.layer)]);
  for (const layer of layersIn) for (const b of layer || []) for (const e of b.executables || []) if (/layer/i.test(e.type) && e.args?.length > 1) reachable.add(Number(e.args[1]));
  let keep = layersIn.length;
  while (keep > 1 && !reachable.has(keep - 1)) keep--;
  const catalogIds: string[] = [];
  for (const layer of layersIn.slice(keep)) for (const b of layer || []) if (b?.id && !catalogIds.includes(b.id)) catalogIds.push(b.id);

  const layers = layersIn.slice(0, keep).map((layer, li) => ({
    name: phases.find((p) => p.layer === li)?.label || (li === 0 ? "Pre-match" : `Layer ${li}`),
    buttons: (layer || []).map((b: any, bi: number): ScoutButton => {
      const type: ScoutButton["type"] = ["action", "undo", "none", "match-control", "label"].includes(b.type) ? b.type : "action";
      return {
        uid: `L${li}B${bi}`,
        id: String(b.id ?? ""),
        label: String(b.displayText ?? b.id ?? ""),
        type,
        area: parseArea(b.gridArea),
        color: colorFor(b.class, type),
        executables: convertExecutables(b.executables),
      };
    }),
  }));

  const allButtons = layers.flatMap((l) => l.buttons);
  const ids = new Set(allButtons.map((b) => b.id));
  const hasShifts = ids.has("teleopActive") && ids.has("teleopInactive");
  const teleopAt = phases.filter((p) => p.label.toLowerCase().includes("teleop")).map((p) => p.at).sort((a, b) => a - b)[0] ?? 130000;
  const hasAStop = allButtons.some((b) => `${b.label}${b.id}`.toLowerCase().replace(/[\s-]/g, "").includes("astop"));

  // Name the layers a phase does not name, from the button that leads to them.
  layers.forEach((l, li) => {
    if (!l.name.startsWith("Layer ")) return;
    const opener = allButtons.find((b) => b.executables.some((e) => /layer/i.test(e.type) && Number(e.args[1]) === li) && b.type !== "undo" && b.type !== "match-control");
    if (opener) l.name = `${opener.label.split("\n")[0]} (${li})`;
  });

  const { minOfQueueLength, ...variables } = legacy.variables ?? {};
  return {
    ...base,
    grid: { rows: Number(legacy.layout?.gridRows) || 6, columns: Number(legacy.layout?.gridColumns) || 6 },
    totalTime,
    phases,
    shifts: { ...base.shifts, enabled: hasShifts, startsAt: teleopAt },
    prefixActionIds: hasShifts,
    variables,
    minQueueLength: Number.isFinite(Number(minOfQueueLength)) ? Number(minOfQueueLength) : 1,
    aStop: { ...base.aStop, enabled: hasAStop },
    messages: { ...DEFAULT_MESSAGES },
    field: { image: "/img/field.svg", zoneButtons: ids.has("AZone") && ids.has("OAZone") ? ["AZone", "OAZone"] : null },
    knownActionIds: catalogIds,
    layers,
  };
}

/** Collect every opr.<name> referenced by the modules so imported projects attach those OPRs. */
export function oprKeysFromModules(modules: ModuleConfig[]): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      const m = v.match(/^opr\.(.+)$/);
      if (m) found.add(m[1]);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(modules);
  return [...found];
}

/** Rename pre-2026 option names (cycle pickups/scores → startAction/endAction; typo'd names). */
export function upgradeStep(step: PipelineStep): PipelineStep {
  const s: PipelineStep = structuredClone(step);
  if (s.name === "finalActionOccurence") s.name = "finalActionOccurrence";
  if (s.name === "cycle" && s.options) {
    const o = s.options as Record<string, unknown>;
    if (o.pickups && !o.startAction) o.startAction = o.pickups;
    if (o.scores && !o.endAction) o.endAction = o.scores;
    delete o.pickups;
    delete o.scores;
  }
  return s;
}

export interface LegacyBundle {
  name: string;
  season: string;
  description?: string;
  matchScouting: LegacyMatchScouting;
  pipeline?: PipelineStep[];
  modules?: ModuleConfig[];
  scoring?: { version?: number; actions?: Record<string, number>; notes?: unknown } | null;
  tbaBreakdown?: boolean;
  features?: Partial<ProjectInput["analysis"]["features"]>;
}

export function projectFromLegacy(b: LegacyBundle): ProjectInput {
  const scouting = convertLegacyScouting(b.matchScouting);
  const modules = (Array.isArray(b.modules) ? b.modules : [])
    // BubbleSheetGraph was an empty placeholder; Compare Teams replaces it.
    .filter((m) => m.module !== "BubbleSheetGraph")
    .map((m) =>
      // The 2026 heatmap folded positions onto a half field in code; it is now an explicit option.
      m.module === "HeatmapScatterPlot" && String(m.options?.imgPath ?? "").includes("half-field") ? { ...m, options: { ...m.options, halfField: true } } : m,
    );
  const analysis = defaultAnalysis();
  analysis.oprKeys = oprKeysFromModules(modules);
  analysis.tbaBreakdown.enabled = !!b.tbaBreakdown;
  Object.assign(analysis.features, b.features || {});
  return {
    name: b.name,
    description: b.description ?? "",
    season: b.season,
    scouting,
    scoring: {
      version: Number(b.scoring?.version) || 1,
      points: Object.fromEntries(Object.entries(b.scoring?.actions ?? {}).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])),
      suffixMatch: true,
      notes: typeof b.scoring?.notes === "string" ? b.scoring.notes : b.scoring?.notes ? JSON.stringify(b.scoring.notes) : undefined,
    },
    pipeline: Array.isArray(b.pipeline) ? b.pipeline.map(upgradeStep) : [],
    modules,
    analysis,
  };
}
