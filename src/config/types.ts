/**
 * SPOT configuration schema v2 — TypeScript types.
 *
 * These mirror the JSON Schemas in src/config/schema/*.schema.json. The JSON files are the
 * source of truth for validation and editor autocomplete; keep both in sync.
 * Design notes: docs/spec/20-config-schema-v2.md.
 */

// ---------------------------------------------------------------------------- match-scouting

export type ButtonType = "action" | "undo" | "none" | "match-control" | "label";

/** Row-start, column-start, row-end, column-end (CSS grid-area lines, 1-based). */
export type GridArea = [number, number, number, number];

export type Executable =
  | { type: "layer"; to: string }
  | {
      type: "conditionalLayer";
      to: string;
      always: string[];
      conditional: Record<string, Record<string, string[]>>;
    }
  | { type: "setVariable"; name: string; value: string | number | boolean }
  | { type: "position"; lockMs?: number }
  | { type: "constantPosition"; position: { x: number; y: number } }
  | { type: "exclusiveHighlight"; group: string }
  | { type: "clearHighlight" }
  | { type: "hide" }
  | { type: "multiplier"; count: number }
  /** Custom executable provided by an extension; arguments are passed through. */
  | { type: string; args?: unknown[] };

export interface Button {
  id: string;
  label?: string;
  type: ButtonType;
  gridArea: GridArea;
  /** Background color (CSS color). */
  color?: string;
  textColor?: string;
  /** Original v1 `class` string, kept for reference by the converter. */
  legacyClass?: string;
  executables: Executable[];
}

export interface Layer {
  id: string;
  name?: string;
  buttons: Button[];
}

/**
 * A period of the match selected by the clock: auto, teleop, endgame. The current phase is the
 * one with the largest `startMs` that is <= the time remaining. Phases are the unit analysis
 * filters on, which is why endgame is a phase and not a flag inside teleop.
 */
export interface Phase {
  id: string;
  label: string;
  /** Match time remaining (ms) at which this phase begins. */
  startMs: number;
  /** Layer shown when the phase begins; omit to keep the current layer. */
  layer?: string;
  /** Prefix prepended to action ids recorded during this phase ("" for none). */
  prefix: string;
  /** Hold the match clock this long when the phase begins (field-timer pause, BL-298). */
  pauseMs?: number;
  /** Sub-periods inside this phase (a transition period, then repeating shifts). */
  segments?: Segment[];
  variables?: Record<string, string | number | boolean>;
  always?: string[];
  conditional?: Record<string, Record<string, string[]>>;
}

/** A scouter-selected variant of a segment, chosen by pressing `toggleButton`. */
export interface SegmentKind {
  id: string;
  label?: string;
  /** Prefix for ids recorded in this kind; the repeat index is appended. */
  prefix: string;
  toggleButton: string;
}

/**
 * A sub-period of a phase. The active segment is the one with the largest `startMs` that is
 * <= the time remaining, within the current phase.
 *
 * Prefix precedence for a recorded action id: the selected kind's prefix plus the repeat index,
 * else the segment `prefix`, else the phase `prefix`.
 */
export interface Segment {
  id: string;
  label?: string;
  /** Match time remaining (ms) at which this segment begins. */
  startMs: number;
  /** Layer shown when the segment begins; omit to keep the current layer. */
  layer?: string;
  /** Prefix used when the segment has no kinds, or while no kind is selected. */
  prefix?: string;
  /** The segment repeats; the 1-based index is appended to the prefix. */
  repeat?: { intervalMs: number; count: number };
  kinds?: SegmentKind[];
}

export interface Lock {
  id: string;
  triggerButtons: string[];
  /** Lock stays engaged until this phase begins. */
  untilPhase: string;
  exemptTypes: ButtonType[];
  message: string;
}

export interface MatchScoutingConfig {
  $schema?: string;
  version: 2;
  timing: {
    totalMs: number;
    /** Clock-driven periods, highest `startMs` first. */
    phases: Phase[];
  };
  /** "phase": recorded id = phase/segment prefix + button id (2026); "none": raw button ids. */
  idPrefixing: "phase" | "none";
  variables: Record<string, string | number | boolean>;
  rules: {
    undo: { minQueueLength: number };
    positionLockMs: number;
    locks: Lock[];
    allianceRelativeButtons: { own: string; opposing: string }[];
    fieldMap: { image: string };
  };
  layout: {
    rows: number;
    columns: number;
    initialLayer: string;
    layers: Layer[];
  };
  /** Ids that can appear in data but are not derivable from prefixes × buttons. */
  extraActionIds: string[];
}

// ---------------------------------------------------------------------------- analysis-pipeline

export interface PipelineEntry {
  type: "tmp" | "team";
  name: string;
  outputPath: string;
  options?: Record<string, unknown>;
  comment?: string;
}

export interface AnalysisPipelineConfig {
  $schema?: string;
  version: 2;
  enrichment: {
    tba: {
      scoreBreakdown: { enabled: boolean; prefixes: string[] };
      componentOprs: string[];
    };
  };
  pipeline: PipelineEntry[];
}

// ---------------------------------------------------------------------------- analysis-modules

export interface ModuleEntry {
  view: "team" | "match";
  module: string;
  position?: "main" | "side";
  name: string;
  separate?: boolean;
  wholeMatch?: boolean;
  options: Record<string, unknown>;
}

export interface RatingBand {
  id: string;
  label: string;
  /** "exact" | "min" | "range" | "negative" */
  kind: "exact" | "min" | "range" | "negative";
  value?: number;
  min?: number;
  max?: number;
}

export interface AnalysisModulesConfig {
  $schema?: string;
  version: 2;
  modules: ModuleEntry[];
  filterTeams: { ratingBands: RatingBand[] };
}

// ---------------------------------------------------------------------------- qr

export interface QrConfig {
  $schema?: string;
  version: 2;
  /** Per-action bit layout; `id` is an index into the derived known-action-id list. */
  actionSchema: { key: "id" | "ts"; bits: number }[];
}
