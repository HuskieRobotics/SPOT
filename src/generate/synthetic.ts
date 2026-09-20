/**
 * Synthetic scouting data (T-4, answer 45).
 *
 * A new season's features have to be verified before any real matches exist, so this walks a
 * `match-scouting.json` the way a scouter would and emits the performances that walk produces.
 * It is a headless model of the scouting rules, which makes it the first executable statement
 * of those rules; the Phase 2 client should agree with it.
 *
 * What it models: the countdown and its phases and segments, the layer graph, hidden buttons,
 * multipliers, position capture, conditional layers, variables, shift toggles, the undo guard
 * and configured locks such as A-Stop. What it does not model: a human. Button choice is random
 * within what the configuration allows, so the data is rule-respecting but not realistic, which
 * is what a regression fixture needs.
 */
import type { Button, Executable, Layer, MatchScoutingConfig, Segment } from "@/config/types";
import { deriveKnownActionIds } from "@/config/knownActionIds";
import { compositeActionId, placeAt, type Placement } from "@/data/phase";
import {
  DEFAULT_TENANT,
  NOT_FLAGGED,
  type Action,
  type Scouter,
  type SpotEvent,
  type TeamMatchPerformance,
} from "@/data/types";
import { Random } from "./random";

export interface GenerateOptions {
  config: MatchScoutingConfig;
  /** Same seed, same data. */
  seed: string | number;
  /** Team numbers to scout. Defaults to 48 plausible numbers. */
  teams?: number[];
  /** Number of matches to play. */
  matches: number;
  /** Robots scouted per match; six is a full field. */
  robotsPerMatch?: number;
  eventId?: string;
  eventCode?: string;
  tenantId?: string;
  /** Student ids to attribute performances to. */
  scouterIds?: string[];
  /** Roughly how many actions a performance should contain. */
  actionsPerMatch?: { min: number; max: number };
  /** Fixed clock for reproducible `submittedAt` and `createdAt`. */
  now?: number;
}

export interface GenerateReport {
  performances: number;
  actions: number;
  matches: number;
  teams: number;
  seed: string;
  /** Composite ids the configuration cannot explain. Always empty; asserted, not hoped. */
  unknownActionIds: string[];
  /** Actions per phase, so a caller can see the shape of what it got. */
  actionsByPhase: Record<string, number>;
}

export interface GeneratedDataset {
  event: SpotEvent;
  scouters: Scouter[];
  performances: TeamMatchPerformance[];
  report: GenerateReport;
}

const DEFAULT_TEAMS = [
  1741, 1816, 2052, 2090, 2175, 2226, 2338, 2450, 2500, 2530, 2574, 2638, 2823, 2846, 2883, 2951,
  3026, 3061, 3102, 3130, 3184, 3277, 3298, 3352, 3630, 3691, 3749, 3840, 4009, 4215, 4230, 4239,
  4536, 4607, 4628, 4780, 4818, 4901, 5172, 5464, 5653, 5690, 6317, 6574, 7021, 7538, 8122, 9998,
];

const OID_CHARS = "0123456789abcdef";

function objectId(random: Random): string {
  let out = "";
  for (let i = 0; i < 24; i++) out += OID_CHARS[random.int(0, 15)];
  return out;
}

// ---------------------------------------------------------------------------- one performance

interface SimState {
  layerId: string;
  /** Button ids a `conditionalLayer` restricted the current layer to, if any. */
  visible: Set<string> | null;
  variables: Record<string, string | number | boolean>;
  /** "<layer>:<button>" for buttons a `hide` executable removed. */
  hidden: Set<string>;
  /** Selected kind per segment id, chosen by pressing a toggle button. */
  segmentKinds: Map<string, string>;
  /** The phase and segment last entered, so a change can apply its layer and variables. */
  enteredPhase: string | null;
  enteredSegment: string | null;
  /** Phase id a lock is waiting for, while a lock is engaged. */
  lockedUntilPhase: string | null;
  lockExempt: Set<string>;
  lastPosition: { x: number; y: number } | null;
}

function layerById(config: MatchScoutingConfig, id: string): Layer | undefined {
  return config.layout.layers.find((l) => l.id === id);
}

function segmentOf(config: MatchScoutingConfig, placement: Placement): Segment | undefined {
  const phase = config.timing.phases.find((p) => p.id === placement.phase);
  return (phase?.segments ?? []).find((s) => s.id === placement.segment);
}

/** Buttons the scouter could actually press right now. */
function availableButtons(
  config: MatchScoutingConfig,
  state: SimState,
  started: boolean,
): Button[] {
  const layer = layerById(config, state.layerId);
  if (!layer) return [];
  return layer.buttons.filter((b) => {
    if (state.hidden.has(`${state.layerId}:${b.id}`)) return false;
    if (state.visible && !state.visible.has(b.id)) return false;
    if (b.type === "label") return false;
    // Once the clock is running, the start control is not pressed again.
    if (b.type === "match-control" && started) return false;
    if (state.lockedUntilPhase && !state.lockExempt.has(b.type)) return false;
    return true;
  });
}

function applyExecutables(
  config: MatchScoutingConfig,
  state: SimState,
  button: Button,
  random: Random,
): { multiplier: number; position: { x: number; y: number } | null } {
  let multiplier = 1;
  let position: { x: number; y: number } | null = null;

  for (const executable of button.executables as Executable[]) {
    switch (executable.type) {
      case "layer": {
        const to = (executable as { to: string }).to;
        if (layerById(config, to)) {
          state.layerId = to;
          state.visible = null;
        }
        break;
      }
      case "conditionalLayer": {
        const e = executable as {
          to: string;
          always: string[];
          conditional: Record<string, Record<string, string[]>>;
        };
        if (!layerById(config, e.to)) break;
        state.layerId = e.to;
        const visible = new Set(e.always);
        for (const [name, byValue] of Object.entries(e.conditional ?? {})) {
          const value = String(state.variables[name]);
          for (const id of byValue[value] ?? []) visible.add(id);
        }
        state.visible = visible.size > 0 ? visible : null;
        break;
      }
      case "setVariable": {
        const e = executable as { name: string; value: string | number | boolean };
        state.variables[e.name] = e.value;
        break;
      }
      case "position": {
        position = { x: random.int(0, 100), y: random.int(0, 100) };
        state.lastPosition = position;
        break;
      }
      case "constantPosition": {
        position = (executable as { position: { x: number; y: number } }).position;
        break;
      }
      case "hide": {
        state.hidden.add(`${state.layerId}:${button.id}`);
        break;
      }
      case "multiplier": {
        multiplier = (executable as { count: number }).count;
        break;
      }
      // exclusiveHighlight and clearHighlight are presentation only, and an unknown type is an
      // extension we cannot model: neither changes what gets recorded.
      default:
        break;
    }
  }
  return { multiplier, position };
}

/** A shift toggle is a `none` button named by a segment kind (SC-22). */
function applyToggle(config: MatchScoutingConfig, state: SimState, buttonId: string): void {
  for (const phase of config.timing.phases) {
    for (const segment of phase.segments ?? []) {
      for (const kind of segment.kinds ?? []) {
        if (kind.toggleButton === buttonId) state.segmentKinds.set(segment.id, kind.id);
      }
    }
  }
}

function engageLocks(config: MatchScoutingConfig, state: SimState, buttonId: string): void {
  for (const lock of config.rules.locks) {
    if (lock.triggerButtons.includes(buttonId)) {
      state.lockedUntilPhase = lock.untilPhase;
      state.lockExempt = new Set(lock.exemptTypes);
    }
  }
}

interface SimResult {
  actions: Action[];
}

function simulateMatch(
  config: MatchScoutingConfig,
  random: Random,
  targetActions: number,
): SimResult {
  const total = config.timing.totalMs;
  const state: SimState = {
    layerId: config.layout.initialLayer,
    visible: null,
    variables: { ...config.variables },
    hidden: new Set(),
    segmentKinds: new Map(),
    enteredPhase: null,
    enteredSegment: null,
    lockedUntilPhase: null,
    lockExempt: new Set(),
    lastPosition: null,
  };

  const actions: Action[] = [];
  const minQueue = config.rules.undo.minQueueLength;
  let ts = total;
  let started = false;
  // A few presses happen before the clock starts, which is how preload buttons are recorded.
  let remainingSteps = targetActions + random.int(2, 6);

  while (remainingSteps-- > 0 && ts >= 0) {
    const options = availableButtons(config, state, started);
    if (options.length === 0) break;

    // Favour recording actions; navigate and undo sometimes.
    // A shift toggle is worth pressing whenever the current segment has kinds and none is
    // chosen yet, which is what a scouter does at the start of a shift.
    const currentSegment = started ? segmentOf(config, placeAt(config, ts)) : undefined;
    const needsKind =
      currentSegment !== undefined &&
      (currentSegment.kinds?.length ?? 0) > 0 &&
      !state.segmentKinds.has(currentSegment.id);
    const toggleIds = new Set((currentSegment?.kinds ?? []).map((k) => k.toggleButton));

    const button = random.pickWeighted(options, (b) => {
      if (b.type === "none" && toggleIds.has(b.id)) return needsKind ? 40 : 3;
      if (b.type === "action") return 10;
      if (b.type === "undo") return 1;
      if (b.type === "match-control") return 20;
      return 4;
    });
    if (!button) break;

    if (button.type === "match-control") {
      started = true;
      ts = total - 1;
      applyExecutables(config, state, button, random);
      continue;
    }

    const placement = started
      ? placeAt(config, ts)
      : { phase: null, segment: null, segmentKind: null, segmentIndex: null };

    // A lock releases when the phase it was waiting for begins.
    if (state.lockedUntilPhase && placement.phase === state.lockedUntilPhase) {
      state.lockedUntilPhase = null;
      state.lockExempt = new Set();
    }

    // Entering a phase or a segment switches the layer and applies the phase's variables, the
    // same way the client does. Without this the walk never reaches a layer that only a phase
    // change opens, such as the 2026 shift layer with its active/inactive toggles.
    if (placement.phase !== state.enteredPhase) {
      state.enteredPhase = placement.phase;
      state.enteredSegment = null;
      const phase = config.timing.phases.find((p) => p.id === placement.phase);
      if (phase) {
        if (phase.layer && layerById(config, phase.layer)) {
          state.layerId = phase.layer;
          state.visible = null;
        }
        Object.assign(state.variables, phase.variables ?? {});
      }
    }
    if (placement.segment !== state.enteredSegment) {
      state.enteredSegment = placement.segment;
      const segment = segmentOf(config, placement);
      if (segment?.layer && layerById(config, segment.layer)) {
        state.layerId = segment.layer;
        state.visible = null;
      }
    }

    if (button.type === "undo") {
      if (actions.length > minQueue) actions.pop();
      applyExecutables(config, state, button, random);
    } else if (button.type === "none") {
      applyToggle(config, state, button.id);
      applyExecutables(config, state, button, random);
    } else {
      engageLocks(config, state, button.id);
      const { multiplier, position } = applyExecutables(config, state, button, random);
      const segment = segmentOf(config, placement);
      const kind = segment?.kinds?.length ? (state.segmentKinds.get(segment.id) ?? null) : null;
      for (let i = 0; i < multiplier; i++) {
        const action: Action = {
          id: button.id,
          ts: Math.max(0, ts),
          phase: placement.phase,
          segment: placement.segment,
          segmentKind: kind,
          segmentIndex: placement.segmentIndex,
        };
        if (position) action.other = { pos: position };
        actions.push(action);
      }
    }

    if (started) {
      // Spread the remaining presses over the remaining time, with jitter so timestamps are not
      // on a grid. Dividing what is left by the steps that are left keeps the pace constant, so
      // a match is actually played to the end and the late phases get their share of actions.
      const even = ts / Math.max(1, remainingSteps);
      ts -= Math.max(150, Math.floor(even * (0.5 + random.next())));
      if (ts < 0) ts = 0;
    }
  }

  return { actions };
}

// ---------------------------------------------------------------------------- dataset

export function generate(options: GenerateOptions): GeneratedDataset {
  const {
    config,
    seed,
    matches,
    teams = DEFAULT_TEAMS,
    robotsPerMatch = 6,
    tenantId = DEFAULT_TENANT,
    eventCode = "2026syn_synthetic",
    actionsPerMatch = { min: 14, max: 34 },
    now = 1_772_800_000_000,
  } = options;

  const random = new Random(seed);
  const eventId = options.eventId ?? objectId(random);
  const scouterIds =
    options.scouterIds ?? Array.from({ length: robotsPerMatch }, (_, i) => `90000${i + 1}`);

  const underscore = eventCode.indexOf("_");
  const event: SpotEvent = {
    _id: eventId,
    tenantId,
    code: eventCode,
    tbaKey: underscore === -1 ? eventCode : eventCode.slice(0, underscore),
    label: underscore === -1 ? "" : eventCode.slice(underscore + 1),
    eventCode: null,
    eventCodeRotatedAt: null,
  };

  const scouters: Scouter[] = scouterIds.map((id, i) => ({
    _id: id,
    tenantId,
    displayName: `Synthetic Scouter ${i + 1}`,
    aliases: [],
    legacy: false,
    createdAt: now,
  }));

  const performances: TeamMatchPerformance[] = [];
  const actionsByPhase: Record<string, number> = {};
  let actionCount = 0;

  for (let matchNumber = 1; matchNumber <= matches; matchNumber++) {
    const lineup = random.shuffle(teams).slice(0, robotsPerMatch);
    lineup.forEach((robotNumber, slot) => {
      const scouterId = scouterIds[slot % scouterIds.length];
      const { actions } = simulateMatch(
        config,
        random,
        random.int(actionsPerMatch.min, actionsPerMatch.max),
      );
      const nonce = random.token();
      for (const a of actions) {
        actionCount++;
        const key = a.phase ?? "(pre-match)";
        actionsByPhase[key] = (actionsByPhase[key] ?? 0) + 1;
      }
      performances.push({
        _id: objectId(random),
        tenantId,
        eventId,
        matchNumber,
        robotNumber,
        scouterId,
        source: "app",
        clientVersion: "6.0.0-synthetic",
        submittedAt: now + matchNumber * 6 * 60_000 + slot * 1000,
        matchKey: `${matchNumber}-${robotNumber}-${scouterId}-${nonce}`,
        nonce,
        coverage: "full",
        superseded: false,
        flag: { ...NOT_FLAGGED },
        notes: null,
        tags: [],
        actions,
      });
    });
  }

  // The generator may only produce ids the configuration can explain; if it ever does not, the
  // walk has drifted from the rules and the fixture would be meaningless.
  const known = new Set(deriveKnownActionIds(config));
  const unknownActionIds = [
    ...new Set(
      performances
        .flatMap((p) => p.actions)
        .map((a) => compositeActionId(config, a.id, a))
        .filter((id) => !known.has(id)),
    ),
  ].sort();

  return {
    event,
    scouters,
    performances,
    report: {
      performances: performances.length,
      actions: actionCount,
      matches,
      teams: teams.length,
      seed: String(seed),
      unknownActionIds,
      actionsByPhase,
    },
  };
}

// ---------------------------------------------------------------------------- legacy shape

/** v5-shaped document, for feeding generated data to the behavioral oracle (tools/oracle). */
export interface LegacyPerformance {
  _id: string;
  timestamp: number;
  clientVersion: string;
  scouterId: string;
  robotNumber: number;
  matchNumber: number;
  eventNumber: string;
  matchId: string;
  matchId_rand: string;
  actionQueue: { id: string; ts: number; other?: Record<string, unknown> }[];
}

export function toLegacyPerformance(
  config: MatchScoutingConfig,
  performance: TeamMatchPerformance,
): LegacyPerformance {
  return {
    _id: performance._id,
    timestamp: performance.submittedAt,
    clientVersion: performance.clientVersion,
    scouterId: performance.scouterId ?? "qrcode",
    robotNumber: performance.robotNumber,
    matchNumber: performance.matchNumber,
    eventNumber: performance.eventId,
    matchId: performance.matchKey,
    matchId_rand: performance.nonce,
    actionQueue: performance.actions.map((a) => {
      const out: { id: string; ts: number; other?: Record<string, unknown> } = {
        id: compositeActionId(config, a.id, a),
        ts: a.ts,
      };
      if (a.other) out.other = a.other;
      return out;
    }),
  };
}
