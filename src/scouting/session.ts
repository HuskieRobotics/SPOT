/**
 * The scouting rules (docs/spec/05), as a pure state machine over a v2 `match-scouting.json`.
 *
 * One scouter scouting one robot through one match: the clock and its phases and segments, the
 * layer a scouter sees, every button type and executable, segment kinds, locks, the undo stack,
 * and the actions analysis receives (docs/spec/21 DV-1). The scouting-screen preview (#322) and
 * the Phase 2 scouting client both drive it; it knows nothing about React, the network or storage.
 *
 * Every operation takes the current state and the real time (`now`, ms) and returns a new state,
 * so a test can play a whole match without timers. State is never modified in place.
 *
 * v6 decisions beyond docs/spec/05 are recorded there in "v6: the scouting rules".
 */
import type { Button, ButtonType, Lock, MatchScoutingConfig, Segment } from "@/config/types";
import { kindAt, placeAt, NOWHERE, type Placement } from "@/data/phase";
import type { Action } from "@/data/types";
import {
  nextBoundary,
  progressFor,
  progressOf,
  readClock,
  startClock,
  STOPPED,
  withProgress,
  withSpeed,
  type Clock,
} from "./clock";
import { appExecutables, runExtension, type ExecutableSet } from "./executables";
import type { ExecutablePress, ExecutableView } from "./extension-api";

/** How the event is set up for this scouter (SC-28). */
export interface ScoutingSettings {
  /** The scouted robot's alliance. On blue, alliance-relative buttons record their partner. */
  alliance: "red" | "blue";
  /** The field is seen from the other side: alliance-relative buttons swap places, the map turns. */
  fieldFlipped: boolean;
}

export const DEFAULT_SETTINGS: ScoutingSettings = { alliance: "red", fieldFlipped: false };

export interface ScoutingContext {
  config: MatchScoutingConfig;
  settings: ScoutingSettings;
  /** The extension executables buttons may name; the app's (`src/scouting/extensions`) if absent. */
  executables?: ExecutableSet;
}

/** A button on a layer. Ids repeat across layers (every layer has its own Undo). */
export interface ButtonRef {
  layer: string;
  button: string;
}

/** One screen on the navigation stack (SC-25). */
export interface Screen {
  layer: string;
  /** The buttons a conditional layer shows, or null for all of them (SC-26). */
  visible: readonly string[] | null;
  /** The queue entry whose press opened this screen, or null when the clock did. */
  openedBy: number | null;
}

export interface KindSelection {
  kind: string;
  /** The repeat index it was selected in, or null when selected outside the segment. */
  index: number | null;
}

export interface EngagedLock {
  lock: Lock;
  /** The queue entry that engaged it. */
  entry: number;
}

/** What undoing a press must put back (SC-24). Screens are found by `Screen.openedBy`. */
type Revert =
  | { kind: "variable"; name: string; previous: string | number | boolean | undefined }
  | { kind: "hidden"; key: string }
  | { kind: "shown"; key: string }
  | { kind: "highlights"; previous: readonly string[] }
  | { kind: "segmentKind"; segment: string; previous: KindSelection | undefined }
  | { kind: "lock"; previous: EngagedLock | null }
  | { kind: "start" };

/** One press in the queue: what the scouter did and what analysis receives from it. */
export interface Entry {
  layer: string;
  button: string;
  type: ButtonType;
  /** The id this press records under (an alliance-relative button may record its partner). */
  recordedId: string;
  /** Match time remaining at the press (DM-3). */
  ts: number;
  /** Real time of the press. */
  at: number;
  /** Where the press happened, with the effective kind of a segment with kinds. */
  placement: Placement;
  /** What analysis receives: none for a temp press (`none` buttons and the start, SC-19, SC-22). */
  actions: Action[];
  revert: Revert[];
}

export type Status = "pre-match" | "running" | "ended" | "submitted";

export interface SessionState {
  status: Status;
  clock: Clock;
  /** Match time remaining at the last update. */
  ts: number;
  /** A phase's hold still running at the last update, in match ms (BL-298). */
  holding: number | null;
  /** Where the clock is, as of the last update. */
  placement: Placement;
  /** Phases and segments the clock has begun, by `phaseEntryKey`. */
  entered: readonly string[];
  /** Navigation stack; the last screen is the one shown (SC-25). */
  screens: readonly Screen[];
  variables: Readonly<Record<string, string | number | boolean>>;
  /** `layer:button` keys of buttons a `hide` executable removed (SC-36). */
  hidden: readonly string[];
  /** Highlighted button ids (SC-34, SC-35). A highlight shows on every layer with that button. */
  highlights: readonly string[];
  /** The kind the scouter selected for each segment with kinds (SC-22). */
  kinds: Readonly<Record<string, KindSelection>>;
  lock: EngagedLock | null;
  /** The last captured field position and until when (real ms) presses reuse it (SC-31a). */
  positionLock: { pos: { x: number; y: number }; until: number } | null;
  /** The queue entry waiting for the scouter to tap the field map (SC-32). */
  awaitingPosition: number | null;
  queue: readonly Entry[];
  /** Real time the clock reached 0, for "Match Complete" (SC-20). */
  endedAt: number | null;
}

// ---------------------------------------------------------------------------- lookup helpers

export function layerOf(config: MatchScoutingConfig, id: string) {
  return config.layout.layers.find((l) => l.id === id);
}

export function buttonOf(config: MatchScoutingConfig, ref: ButtonRef): Button | undefined {
  return layerOf(config, ref.layer)?.buttons.find((b) => b.id === ref.button);
}

function segmentOf(config: MatchScoutingConfig, placement: Placement): Segment | undefined {
  const phase = config.timing.phases.find((p) => p.id === placement.phase);
  return (phase?.segments ?? []).find((s) => s.id === placement.segment);
}

/** Key of a phase (`auto`) or of a segment within it (`teleop/shift`). */
function phaseEntryKey(phase: string, segment: string | null): string {
  return segment === null ? phase : `${phase}/${segment}`;
}

interface EntryPoint {
  key: string;
  startMs: number;
  phase: string;
  segment: string | null;
}

/** Every phase and segment, in the order the clock reaches them. */
function entryPoints(config: MatchScoutingConfig): EntryPoint[] {
  const points: EntryPoint[] = [];
  for (const phase of config.timing.phases) {
    points.push({ key: phase.id, startMs: phase.startMs, phase: phase.id, segment: null });
    for (const s of phase.segments ?? []) {
      points.push({
        key: phaseEntryKey(phase.id, s.id),
        startMs: s.startMs,
        phase: phase.id,
        segment: s.id,
      });
    }
  }
  // A phase begins before its own segments that start at the same moment.
  return points.sort((a, b) => b.startMs - a.startMs || (a.segment === null ? -1 : 1));
}

/** Which buttons a layer shows under `always` and `conditional` (SC-26). */
function visibleFor(
  always: readonly string[] | undefined,
  conditional: Record<string, Record<string, string[]>> | undefined,
  variables: Readonly<Record<string, string | number | boolean>>,
): string[] | null {
  if (!conditional || Object.keys(conditional).length === 0) return null;
  const visible = new Set(always ?? []);
  for (const [name, byValue] of Object.entries(conditional)) {
    const value = variables[name];
    if (value === undefined) continue;
    for (const id of byValue[String(value)] ?? []) visible.add(id);
  }
  return [...visible];
}

/** The partner of an alliance-relative button, if it has one (SC-28). */
export function alliancePartner(config: MatchScoutingConfig, id: string): string | null {
  for (const pair of config.rules.allianceRelativeButtons) {
    if (pair.own === id) return pair.opposing;
    if (pair.opposing === id) return pair.own;
  }
  return null;
}

/** The id a button records under: on the blue alliance, an alliance-relative one swaps (SC-28). */
export function recordedIdOf(context: ScoutingContext, id: string): string {
  if (context.settings.alliance !== "blue") return id;
  return alliancePartner(context.config, id) ?? id;
}

// ---------------------------------------------------------------------------- state

export function initialState(config: MatchScoutingConfig): SessionState {
  return {
    status: "pre-match",
    clock: STOPPED,
    ts: config.timing.totalMs,
    holding: null,
    placement: { ...NOWHERE },
    entered: [],
    screens: [{ layer: config.layout.initialLayer, visible: null, openedBy: null }],
    variables: { ...config.variables },
    hidden: [],
    highlights: [],
    kinds: {},
    lock: null,
    positionLock: null,
    awaitingPosition: null,
    queue: [],
    endedAt: null,
  };
}

/** The screen shown now. */
export function currentScreen(state: SessionState): Screen {
  return state.screens[state.screens.length - 1];
}

/** The effective kind of a segment with kinds at a placement (SC-22, #326). */
export function kindOf(
  state: SessionState,
  config: MatchScoutingConfig,
  placement: Placement,
): string | null {
  const segment = segmentOf(config, placement);
  if (!segment?.kinds?.length) return null;
  return kindAt(segment, state.kinds[segment.id], placement.segmentIndex);
}

/** Whether a lock keeps this button from being pressed (SC-27b). */
export function isLocked(state: SessionState, button: Button): boolean {
  return state.lock !== null && !state.lock.lock.exemptTypes.includes(button.type);
}

/** Whether the screen shows this button (SC-26, SC-36). */
export function isShown(state: SessionState, ref: ButtonRef): boolean {
  const screen = currentScreen(state);
  if (screen.layer !== ref.layer) return false;
  if (state.hidden.includes(`${ref.layer}:${ref.button}`)) return false;
  return screen.visible === null || screen.visible.includes(ref.button);
}

/** Undo is allowed while the queue holds more presses than the configured minimum (SC-24). */
export function canUndo(state: SessionState, config: MatchScoutingConfig): boolean {
  return state.queue.length > config.rules.undo.minQueueLength;
}

// ---------------------------------------------------------------------------- the clock

/**
 * Bring the state up to real time `now`: read the clock, apply every phase and segment it has
 * begun since the last update (SC-20), release a lock whose phase has begun (SC-27b), and end
 * the match at 0. Call it on every tick; every other operation calls it first.
 */
export function advance(state: SessionState, context: ScoutingContext, now: number): SessionState {
  if (state.status !== "running") return state;
  const { config } = context;
  const reading = readClock(config, progressOf(state.clock, now));
  let next: SessionState = { ...state, ts: reading.remaining, holding: reading.holding };

  const entered = new Set(state.entered);
  for (const point of entryPoints(config)) {
    if (point.startMs < reading.remaining || entered.has(point.key)) continue;
    entered.add(point.key);
    next = enterPoint(next, context, point);
  }
  if (entered.size !== state.entered.length) next = { ...next, entered: [...entered] };
  next = { ...next, placement: placeAt(config, reading.remaining) };

  if (reading.remaining <= 0) {
    next = { ...next, status: "ended", ts: 0, endedAt: now, clock: { ...next.clock, since: null } };
  }
  return next;
}

/**
 * A phase or segment begins: it shows its layer, if it has one, as a fresh screen (the scouter
 * cannot go back into the previous period's screens), sets its variables, and releases a lock
 * waiting for it.
 */
function enterPoint(
  state: SessionState,
  context: ScoutingContext,
  point: EntryPoint,
): SessionState {
  const { config } = context;
  const phase = config.timing.phases.find((p) => p.id === point.phase)!;
  let next = state;
  if (point.segment === null) {
    const variables = { ...state.variables, ...(phase.variables ?? {}) };
    next = { ...next, variables };
    if (phase.layer && layerOf(config, phase.layer)) {
      const visible = visibleFor(phase.always, phase.conditional, variables);
      next = { ...next, screens: [{ layer: phase.layer, visible, openedBy: null }] };
    }
    if (next.lock && next.lock.lock.untilPhase === phase.id) next = { ...next, lock: null };
  } else {
    const segment = (phase.segments ?? []).find((s) => s.id === point.segment)!;
    if (segment.layer && layerOf(config, segment.layer)) {
      next = { ...next, screens: [{ layer: segment.layer, visible: null, openedBy: null }] };
    }
  }
  return next;
}

/** Play faster or slower from `now` on (the preview's speed control; BL-230). */
export function setSpeed(
  state: SessionState,
  context: ScoutingContext,
  now: number,
  speed: number,
): SessionState {
  const current = advance(state, context, now);
  return { ...current, clock: withSpeed(current.clock, now, speed) };
}

/**
 * Jump the clock forward to `ts` remaining, or to the next phase, segment or repeat when `ts` is
 * left out (the preview's skip control). During a hold, skipping ends the hold. Only while the
 * match is running; the clock never goes back.
 */
export function skip(
  state: SessionState,
  context: ScoutingContext,
  now: number,
  ts?: number,
): SessionState {
  const current = advance(state, context, now);
  if (current.status !== "running") return current;
  const at = progressOf(current.clock, now);
  let progress: number;
  if (ts === undefined && current.holding !== null) {
    progress = at + current.holding;
  } else {
    const target = ts ?? nextBoundary(context.config, current.ts);
    progress = Math.max(at, progressFor(context.config, target));
  }
  return advance({ ...current, clock: withProgress(current.clock, now, progress) }, context, now);
}

// ---------------------------------------------------------------------------- pressing

/**
 * The scouter presses a button. A press of a button that is not on screen, is locked, or comes
 * while the field map waits for a tap does nothing.
 */
export function press(
  state: SessionState,
  context: ScoutingContext,
  ref: ButtonRef,
  now: number,
): SessionState {
  const { config } = context;
  const current = advance(state, context, now);
  const button = buttonOf(config, ref);
  if (!button || !isShown(current, ref) || current.awaitingPosition !== null) return current;
  if (current.status === "submitted" || isLocked(current, button)) return current;

  switch (button.type) {
    case "label":
      return current;
    case "undo":
      return runOwnExecutables(undo(current, context), context, ref, button, now);
    case "match-control":
      if (current.status === "pre-match") return start(current, context, ref, button, now);
      if (current.status === "ended") return { ...current, status: "submitted" };
      return current; // while running it is the clock (SC-21)
    default:
      return record(current, context, ref, button, now);
  }
}

/** Start the match (SC-19): a temp entry, the button's executables, and the clock. */
function start(
  state: SessionState,
  context: ScoutingContext,
  ref: ButtonRef,
  button: Button,
  now: number,
): SessionState {
  const entry: Entry = {
    layer: ref.layer,
    button: button.id,
    type: button.type,
    recordedId: button.id,
    ts: state.ts,
    at: now,
    placement: { ...NOWHERE },
    actions: [],
    revert: [{ kind: "start" }],
  };
  const started: SessionState = {
    ...state,
    status: "running",
    clock: startClock(now, state.clock.speed),
    queue: [...state.queue, entry],
  };
  const withExecutables = applyExecutables(started, context, button, ref, state.queue.length, now);
  return advance(withExecutables, context, now);
}

/** An action or a `none` press: one queue entry, its executables, and its actions. */
function record(
  state: SessionState,
  context: ScoutingContext,
  ref: ButtonRef,
  button: Button,
  now: number,
): SessionState {
  const { config } = context;
  const index = state.queue.length;
  const placement: Placement =
    state.status === "pre-match" ? { ...NOWHERE } : { ...state.placement };
  const revert: Revert[] = [];
  let next = state;

  if (button.type === "none") {
    // A segment kind's toggle selects that kind from now on (SC-22, #326).
    const kinds = { ...next.kinds };
    for (const phase of config.timing.phases) {
      for (const segment of phase.segments ?? []) {
        if (!(segment.kinds ?? []).some((k) => k.toggleButton === button.id)) continue;
        const kind = segment.kinds!.find((k) => k.toggleButton === button.id)!;
        revert.push({ kind: "segmentKind", segment: segment.id, previous: kinds[segment.id] });
        kinds[segment.id] = {
          kind: kind.id,
          index: placement.segment === segment.id ? placement.segmentIndex : null,
        };
      }
    }
    next = { ...next, kinds };
  } else {
    // A lock's trigger engages it until its phase begins (SC-27b).
    for (const lock of config.rules.locks) {
      if (!lock.triggerButtons.includes(button.id) || next.entered.includes(lock.untilPhase)) {
        continue;
      }
      revert.push({ kind: "lock", previous: next.lock });
      next = { ...next, lock: { lock, entry: index } };
    }
  }
  placement.segmentKind = kindOf(next, config, placement);

  const entry: Entry = {
    layer: ref.layer,
    button: button.id,
    type: button.type,
    recordedId: button.type === "action" ? recordedIdOf(context, button.id) : button.id,
    ts: Math.max(0, state.ts),
    at: now,
    placement,
    actions: [],
    revert,
  };
  next = { ...next, queue: [...next.queue, entry] };
  return applyExecutables(next, context, button, ref, index, now);
}

/**
 * Run a button's executables in order (SC-38) for queue entry `index`, then write the entry's
 * actions: `multiplier` copies, with a position if one was captured (SC-32, SC-33, SC-37).
 */
function applyExecutables(
  state: SessionState,
  context: ScoutingContext,
  button: Button,
  ref: ButtonRef,
  index: number | null,
  now: number,
): SessionState {
  const { config } = context;
  let next = state;
  const revert: Revert[] = [];
  let copies = 1;
  let position: { x: number; y: number } | null = null;
  let awaiting = false;

  for (const executable of button.executables) {
    switch (executable.type) {
      case "layer": {
        const to = (executable as { to: string }).to;
        if (layerOf(config, to)) {
          next = {
            ...next,
            screens: [...next.screens, { layer: to, visible: null, openedBy: index }],
          };
        }
        break;
      }
      case "conditionalLayer": {
        const e = executable as {
          to: string;
          always: string[];
          conditional: Record<string, Record<string, string[]>>;
        };
        if (layerOf(config, e.to)) {
          const visible = visibleFor(e.always, e.conditional, next.variables);
          next = { ...next, screens: [...next.screens, { layer: e.to, visible, openedBy: index }] };
        }
        break;
      }
      case "setVariable": {
        const e = executable as { name: string; value: string | number | boolean };
        revert.push({ kind: "variable", name: e.name, previous: next.variables[e.name] });
        next = { ...next, variables: { ...next.variables, [e.name]: e.value } };
        break;
      }
      case "position": {
        const lockMs = (executable as { lockMs?: number }).lockMs ?? config.rules.positionLockMs;
        if (next.positionLock && now <= next.positionLock.until) {
          position = next.positionLock.pos;
          next = { ...next, positionLock: { pos: position, until: now + lockMs } };
        } else {
          awaiting = true;
        }
        break;
      }
      case "constantPosition":
        position = (executable as { position: { x: number; y: number } }).position;
        break;
      case "exclusiveHighlight": {
        const group = (executable as { group: string }).group;
        const inGroup = highlightGroup(config, group);
        revert.push({ kind: "highlights", previous: next.highlights });
        next = {
          ...next,
          highlights: [...next.highlights.filter((id) => !inGroup.has(id)), button.id],
        };
        break;
      }
      case "clearHighlight":
        revert.push({ kind: "highlights", previous: next.highlights });
        next = { ...next, highlights: next.highlights.filter((id) => id !== button.id) };
        break;
      case "hide": {
        const key = `${ref.layer}:${button.id}`;
        if (!next.hidden.includes(key)) {
          revert.push({ kind: "hidden", key });
          next = { ...next, hidden: [...next.hidden, key] };
        }
        break;
      }
      case "multiplier":
        copies = Math.max(1, (executable as { count: number }).count);
        break;
      default: {
        // An extension's executable (#362): it may change what the scouter sees, never what is
        // recorded (SC-38), and undo puts back what it changed (T-10).
        const extension = (context.executables ?? appExecutables()).get(executable.type);
        // config:check reports an unknown type, and the server never sends such a file.
        if (!extension) break;
        const options: Record<string, unknown> = { ...executable };
        delete options.type;
        const before: ExecutableView = {
          variables: next.variables,
          highlights: next.highlights,
          hidden: next.hidden,
        };
        const outcome = runExtension(extension, before, {
          options,
          ...pressesFor(next, ref, button, index),
          config,
          settings: context.settings,
        });
        if (!outcome.ok) {
          console.error(
            `The "${executable.type}" executable on button "${button.id}" failed: ${outcome.message}. The press was recorded without it.`,
          );
          break;
        }
        revert.push(...revertsFor(before, outcome.view));
        next = { ...next, ...outcome.view };
        break;
      }
    }
  }

  if (index === null) return next;
  const queue = [...next.queue];
  const entry = queue[index];
  const actions: Action[] =
    entry.type === "action"
      ? Array.from({ length: copies }, () => {
          const action: Action = {
            id: entry.recordedId,
            ts: entry.ts,
            phase: entry.placement.phase,
            segment: entry.placement.segment,
            segmentKind: entry.placement.segmentKind,
            segmentIndex: entry.placement.segmentIndex,
          };
          if (position) action.other = { pos: position };
          return action;
        })
      : [];
  queue[index] = { ...entry, actions, revert: [...entry.revert, ...revert] };
  return { ...next, queue, awaitingPosition: awaiting ? index : next.awaitingPosition };
}

/** The press an executable runs for, and the presses before it, as an extension sees them. */
function pressesFor(
  state: SessionState,
  ref: ButtonRef,
  button: Button,
  index: number | null,
): { press: ExecutablePress; earlier: ExecutablePress[] } {
  const seen = (e: Entry): ExecutablePress => ({
    layer: e.layer,
    button: e.button,
    type: e.type,
    ts: e.ts,
    placement: e.placement,
  });
  if (index !== null) {
    return { press: seen(state.queue[index]), earlier: state.queue.slice(0, index).map(seen) };
  }
  // An undo button's own executables: its press is not in the queue.
  return {
    press: {
      layer: ref.layer,
      button: button.id,
      type: button.type,
      ts: Math.max(0, state.ts),
      placement: { ...state.placement },
    },
    earlier: state.queue.map(seen),
  };
}

/** What undo must put back after an extension turned `before` into `after`. */
function revertsFor(before: ExecutableView, after: ExecutableView): Revert[] {
  const revert: Revert[] = [];
  const names = new Set([...Object.keys(before.variables), ...Object.keys(after.variables)]);
  for (const name of names) {
    if (before.variables[name] !== after.variables[name]) {
      revert.push({ kind: "variable", name, previous: before.variables[name] });
    }
  }
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]);
  if (!same(before.highlights, after.highlights)) {
    revert.push({ kind: "highlights", previous: before.highlights });
  }
  for (const key of after.hidden) {
    if (!before.hidden.includes(key)) revert.push({ kind: "hidden", key });
  }
  for (const key of before.hidden) {
    if (!after.hidden.includes(key)) revert.push({ kind: "shown", key });
  }
  return revert;
}

/** Ids of the buttons that highlight in `group`, on any layer. */
function highlightGroup(config: MatchScoutingConfig, group: string): Set<string> {
  const ids = new Set<string>();
  for (const layer of config.layout.layers) {
    for (const b of layer.buttons) {
      if (
        b.executables.some(
          (e) => e.type === "exclusiveHighlight" && "group" in e && e.group === group,
        )
      ) {
        ids.add(b.id);
      }
    }
  }
  return ids;
}

/**
 * The scouter taps the field map (SC-32): x and y are whole percentages of the map from its
 * top-left corner, as the scouter sees it. A flipped field turns the map, so the stored position
 * is turned back and always reads the same way.
 */
export function placePosition(
  state: SessionState,
  context: ScoutingContext,
  tap: { x: number; y: number },
  now: number,
): SessionState {
  const index = state.awaitingPosition;
  if (index === null) return state;
  const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));
  const seen = { x: clamp(tap.x), y: clamp(tap.y) };
  const pos = context.settings.fieldFlipped ? { x: 100 - seen.x, y: 100 - seen.y } : seen;
  const queue = [...state.queue];
  const entry = queue[index];
  queue[index] = { ...entry, actions: entry.actions.map((a) => ({ ...a, other: { pos } })) };
  const lockMs =
    (
      buttonOf(context.config, entry)?.executables.find((e) => e.type === "position") as
        { lockMs?: number } | undefined
    )?.lockMs ?? context.config.rules.positionLockMs;
  return {
    ...state,
    queue,
    awaitingPosition: null,
    positionLock: { pos, until: now + lockMs },
  };
}

// ---------------------------------------------------------------------------- undo

/**
 * Take back the last press (SC-24), when the queue holds more than the configured minimum. The
 * press's actions go, the screens it opened close, and what its executables changed is put back.
 * A screen the clock opened since stays: undoing an auto press in teleop leaves teleop's screen.
 * Undoing the start returns to before the match.
 */
export function undo(state: SessionState, context: ScoutingContext): SessionState {
  const { config } = context;
  if (!canUndo(state, config)) return state;
  const index = state.queue.length - 1;
  const entry = state.queue[index];
  let next: SessionState = {
    ...state,
    queue: state.queue.slice(0, index),
    screens: state.screens.filter((s) => s.openedBy !== index),
    awaitingPosition: state.awaitingPosition === index ? null : state.awaitingPosition,
  };
  for (const r of [...entry.revert].reverse()) {
    switch (r.kind) {
      case "variable": {
        const variables = { ...next.variables };
        if (r.previous === undefined) delete variables[r.name];
        else variables[r.name] = r.previous;
        next = { ...next, variables };
        break;
      }
      case "hidden":
        next = { ...next, hidden: next.hidden.filter((k) => k !== r.key) };
        break;
      case "shown":
        if (!next.hidden.includes(r.key)) next = { ...next, hidden: [...next.hidden, r.key] };
        break;
      case "highlights":
        next = { ...next, highlights: r.previous };
        break;
      case "segmentKind": {
        const kinds = { ...next.kinds };
        if (r.previous === undefined) delete kinds[r.segment];
        else kinds[r.segment] = r.previous;
        next = { ...next, kinds };
        break;
      }
      case "lock":
        next = { ...next, lock: r.previous };
        break;
      case "start":
        next = {
          ...next,
          status: "pre-match",
          clock: { ...STOPPED, speed: state.clock.speed },
          ts: config.timing.totalMs,
          holding: null,
          placement: { ...NOWHERE },
          entered: [],
          screens: [{ layer: config.layout.initialLayer, visible: null, openedBy: null }],
          kinds: {},
          lock: null,
          endedAt: null,
        };
        break;
    }
  }
  if (next.screens.length === 0) {
    next = {
      ...next,
      screens: [{ layer: config.layout.initialLayer, visible: null, openedBy: null }],
    };
  }
  return next;
}

/** The undo button's own executables run after the undo, whether or not anything was undone. */
function runOwnExecutables(
  state: SessionState,
  context: ScoutingContext,
  ref: ButtonRef,
  button: Button,
  now: number,
): SessionState {
  if (button.executables.length === 0) return state;
  // No queue entry owns what they do, so no later undo takes it back.
  return applyExecutables(state, context, button, ref, null, now);
}

// ---------------------------------------------------------------------------- results

/** Every action analysis would receive, in the order recorded (docs/spec/21 DV-1). */
export function recordedActions(state: SessionState): Action[] {
  return state.queue.flatMap((e) => e.actions);
}
