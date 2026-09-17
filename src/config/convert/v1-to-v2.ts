/**
 * Convert SPOT v1 configuration files (config/v1) to the v2 schema (src/config/schema).
 *
 * The converter is deliberately conservative: it never invents behavior that the legacy client
 * did not have, it records everything it could not map as a warning, and it keeps `legacyClass`
 * on buttons so a human can check the color mapping. Design: docs/spec/20-config-schema-v2.md.
 */
import { LEGACY_CLASS_COLORS, LEGACY_HELPER_CLASSES } from "./legacy-colors";
import { deriveKnownActionIds } from "../knownActionIds";
import type {
  AnalysisModulesConfig,
  AnalysisPipelineConfig,
  Button,
  ButtonType,
  Executable,
  Layer,
  Lock,
  MatchScoutingConfig,
  ModuleEntry,
  Phase,
  PipelineEntry,
  QrConfig,
  RatingBand,
  Segment,
} from "../types";

// ---------------------------------------------------------------------------- v1 shapes (loose)

interface V1Button {
  id?: string;
  displayText?: string;
  gridArea: (string | number)[];
  class?: string;
  type: string;
  executables?: { type: string; args?: unknown[] }[];
}
interface V1Transition {
  layer: number;
  displayText?: string;
  variables?: Record<string, string | number | boolean>;
  conditional?: Record<string, Record<string, string[]>>;
  always?: string[];
}
export interface V1MatchScouting {
  timing: { totalTime: number; timeTransitions?: Record<string, V1Transition> };
  variables?: Record<string, string | number | boolean>;
  layout: { gridRows: number; gridColumns: number; layers: V1Button[][] };
}
export interface V1PipelineEntry {
  type: string;
  name: string;
  outputPath: string;
  options?: Record<string, unknown>;
  [k: string]: unknown;
}
export interface V1Module {
  view: string;
  module: string;
  position?: string;
  name: string;
  separate?: boolean;
  wholeMatch?: boolean;
  options: Record<string, unknown>;
}
export interface V1Qr {
  ACTION_SCHEMA: { key: string; bits: number }[];
}

export interface ConvertOptions {
  /**
   * Prefix recorded ids with the phase/segment (the 2026 scheme). Default: auto-detect, which
   * treats a hidden catalog layer as the sign that the legacy config used composite ids.
   */
  prefixIds?: boolean;
  /** TBA component-OPR names (v1 kept them in config.json TBA_OPR_STRINGS). */
  oprStrings?: Record<string, string> | string[];
  /** Enable TBA score-breakdown enrichment in the pipeline (default true). */
  enrichment?: boolean;
  /** Relative path used for the `$schema` property of generated files. */
  schemaBase?: string;
}

export interface ConvertResult<T> {
  config: T;
  warnings: string[];
}

// ---------------------------------------------------------------------------- helpers

export function camelCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase())
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base || "item";
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s-]/g, "");
}

// ---------------------------------------------------------------------------- match-scouting

/** 2026 client constants the v1 configs did not carry; the converter warns wherever it uses them. */
const ENDGAME_START_MS = 30000;
const SHIFT_INTERVAL_MS = 25000;
const DEFAULT_SHIFT_COUNT = 4;

const BUTTON_TYPES: ButtonType[] = ["action", "undo", "none", "match-control", "label"];

function convertExecutable(
  e: { type: string; args?: unknown[] },
  layerIds: string[],
  where: string,
  warnings: string[],
): Executable {
  const args = e.args ?? [];
  const layerRef = (n: unknown): string => {
    const idx = Number(n);
    const id = layerIds[idx];
    if (id === undefined) {
      warnings.push(`${where}: executable ${e.type} references missing layer ${String(n)}`);
      return `layer-${String(n)}`;
    }
    return id;
  };
  switch (e.type) {
    case "layer":
      return { type: "layer", to: layerRef(args[1]) };
    case "conditionalLayer":
    case "conditionalLayerUndo": // misnamed duplicate in v1
      return {
        type: "conditionalLayer",
        to: layerRef(args[1]),
        always: (args[2] as string[]) ?? [],
        conditional: (args[3] as Record<string, Record<string, string[]>>) ?? {},
      };
    case "setVariable":
      return { type: "setVariable", name: String(args[0]), value: args[1] as string };
    case "position":
      return { type: "position" };
    case "constantPosition":
      return { type: "constantPosition", position: args[0] as { x: number; y: number } };
    case "climbHighlight":
      // v1 ignored its args; semantics: exclusive highlight among all climbHighlight buttons.
      return { type: "exclusiveHighlight", group: "default" };
    case "clearHighlight":
      return { type: "clearHighlight" };
    case "hide":
      return { type: "hide" };
    case "multiplier":
      return { type: "multiplier", count: Number(args[0]) };
    case "flashBorder":
    case "example":
      warnings.push(`${where}: dropped no-op executable ${e.type}`);
      return { type: "hide" }; // never reached in practice; replaced below
    default:
      warnings.push(`${where}: unknown executable ${e.type} kept as custom`);
      return { type: e.type, args };
  }
}

function convertButton(
  b: V1Button,
  layerIds: string[],
  where: string,
  fallbackId: string,
  warnings: string[],
): Button {
  const type = (BUTTON_TYPES.includes(b.type as ButtonType) ? b.type : "action") as ButtonType;
  if (type !== b.type) warnings.push(`${where}: unknown button type "${b.type}" treated as action`);
  const gridArea = b.gridArea.map((x) => Number(x)) as [number, number, number, number];
  const classes = (b.class ?? "").split(/\s+/).filter(Boolean);
  let color: string | undefined;
  for (const c of classes) {
    if (LEGACY_CLASS_COLORS[c]) {
      color = LEGACY_CLASS_COLORS[c];
      break;
    }
  }
  for (const c of classes) {
    if (!LEGACY_CLASS_COLORS[c] && !LEGACY_HELPER_CLASSES.has(c))
      warnings.push(`${where}: unknown legacy class "${c}"`);
  }
  const executables: Executable[] = [];
  for (const e of b.executables ?? []) {
    if (e.type === "flashBorder" || e.type === "example") {
      warnings.push(`${where}: dropped no-op executable ${e.type}`);
      continue;
    }
    executables.push(convertExecutable(e, layerIds, where, warnings));
  }
  const out: Button = { id: b.id || fallbackId, type, gridArea, executables };
  if (!b.id) warnings.push(`${where}: empty id replaced with "${fallbackId}"`);
  if (b.displayText !== undefined && b.displayText !== b.id) out.label = b.displayText;
  if (color) out.color = color;
  if (b.class) out.legacyClass = b.class;
  return out;
}

/** A layer that nothing navigates to and that holds many ids is the v1 "catalog" hack. */
function findCatalogLayer(v1: V1MatchScouting): number | null {
  const layers = v1.layout.layers;
  const targeted = new Set<number>([0]);
  for (const t of Object.values(v1.timing.timeTransitions ?? {})) targeted.add(Number(t.layer));
  for (const layer of layers)
    for (const b of layer)
      for (const e of b.executables ?? []) {
        if (
          e.type === "layer" ||
          e.type === "conditionalLayer" ||
          e.type === "conditionalLayerUndo"
        )
          targeted.add(Number((e.args ?? [])[1]));
      }
  const candidates = layers
    .map((l, i) => i)
    .filter((i) => !targeted.has(i) && layers[i].length >= 20);
  return candidates.length === 1 ? candidates[0] : null;
}

export function convertMatchScouting(
  v1: V1MatchScouting,
  opts: ConvertOptions = {},
): ConvertResult<MatchScoutingConfig> {
  const warnings: string[] = [];
  const catalogIndex = findCatalogLayer(v1);
  const prefixIds = opts.prefixIds ?? catalogIndex !== null;

  // layer ids: layer-N (index preserved so executables map 1:1)
  const layerIds = v1.layout.layers.map((_, i) => `layer-${i}`);
  layerIds[0] = "layer-0";

  const layers: Layer[] = [];
  v1.layout.layers.forEach((buttons, i) => {
    if (i === catalogIndex) return;
    const layer: Layer = {
      id: layerIds[i],
      buttons: buttons.map((b, j) =>
        convertButton(
          b,
          layerIds,
          `layer ${i} button ${j} (${b.id ?? "?"})`,
          `${b.type}-${i}-${j}`,
          warnings,
        ),
      ),
    };
    layers.push(layer);
  });

  // Shift toggle buttons decide whether teleop gets segments, so find them before the phases.
  const allButtons = layers.flatMap((l) => l.buttons);
  const hasShiftButtons =
    allButtons.some((b) => b.id === "teleopActive") &&
    allButtons.some((b) => b.id === "teleopInactive");

  // v1 time transitions, largest time remaining first (the order phases occur in).
  const transitions = Object.entries(v1.timing.timeTransitions ?? {})
    .map(([ms, t]) => ({ ms: Number(ms), t, label: t.displayText ?? `Phase ${ms}` }))
    .sort((a, b) => b.ms - a.ms);
  type Transition = (typeof transitions)[number];

  const usedPhaseIds = new Set<string>();
  const prefixOf = (label: string, ms: number) =>
    prefixIds ? camelCase(label) || `phase${ms}` : "";
  const layerOf = (t: Transition) => layerIds[Number(t.t.layer)] ?? "layer-0";
  const carryOver = (phase: Phase, t: Transition) => {
    if (t.t.variables && Object.keys(t.t.variables).length) phase.variables = t.t.variables;
    if (t.t.always) phase.always = t.t.always;
    if (t.t.conditional) phase.conditional = t.t.conditional;
  };

  const simplePhase = (t: Transition): Phase => {
    const base = camelCase(t.label) || `phase${t.ms}`;
    const phase: Phase = {
      id: uniqueId(base, usedPhaseIds),
      label: t.label,
      startMs: t.ms,
      layer: layerOf(t),
      prefix: prefixOf(t.label, t.ms),
    };
    carryOver(phase, t);
    return phase;
  };

  /** "teleopTransition" inside phase "teleop" becomes segment id "transition". */
  const segmentId = (label: string, phasePrefix: string): string => {
    const base = camelCase(label);
    if (phasePrefix && base.length > phasePrefix.length && base.startsWith(phasePrefix)) {
      const rest = base.slice(phasePrefix.length);
      return rest.charAt(0).toLowerCase() + rest.slice(1);
    }
    return base;
  };

  /**
   * 2026 model: every teleop transition collapses into one `teleop` phase whose segments are the
   * transition period and then the repeating shifts, so analysis can filter on auto / teleop /
   * endgame while the recorded ids stay exactly what the v5 client produced (docs/spec/20 CS-4).
   */
  const buildTeleopPhase = (group: Transition[]): Phase => {
    const first = group[0];
    const last = group[group.length - 1];
    const prefix = prefixOf(last.label, last.ms);
    const phase: Phase = {
      id: uniqueId(prefix || "teleop", usedPhaseIds),
      label: last.label,
      startMs: first.ms,
      layer: layerOf(first),
      prefix,
      segments: [],
    };
    carryOver(phase, first);
    // every member but the last is a plain segment; the last is where the shifts begin
    for (const t of group.slice(0, -1)) {
      const segment: Segment = { id: segmentId(t.label, prefix), label: t.label, startMs: t.ms };
      if (layerOf(t) !== phase.layer) segment.layer = layerOf(t);
      segment.prefix = prefixOf(t.label, t.ms);
      phase.segments!.push(segment);
      if (t !== first && (t.t.variables || t.t.always || t.t.conditional))
        warnings.push(
          `transition "${t.label}": variables/always/conditional dropped by the merge into ${phase.id}`,
        );
    }
    const span = last.ms - ENDGAME_START_MS;
    let count = DEFAULT_SHIFT_COUNT;
    if (span > 0 && span % SHIFT_INTERVAL_MS === 0) count = span / SHIFT_INTERVAL_MS;
    else
      warnings.push(
        `shift span ${span} ms is not a whole number of ${SHIFT_INTERVAL_MS} ms shifts; count defaulted to ${count}`,
      );
    const shift: Segment = { id: "shift", label: "Shift", startMs: last.ms };
    if (layerOf(last) !== phase.layer) shift.layer = layerOf(last);
    shift.repeat = { intervalMs: SHIFT_INTERVAL_MS, count };
    shift.kinds = [
      { id: "active", label: "Active", prefix: "activeShift", toggleButton: "teleopActive" },
      {
        id: "inactive",
        label: "Inactive",
        prefix: "inactiveShift",
        toggleButton: "teleopInactive",
      },
    ];
    phase.segments!.push(shift);
    warnings.push(
      `shift timing (${count} x ${SHIFT_INTERVAL_MS / 1000} s from ${last.ms} ms) copied from the 2026 client constants; verify`,
    );
    return phase;
  };

  const teleopGroup =
    hasShiftButtons && prefixIds ? transitions.filter((t) => /teleop/i.test(t.label)) : [];
  const phases: Phase[] = [];
  for (const t of transitions) {
    if (teleopGroup.includes(t)) {
      if (t === teleopGroup[0]) phases.push(buildTeleopPhase(teleopGroup));
      continue;
    }
    phases.push(simplePhase(t));
  }
  if (phases.length === 0) {
    phases.push({ id: "match", label: "Match", startMs: v1.timing.totalTime, prefix: "" });
    warnings.push(
      "no timeTransitions found; added a single 'match' phase covering the whole match",
    );
  }
  // Endgame is its own phase (no layer change in 2026) so analysis can separate it from teleop.
  if (prefixIds && !phases.some((p) => p.startMs === ENDGAME_START_MS)) {
    phases.push({
      id: uniqueId("endgame", usedPhaseIds),
      label: "Endgame",
      startMs: ENDGAME_START_MS,
      prefix: "endgame",
    });
    warnings.push(
      `added an 'endgame' phase at ${ENDGAME_START_MS} ms with no layer change (2026 client constant); verify`,
    );
  }

  // variables and undo guard
  const variables = { ...(v1.variables ?? {}) };
  let minQueueLength = 1;
  if (typeof variables.minOfQueueLength === "number") {
    minQueueLength = variables.minOfQueueLength;
    delete variables.minOfQueueLength;
  } else {
    warnings.push("variables.minOfQueueLength missing; undo guard defaults to 1");
  }

  const timing: MatchScoutingConfig["timing"] = { totalMs: v1.timing.totalTime, phases };
  if (v1.timing.totalTime < 10000)
    warnings.push(
      `timing.totalTime=${v1.timing.totalTime} looks like seconds; v2 requires milliseconds`,
    );

  // locks: A-Stop buttons lock everything but undo/match-control until the phase after auto
  const locks: Lock[] = [];
  const aStopIds = [
    ...new Set(
      allButtons
        .filter((b) => normalize(`${b.label ?? ""} ${b.id}`).includes("astop"))
        .map((b) => b.id),
    ),
  ];
  if (aStopIds.length) {
    const untilPhase = phases[1]?.id ?? phases[0]?.id ?? "";
    locks.push({
      id: "aStop",
      triggerButtons: aStopIds,
      untilPhase,
      exemptTypes: ["undo", "match-control"],
      message:
        "You pressed the A-Stop button, all the buttons will be disabled until Auto ends. If this is a mistake then press the Undo button",
    });
  }

  const allianceRelativeButtons: { own: string; opposing: string }[] = [];
  if (allButtons.some((b) => b.id === "AZone") && allButtons.some((b) => b.id === "OAZone")) {
    allianceRelativeButtons.push({ own: "AZone", opposing: "OAZone" });
  }

  const config: MatchScoutingConfig = {
    $schema: `${opts.schemaBase ?? "../src/config/schema"}/match-scouting.schema.json`,
    version: 2,
    timing,
    variables,
    rules: {
      undo: { minQueueLength },
      positionLockMs: 1000,
      locks,
      allianceRelativeButtons,
      fieldMap: { image: "/img/field.svg" },
    },
    layout: {
      rows: v1.layout.gridRows,
      columns: v1.layout.gridColumns,
      initialLayer: "layer-0",
      layers,
    },
    extraActionIds: [],
  };

  // ids from the catalog layer that the derivation cannot explain become extraActionIds
  if (catalogIndex !== null) {
    const derived = new Set(deriveKnownActionIds(config));
    const catalogIds = [...new Set(v1.layout.layers[catalogIndex].map((b) => b.id ?? ""))];
    config.extraActionIds = catalogIds.filter((id) => !derived.has(id)).sort();
    warnings.push(
      `removed catalog layer ${catalogIndex} (${catalogIds.length} ids); ${config.extraActionIds.length} not derivable kept as extraActionIds: ${config.extraActionIds.join(", ")}`,
    );
  }

  return { config, warnings };
}

// ---------------------------------------------------------------------------- analysis-pipeline

export function convertAnalysisPipeline(
  v1: V1PipelineEntry[],
  opts: ConvertOptions = {},
): ConvertResult<AnalysisPipelineConfig> {
  const warnings: string[] = [];
  const pipeline: PipelineEntry[] = v1.map((e, i) => {
    const where = `pipeline[${i}] ${e.type}/${e.name} -> ${e.outputPath}`;
    let name = e.name;
    const options: Record<string, unknown> = { ...(e.options ?? {}) };
    if (name === "finalActionOccurence") {
      name = "finalActionOccurrence";
      warnings.push(`${where}: renamed misspelled transformer to finalActionOccurrence`);
    }
    if (name === "cycle") {
      if ("pickups" in options) {
        options.startAction = options.pickups;
        delete options.pickups;
      }
      if ("scores" in options) {
        options.endAction = options.scores;
        delete options.scores;
      }
      if ("pickups" in (e.options ?? {}) || "scores" in (e.options ?? {}))
        warnings.push(`${where}: cycle options renamed pickups/scores -> startAction/endAction`);
    }
    if (name === "actionTime" && "path" in options && !("actionId" in options)) {
      options.actionId = options.path;
      delete options.path;
      warnings.push(`${where}: actionTime option "path" renamed to "actionId"`);
    }
    for (const k of Object.keys(e)) {
      if (!["type", "name", "outputPath", "options"].includes(k)) {
        options[k] = e[k];
        warnings.push(`${where}: top-level "${k}" moved into options (v1 ignored it there)`);
      }
    }
    const out: PipelineEntry = { type: e.type as "tmp" | "team", name, outputPath: e.outputPath };
    if (
      Object.keys(options).length ||
      !["removeDuplicates", "countMatches", "actionTimeFilter"].includes(name)
    )
      out.options = options;
    return out;
  });

  const oprs = Array.isArray(opts.oprStrings)
    ? opts.oprStrings
    : Object.values(opts.oprStrings ?? {});
  const config: AnalysisPipelineConfig = {
    $schema: `${opts.schemaBase ?? "../src/config/schema"}/analysis-pipeline.schema.json`,
    version: 2,
    enrichment: {
      tba: {
        scoreBreakdown: { enabled: opts.enrichment ?? true, prefixes: ["auto", "endGame"] },
        componentOprs: oprs.filter(Boolean),
      },
    },
    pipeline,
  };
  return { config, warnings };
}

// ---------------------------------------------------------------------------- analysis-modules

/** Filter Teams bands hard-coded in the v5 client (docs/spec/08 AN-19/AN-21). */
export const DEFAULT_RATING_BANDS: RatingBand[] = [
  { id: "Rating4", label: "Rating4", kind: "exact", value: 4 },
  { id: "Rating3", label: "Rating3", kind: "min", value: 3 },
  { id: "Rating2", label: "Rating2", kind: "min", value: 2 },
  { id: "Rating1", label: "Rating1", kind: "min", value: 1 },
  { id: "eliteOPR", label: "Elite OPR (250+)", kind: "min", value: 250 },
  { id: "strongOPR", label: "Strong OPR (151-250)", kind: "range", min: 151, max: 250 },
  { id: "decentOPR", label: "Decent OPR (101-150)", kind: "range", min: 101, max: 150 },
  { id: "lowOPR", label: "Low OPR (0-100)", kind: "range", min: 0, max: 100 },
  { id: "negativeOPR", label: "Negative OPR", kind: "negative" },
];

export function convertAnalysisModules(
  v1: V1Module[],
  opts: ConvertOptions = {},
): ConvertResult<AnalysisModulesConfig> {
  const warnings: string[] = [];
  const modules: ModuleEntry[] = v1.map((m, i) => {
    const out: ModuleEntry = {
      view: m.view as "team" | "match",
      module: m.module,
      name: m.name,
      options: { ...m.options },
    };
    if (m.position === "main" || m.position === "side") out.position = m.position;
    if (m.separate !== undefined) out.separate = m.separate;
    if (m.wholeMatch !== undefined) out.wholeMatch = m.wholeMatch;
    if (m.module === "HeatmapScatterPlot") {
      const img = String(m.options.imgPath ?? "");
      out.options.coordinateTransform = img.includes("half-field") ? "foldHalfField" : "none";
      warnings.push(
        `modules[${i}] HeatmapScatterPlot: coordinateTransform set to ${out.options.coordinateTransform} (from imgPath)`,
      );
    }
    return out;
  });
  const config: AnalysisModulesConfig = {
    $schema: `${opts.schemaBase ?? "../src/config/schema"}/analysis-modules.schema.json`,
    version: 2,
    modules,
    filterTeams: { ratingBands: DEFAULT_RATING_BANDS },
  };
  return { config, warnings };
}

// ---------------------------------------------------------------------------- qr

export function convertQr(v1: V1Qr, opts: ConvertOptions = {}): ConvertResult<QrConfig> {
  const warnings: string[] = [];
  const actionSchema = v1.ACTION_SCHEMA.map((f) => {
    if (f.key === "id" && f.bits < 16) {
      warnings.push(
        `qr: id bits raised from ${f.bits} to 16 (ids are now an index into the derived known-action-id list)`,
      );
      return { key: "id" as const, bits: 16 };
    }
    return { key: f.key as "id" | "ts", bits: f.bits };
  });
  return {
    config: {
      $schema: `${opts.schemaBase ?? "../src/config/schema"}/qr.schema.json`,
      version: 2,
      actionSchema,
    },
    warnings,
  };
}
