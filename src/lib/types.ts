/**
 * SPOT v6 shared types.
 *
 * Everything a team configures lives in a Project. A project is plain JSON so it can be
 * exported, shared between teams, and edited by hand, but every field is also editable from
 * the admin builder UI without writing code.
 */

// ---------------------------------------------------------------- match scouting

export type ButtonType = "action" | "undo" | "none" | "match-control" | "label";

/** Grid placement: 1-based, end lines exclusive (same as CSS grid-area). */
export type GridArea = [rowStart: number, colStart: number, rowEnd: number, colEnd: number];

export type ExecutableType =
  | "layer"
  | "conditionalLayer"
  | "setVariable"
  | "position"
  | "constantPosition"
  | "climbHighlight"
  | "clearHighlight"
  | "hide"
  | "multiplier";

export interface Executable {
  type: ExecutableType;
  /** Same argument shapes as legacy match-scouting.json so old configs import unchanged. */
  args: unknown[];
}

export interface ScoutButton {
  /** Stable editor key (not recorded in data). */
  uid: string;
  /** Action id recorded in the action queue (before any phase prefix). */
  id: string;
  label: string;
  type: ButtonType;
  area: GridArea;
  /** Background color (any CSS color). */
  color: string;
  /** Optional text color; defaults to automatic contrast. */
  textColor?: string;
  /** Optional smaller hint line shown under the label. */
  hint?: string;
  executables: Executable[];
}

export interface Layer {
  name: string;
  buttons: ScoutButton[];
}

export type VariableValue = string | number | boolean;

/** A point on the match clock where the phase, layer, and/or variables change. */
export interface Phase {
  /** Milliseconds REMAINING on the clock when this phase begins (counts down). */
  at: number;
  /** Shown on the timer, and (when prefixActionIds is on) used as the action-id prefix. */
  label: string;
  /** Layer index to show when the phase begins; -1 keeps the current layer. */
  layer: number;
  /** Variables to set when the phase begins. */
  variables?: Record<string, VariableValue>;
  /** Conditional rendering of the target layer: {variable: {value: [buttonIds]}}. */
  conditional?: Record<string, Record<string, string[]>>;
  /** Buttons always shown when conditional rendering is used. */
  always?: string[];
  /** Freeze the clock for this many ms when the phase begins (field-timer pause). */
  holdMs?: number;
}

/** Alternating active/inactive periods (2026 REBUILT hub shifts). */
export interface ShiftConfig {
  enabled: boolean;
  /** Button ids (type "none") that start the active / inactive cycle. */
  activeButtonId: string;
  inactiveButtonId: string;
  /** Clock time (ms remaining) at/after which shifts apply. */
  startsAt: number;
  /** Clock time (ms remaining) at/below which `endLabel` applies instead. */
  endsAt: number;
  /** Length of each shift in ms of match time. */
  interval: number;
  activeLabel: string;
  inactiveLabel: string;
  endLabel: string;
}

export interface AStopConfig {
  enabled: boolean;
  /** Button ids that engage the lock. Empty = any button whose id/label contains "astop". */
  buttonIds: string[];
  /** Lock lasts while clock > this value (ms remaining). null = end of the first phase. */
  until: number | null;
  message: string;
}

export interface TimerMessages {
  start: string;
  /** Running label. Tokens: {time} seconds remaining, {phase} current phase label. */
  running: string;
  complete: string;
  submit: string;
  submitting: string;
  hold: string;
}

export interface ScoutingConfig {
  version: 2;
  grid: { rows: number; columns: number };
  totalTime: number;
  phases: Phase[];
  shifts: ShiftConfig;
  /** Record `<camelCase(phase)><buttonId>` instead of the bare button id (2026 style). */
  prefixActionIds: boolean;
  variables: Record<string, VariableValue>;
  /** Undo is allowed only when the queue holds more than this many actions (incl. the temp start). */
  minQueueLength: number;
  /** Re-use the last tapped field position for this long (ms) instead of asking again. */
  positionLockMs: number;
  aStop: AStopConfig;
  messages: TimerMessages;
  field: {
    image: string;
    /** Saved field map (Field map tab) this image came from, if any. */
    mapId?: string | null;
    /** Ids of the two alliance-zone buttons that swap with field orientation / alliance. */
    zoneButtons: [string, string] | null;
  };
  /** Allow a guarded 2x clock for re-scouting from video. */
  allowFastClock: boolean;
  /** Extra ids the analysis should know about (e.g. TBA synthetic ids). */
  knownActionIds: string[];
  layers: Layer[];
}

// ---------------------------------------------------------------- scoring / accuracy

export interface ScoringConfig {
  /** Bump when point values change; stored with each match for reproducibility. */
  version: number;
  /** Action id (or suffix) → points. Exact id wins, then the longest matching suffix. */
  points: Record<string, number>;
  /** Match ids by suffix so "StartShooting" also scores "autoStartShooting". */
  suffixMatch: boolean;
  notes?: string;
}

// ---------------------------------------------------------------- analysis

export type TransformerType = "tmp" | "team";

export interface PipelineStep {
  type: TransformerType;
  name: string;
  outputPath: string;
  options?: Record<string, unknown>;
  /** Builder-only metadata. */
  comment?: string;
  disabled?: boolean;
}

export type ModuleView = "team" | "match";

export interface ModuleConfig {
  view: ModuleView;
  module: string;
  position?: "main" | "side";
  name: string;
  separate?: boolean;
  wholeMatch?: boolean;
  options: Record<string, unknown>;
  disabled?: boolean;
}

export interface FilterBand {
  label: string;
  /** "average" checks averageScores values, "opr" checks opr values, "any" checks both. */
  source: "average" | "opr" | "any";
  min: number | null;
  max: number | null;
}

export interface AnalysisSettings {
  /** Append TBA score-breakdown keys as synthetic actions (2026 enrichment). */
  tbaBreakdown: { enabled: boolean; prefixes: string[] };
  /** TBA component-OPR names attached to teams as opr.<name>. */
  oprKeys: string[];
  filterBands: FilterBand[];
  features: {
    compare: boolean;
    filter: boolean;
    simulateMatch: boolean;
    pickList: boolean;
  };
  /** Paths offered on the Compare scatter (defaults to every averageScores/opr key). */
  comparePaths: string[];
}

// ---------------------------------------------------------------- project

export interface Project {
  _id: string;
  name: string;
  description: string;
  season: string;
  revision: number;
  scouting: ScoutingConfig;
  scoring: ScoringConfig;
  pipeline: PipelineStep[];
  modules: ModuleConfig[];
  analysis: AnalysisSettings;
  createdAt: string;
  updatedAt: string;
}

export type ProjectInput = Omit<Project, "_id" | "revision" | "createdAt" | "updatedAt">;

// ---------------------------------------------------------------- data

export interface Action {
  id: string;
  ts: number;
  other?: { pos?: { x: number; y: number }; [k: string]: unknown };
}

export interface TeamMatchPerformance {
  _id?: string;
  timestamp: number;
  clientVersion: string;
  scouterId: string;
  robotNumber: number;
  matchNumber: number;
  matchKey?: string | null;
  eventNumber: string;
  projectId?: string;
  projectRevision?: number;
  matchId: string;
  matchId_rand: string;
  scoringVersion?: number;
  scoringRules?: Record<string, number>;
  flagged: boolean;
  flagReason?: string;
  notes?: string;
  actionQueue: Action[];
  manual?: boolean;
  [derived: string]: unknown;
}

export interface Match {
  number: number;
  match_string: string;
  robots: { red: string[]; blue: string[] };
}

export interface EventDoc {
  _id: string;
  code: string;
}

export enum ScouterStatus {
  NEW = 0,
  WAITING = 1,
  SCOUTING = 2,
  COMPLETE = 3,
  DISCONNECTED_BY_ADMIN = 4,
}

export interface ScouterState {
  sessionId: string;
  scouterId: string;
  status: ScouterStatus;
  matchNumber: number | null;
  robotNumber: string | null;
  connected: boolean;
  lastSeen: number;
  /** Bumped each time the server tells the client to open the match. */
  enterSeq: number;
}

export interface Settings {
  activeProjectId: string | null;
  activeEventId: string | null;
  tbaEventKey: string;
  swapZones: boolean;
  /** "auto": enter when every robot has a waiting scouter; "admin": only on admin start. */
  startRule: "auto" | "admin";
  clientVersion: string;
}

export interface Dataset {
  tmps: TeamMatchPerformance[];
  teams: Record<string, Record<string, unknown>>;
}

/** A saved field map image (library shared by every project). */
export interface FieldMapDto {
  _id: string;
  name: string;
  kind: "file" | "url" | "upload";
  /** What the browser loads: a /path in public/, an http(s) URL, or /api/field-maps/<id>/image. */
  src: string;
  builtin?: boolean;
  createdAt?: string;
}

export interface CodebaseMapFile {
  path: string;
  name: string;
  builtin: boolean;
}
