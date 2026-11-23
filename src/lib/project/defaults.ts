import type { AnalysisSettings, FilterBand, ProjectInput, ScoutButton, ScoutingConfig, TimerMessages } from "../types";

export const DEFAULT_MESSAGES: TimerMessages = {
  start: "Start Match",
  running: "{time} | {phase}",
  complete: "Match Complete",
  submit: "Submit Match",
  submitting: "Submitting Data...",
  hold: "Hold",
};

export const DEFAULT_FILTER_BANDS: FilterBand[] = [
  { label: "Rating 4", source: "average", min: 4, max: 4 },
  { label: "Rating 3+", source: "average", min: 3, max: null },
  { label: "Rating 2+", source: "average", min: 2, max: null },
  { label: "Rating 1+", source: "average", min: 1, max: null },
  { label: "Elite OPR (250+)", source: "opr", min: 250, max: null },
  { label: "Strong OPR (151-250)", source: "opr", min: 151, max: 250 },
  { label: "Decent OPR (101-150)", source: "opr", min: 101, max: 150 },
  { label: "Low OPR (0-100)", source: "opr", min: 0, max: 100 },
  { label: "Negative OPR", source: "opr", min: null, max: -0.000001 },
];

export const defaultAnalysis = (): AnalysisSettings => ({
  tbaBreakdown: { enabled: false, prefixes: ["auto", "endGame"] },
  oprKeys: [],
  filterBands: structuredClone(DEFAULT_FILTER_BANDS),
  features: { compare: true, filter: true, simulateMatch: true, pickList: true },
  comparePaths: [],
});

/** Named palette offered in the builder (includes every legacy SPOT button color). */
export const PALETTE: { name: string; color: string }[] = [
  { name: "Blue", color: "#2563eb" },
  { name: "Sky", color: "#30a2ff" },
  { name: "Navy", color: "#3f51b5" },
  { name: "Shallow blue", color: "#2063b1" },
  { name: "Deep blue", color: "#001f3f" },
  { name: "Teal", color: "#0babab" },
  { name: "Light teal", color: "#56b8b8" },
  { name: "Dark teal", color: "#077777" },
  { name: "Green", color: "#4caf50" },
  { name: "Mint", color: "#66be8c" },
  { name: "Yellow", color: "#d8c24f" },
  { name: "Fuel", color: "#e6bd39" },
  { name: "Sherbert", color: "#ffa347" },
  { name: "Orange", color: "#ef6c00" },
  { name: "Burnt orange", color: "#e65217" },
  { name: "Red", color: "#ff4436" },
  { name: "Pink", color: "#f06292" },
  { name: "Hot pink", color: "#ff69b4" },
  { name: "Coral", color: "#ff1493" },
  { name: "Plum", color: "#c71585" },
  { name: "Slate", color: "#5a929e" },
  { name: "Silver", color: "#919191" },
  { name: "Gray", color: "#707070" },
  { name: "Charcoal", color: "#374151" },
  { name: "Rating 1", color: "#ff4545" },
  { name: "Rating 2", color: "#ffa941" },
  { name: "Rating 3", color: "#a1c326" },
  { name: "Rating 4", color: "#00b844" },
];

export const TYPE_DEFAULT_COLORS: Record<ScoutButton["type"], string> = {
  action: "#475569",
  undo: "#b91c1c",
  "match-control": "#2563eb",
  none: "#7c3aed",
  label: "transparent",
};

let uidCounter = 0;
export const newUid = () => `b${Date.now().toString(36)}${(uidCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function blankScouting(): ScoutingConfig {
  const control = (layer: number): ScoutButton => ({
    uid: newUid(),
    id: "startGame",
    label: "Start Match",
    type: "match-control",
    area: [1, 1, 2, 7],
    color: TYPE_DEFAULT_COLORS["match-control"],
    executables: layer === 0 ? [{ type: "layer", args: [0, 1] }] : [],
  });
  return {
    version: 2,
    grid: { rows: 6, columns: 6 },
    totalTime: 150000,
    phases: [
      { at: 149999, label: "Auto", layer: 1 },
      { at: 135000, label: "Teleop", layer: 2 },
    ],
    shifts: {
      enabled: false,
      activeButtonId: "teleopActive",
      inactiveButtonId: "teleopInactive",
      startsAt: 130000,
      endsAt: 30000,
      interval: 25000,
      activeLabel: "Active Shift",
      inactiveLabel: "Inactive Shift",
      endLabel: "Endgame",
    },
    prefixActionIds: false,
    variables: {},
    minQueueLength: 1,
    positionLockMs: 1000,
    aStop: { enabled: false, buttonIds: [], until: null, message: "You pressed A-Stop. All buttons are disabled until Auto ends. Press Undo if this was a mistake." },
    messages: { ...DEFAULT_MESSAGES },
    field: { image: "/img/field.svg", zoneButtons: null },
    allowFastClock: true,
    knownActionIds: [],
    layers: [
      { name: "Pre-match", buttons: [control(0)] },
      {
        name: "Auto",
        buttons: [
          control(1),
          { uid: newUid(), id: "undo", label: "Undo", type: "undo", area: [6, 1, 7, 3], color: TYPE_DEFAULT_COLORS.undo, executables: [] },
          { uid: newUid(), id: "autoScore", label: "Score", type: "action", area: [2, 1, 6, 4], color: "#4caf50", executables: [] },
          { uid: newUid(), id: "autoMiss", label: "Miss", type: "action", area: [2, 4, 6, 7], color: "#ff4436", executables: [] },
        ],
      },
      {
        name: "Teleop",
        buttons: [
          control(2),
          { uid: newUid(), id: "undo", label: "Undo", type: "undo", area: [6, 1, 7, 3], color: TYPE_DEFAULT_COLORS.undo, executables: [] },
          { uid: newUid(), id: "teleopScore", label: "Score", type: "action", area: [2, 1, 6, 4], color: "#4caf50", executables: [] },
          { uid: newUid(), id: "teleopMiss", label: "Miss", type: "action", area: [2, 4, 6, 7], color: "#ff4436", executables: [] },
        ],
      },
    ],
  };
}

export function blankProject(name = "New project"): ProjectInput {
  return {
    name,
    description: "",
    season: String(new Date().getFullYear()),
    scouting: blankScouting(),
    scoring: { version: 1, points: { autoScore: 4, teleopScore: 2 }, suffixMatch: true },
    pipeline: [
      { type: "tmp", name: "removeDuplicates", outputPath: "matches" },
      { type: "tmp", name: "countActions", outputPath: "counts", options: { all: true } },
      { type: "tmp", name: "points", outputPath: "scores.total", options: {} },
      { type: "team", name: "countActions", outputPath: "counts", options: { all: true } },
      { type: "team", name: "average", outputPath: "averages", options: { path: "counts" } },
      { type: "team", name: "average", outputPath: "averageScores", options: { path: "scores" } },
      { type: "team", name: "standardDeviation", outputPath: "standardDeviation", options: { path: "scores.total" } },
    ],
    modules: [
      {
        view: "team",
        module: "Stats",
        position: "side",
        name: "Team Stats",
        options: {
          list: [
            { name: "Avg Points", path: "averageScores.total", decimals: 1, sort: 1 },
            { name: "Avg Auto Scores", path: "averages.autoScore", decimals: 2, sort: 1 },
            { name: "Avg Teleop Scores", path: "averages.teleopScore", decimals: 2, sort: 1 },
          ],
        },
      },
      {
        view: "team",
        module: "Bar",
        position: "main",
        name: "Average Actions",
        options: {
          bars: [
            { name: "Auto Score", path: "averages.autoScore" },
            { name: "Auto Miss", path: "averages.autoMiss" },
            { name: "Teleop Score", path: "averages.teleopScore" },
            { name: "Teleop Miss", path: "averages.teleopMiss" },
          ],
        },
      },
      { view: "team", module: "PerformanceTimePlot", position: "main", name: "Points Each Match", options: { trackedStats: ["scores.total"] } },
      { view: "match", module: "ColumnDisplay", name: "Average Points", options: { path: "averageScores.total", decimals: 1, sort: 1 } },
      { view: "match", module: "SingleDisplay", name: "Win Chance", wholeMatch: true, options: { path: "averageScores.total", aggrMethod: "percentChanceOfWinning", decimals: 0, unit: "%" } },
    ],
    analysis: defaultAnalysis(),
  };
}
