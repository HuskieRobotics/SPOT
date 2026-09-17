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
  /** Force id prefixing mode; default: auto-detect (catalog layer present → "phase"). */
  idPrefixing?: "phase" | "none";
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
  const idPrefixing = opts.idPrefixing ?? (catalogIndex !== null ? "phase" : "none");

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

  // phases from transitions, sorted by start time descending
  const usedPhaseIds = new Set<string>();
  const phases: Phase[] = Object.entries(v1.timing.timeTransitions ?? {})
    .map(([ms, t]) => ({ ms: Number(ms), t }))
    .sort((a, b) => b.ms - a.ms)
    .map(({ ms, t }) => {
      const label = t.displayText ?? `Phase ${ms}`;
      const base = camelCase(label) || `phase${ms}`;
      const phase: Phase = {
        id: uniqueId(base, usedPhaseIds),
        label,
        startMs: ms,
        layer: layerIds[Number(t.layer)] ?? "layer-0",
        prefix: idPrefixing === "phase" ? base : "",
      };
      if (t.variables && Object.keys(t.variables).length) phase.variables = t.variables;
      if (t.always) phase.always = t.always;
      if (t.conditional) phase.conditional = t.conditional;
      return phase;
    });
  if (phases.length === 0) {
    phases.push({ id: "match", label: "Match", startMs: v1.timing.totalTime, prefix: "" });
    warnings.push(
      "no timeTransitions found; added a single 'match' phase covering the whole match",
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

  // 2026-style shift and endgame models (only meaningful with phase prefixing)
  const allButtons = layers.flatMap((l) => l.buttons);
  const hasShiftButtons =
    allButtons.some((b) => b.id === "teleopActive") &&
    allButtons.some((b) => b.id === "teleopInactive");
  const timing: MatchScoutingConfig["timing"] = { totalMs: v1.timing.totalTime, phases };
  if (idPrefixing === "phase") {
    const teleopPhases = phases
      .filter((p) => p.label.toLowerCase().includes("teleop"))
      .map((p) => p.startMs)
      .sort((a, b) => a - b);
    const teleopStart = teleopPhases[0] ?? 130000;
    timing.endgame = { startMs: 30000, prefix: "endgame", label: "Endgame" };
    if (hasShiftButtons) {
      timing.shifts = {
        intervalMs: 25000,
        startMs: teleopStart,
        endMs: 30000,
        maxIndex: 4,
        kinds: [
          { id: "active", prefix: "activeShift", toggleButton: "teleopActive" },
          { id: "inactive", prefix: "inactiveShift", toggleButton: "teleopInactive" },
        ],
      };
    }
    warnings.push(
      "shift/endgame timing (25 s shifts, endgame at 30 s) copied from the 2026 client constants; verify",
    );
  }
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
    idPrefixing,
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
