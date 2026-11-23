/**
 * Match-scouting state machine (no DOM). The scouting page and the builder's live preview
 * both render from this engine, so what admins test in the builder is exactly what scouters get.
 *
 * Time model: `time` is milliseconds REMAINING on the match clock (counts down), like legacy SPOT.
 */
import type { Action, Phase, ScoutButton, ScoutingConfig, VariableValue } from "../types";
import { camelCase } from "../analysis/path";

export interface EngineContext {
  /** Field orientation: swap the two zone buttons' positions. */
  swapZones: boolean;
  /** Alliance of the robot being scouted (zone ids are recorded relative to it). */
  alliance: "red" | "blue" | null;
}

interface ShiftState {
  current: "active" | "inactive" | null;
  activeCount: number;
  inactiveCount: number;
  number: number;
  lastSwitch: number;
  pressed: boolean;
}

interface QueueEntry extends Action {
  baseId: string;
  uid: string;
  temp?: boolean;
  /** Undo bookkeeping (never submitted). */
  undo: {
    historyMark: number;
    epoch: number;
    highlights: string[];
    hidden: string[];
    shift: ShiftState;
    vars: [string, VariableValue | undefined][];
    extra: number;
    engagedAStop: boolean;
  };
}

export type EngineEffect =
  | { type: "requestPosition"; entryIndex: number }
  | { type: "positionReused" }
  | { type: "started" }
  | { type: "submit" }
  | { type: "reset" };

export type EngineStatus = "pre" | "running" | "done";

export interface RenderButton extends ScoutButton {
  /** Id that will be recorded (after zone swaps). */
  effectiveId: string;
  effectiveLabel: string;
  effectiveArea: ScoutButton["area"];
  highlighted: boolean;
  disabled: boolean;
  usesPosition: boolean;
}

export class ScoutingEngine {
  readonly cfg: ScoutingConfig;
  ctx: EngineContext;

  status: EngineStatus = "pre";
  time: number;
  speed = 1;
  phaseLabel = "";
  queue: QueueEntry[] = [];
  doneAt = 0;

  private phases: Phase[];
  private nextPhase = 0;
  private epoch = 0;
  private history: string[][] = [];
  private variables: Record<string, VariableValue> = {};
  private highlights = new Set<string>();
  private hidden = new Set<string>();
  private shift: ShiftState;
  private aStopEngaged = false;
  private holdRemaining = 0;
  private lastTick = 0;
  private positionLock: { pos: { x: number; y: number }; until: number } | null = null;
  private byUid = new Map<string, ScoutButton>();
  private layerOf = new Map<string, number>();

  constructor(cfg: ScoutingConfig, ctx: EngineContext = { swapZones: false, alliance: null }) {
    this.cfg = cfg;
    this.ctx = ctx;
    this.time = cfg.totalTime;
    this.phases = [...cfg.phases].sort((a, b) => b.at - a.at);
    cfg.layers.forEach((layer, i) =>
      layer.buttons.forEach((b) => {
        this.byUid.set(b.uid, b);
        this.layerOf.set(b.uid, i);
      }),
    );
    this.shift = this.freshShift();
    this.reset();
  }

  private freshShift(): ShiftState {
    return { current: null, activeCount: 0, inactiveCount: 0, number: 0, lastSwitch: this.cfg.shifts?.startsAt ?? 0, pressed: false };
  }

  /** Back to the pre-match state (also used when "Start Match" is undone). */
  reset() {
    this.status = "pre";
    this.time = this.cfg.totalTime;
    this.phaseLabel = "";
    this.nextPhase = 0;
    this.epoch = 0;
    this.history = [];
    this.variables = { ...this.cfg.variables };
    this.highlights.clear();
    this.hidden.clear();
    this.shift = this.freshShift();
    this.aStopEngaged = false;
    this.holdRemaining = 0;
    this.positionLock = null;
    this.showLayer(0);
  }

  // ---------------------------------------------------------------- layers

  private showLayer(index: number, conditional: Phase["conditional"] = {}, always: string[] = []) {
    const layers = this.cfg.layers;
    if (!layers[index] || index < 0) index = 0;
    const layer = layers[index];
    if (!layer) return void this.history.push([]);
    const hasConditional = conditional && Object.keys(conditional).length > 0;
    const shown: string[] = [];
    for (const b of layer.buttons) {
      if (!hasConditional) {
        shown.push(b.uid);
        continue;
      }
      let display = always.includes(b.id);
      for (const [variable, valueMap] of Object.entries(conditional!)) {
        for (const [value, ids] of Object.entries(valueMap)) {
          if (ids.includes(b.id) && String(this.variables[variable]) === String(value)) display = true;
        }
      }
      if (display) shown.push(b.uid);
    }
    this.history.push(shown);
  }

  get currentLayerIndex(): number {
    const top = this.history[this.history.length - 1];
    if (!top?.length) return 0;
    return this.layerOf.get(top[0]) ?? 0;
  }

  // ---------------------------------------------------------------- clock

  /** The label shown on the timer and used as the action-id prefix. */
  get displayLabel(): string {
    const s = this.cfg.shifts;
    if (this.status === "pre") return "";
    if (!s?.enabled) return this.phaseLabel;
    if (this.time > s.startsAt) return this.phaseLabel;
    if (this.time > s.endsAt) {
      if (this.shift.pressed && this.time < s.startsAt) {
        return `${this.shift.current === "active" ? s.activeLabel : s.inactiveLabel} ${this.shift.number}`;
      }
      return this.phaseLabel;
    }
    return s.endLabel;
  }

  get prefix(): string {
    return this.cfg.prefixActionIds ? camelCase(this.displayLabel) : "";
  }

  get aStopUntil(): number {
    return this.cfg.aStop.until ?? this.phases[1]?.at ?? 0;
  }

  get aStopLocked(): boolean {
    return this.cfg.aStop.enabled && this.aStopEngaged && this.time > this.aStopUntil;
  }

  get holding(): boolean {
    return this.holdRemaining > 0;
  }

  get canUndo(): boolean {
    return this.queue.length > this.cfg.minQueueLength;
  }

  start(now: number) {
    this.status = "running";
    this.lastTick = now;
    this.phaseLabel = this.phases[0]?.label ?? "";
  }

  /** Advance the clock to wall time `now` (ms). Call every animation frame / 50 ms. */
  tick(now: number) {
    if (this.status !== "running") return;
    let dt = Math.max(0, now - this.lastTick) * this.speed;
    this.lastTick = now;
    if (this.holdRemaining > 0) {
      const used = Math.min(this.holdRemaining, dt);
      this.holdRemaining -= used;
      dt -= used;
    }
    this.time -= dt;
    this.applyPhases();
    this.updateShift();
    if (this.aStopEngaged && this.time <= this.aStopUntil) this.aStopEngaged = false;
    if (this.time <= 0) {
      this.time = 0;
      this.status = "done";
      this.doneAt = now;
    }
  }

  /** Jump to the end of the match (testing / builder preview). */
  skipTo(msRemaining: number, now: number) {
    if (this.status !== "running") return;
    this.time = Math.max(1, msRemaining);
    this.holdRemaining = 0;
    this.tick(now);
  }

  private applyPhases() {
    while (this.nextPhase < this.phases.length && this.time <= this.phases[this.nextPhase].at) {
      const p = this.phases[this.nextPhase++];
      this.epoch++;
      this.phaseLabel = p.label;
      for (const [k, v] of Object.entries(p.variables || {})) this.variables[k] = v;
      if (p.layer >= 0) this.showLayer(p.layer, p.conditional, p.always);
      // Freeze the clock at the phase boundary for the field-timer pause.
      if (p.holdMs && p.holdMs > 0) this.holdRemaining = p.holdMs;
    }
  }

  private updateShift() {
    const s = this.cfg.shifts;
    if (!s?.enabled || !this.shift.pressed) return;
    if (Math.abs(this.time - this.shift.lastSwitch) >= s.interval) {
      if (this.shift.current === "active") {
        this.shift.current = "inactive";
        this.shift.number = ++this.shift.inactiveCount;
      } else {
        this.shift.current = "active";
        this.shift.number = ++this.shift.activeCount;
      }
      this.shift.lastSwitch = this.time;
    }
  }

  // ---------------------------------------------------------------- rendering

  private zonePair(layerIndex: number): [ScoutButton, ScoutButton] | null {
    const zb = this.cfg.field.zoneButtons;
    if (!zb) return null;
    const layer = this.cfg.layers[layerIndex];
    const a = layer?.buttons.find((b) => b.id === zb[0]);
    const b = layer?.buttons.find((b) => b.id === zb[1]);
    return a && b ? [a, b] : null;
  }

  /** Effective id/label/area of a button after field-orientation and alliance swaps. */
  resolve(b: ScoutButton): Pick<RenderButton, "effectiveId" | "effectiveLabel" | "effectiveArea"> {
    const pair = this.zonePair(this.layerOf.get(b.uid) ?? -1);
    if (!pair || (b.uid !== pair[0].uid && b.uid !== pair[1].uid)) return { effectiveId: b.id, effectiveLabel: b.label, effectiveArea: b.area };
    const other = b.uid === pair[0].uid ? pair[1] : pair[0];
    return {
      effectiveId: this.ctx.alliance === "blue" ? other.id : b.id,
      effectiveLabel: this.ctx.alliance === "blue" ? other.label : b.label,
      effectiveArea: this.ctx.swapZones ? other.area : b.area,
    };
  }

  visibleButtons(): RenderButton[] {
    const top = this.history[this.history.length - 1] || [];
    const locked = this.aStopLocked;
    return top
      .filter((uid) => !this.hidden.has(uid))
      .map((uid) => this.byUid.get(uid)!)
      .filter(Boolean)
      .map((b) => ({
        ...b,
        ...this.resolve(b),
        highlighted: this.highlights.has(b.uid),
        disabled: locked && b.type !== "undo" && b.type !== "match-control",
        usesPosition: b.executables.some((e) => e.type === "position"),
      }));
  }

  /** Last three distinct runs of action ids, e.g. "autoStartShooting ➔ autoStopShooting (2)". */
  lastActions(): string {
    const runs: { id: string; n: number }[] = [];
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const id = this.queue[i].id;
      if (runs.length && runs[runs.length - 1].id === id) runs[runs.length - 1].n++;
      else if (runs.length < 3) runs.push({ id, n: 1 });
      else break;
    }
    return runs
      .reverse()
      .map((r) => r.id + (r.n > 1 ? ` (${r.n})` : ""))
      .join(" ➔ ");
  }

  isAStopButton(b: ScoutButton): boolean {
    const ids = this.cfg.aStop.buttonIds || [];
    if (ids.length) return ids.includes(b.id);
    return `${b.label} ${b.id}`.toLowerCase().replace(/[\s-]/g, "").includes("astop");
  }

  // ---------------------------------------------------------------- input

  press(uid: string, now: number): EngineEffect[] {
    const button = this.byUid.get(uid);
    if (!button) return [];
    const effects: EngineEffect[] = [];

    switch (button.type) {
      case "label":
        return effects;
      case "undo":
        this.undo(now);
        this.runExecutables(button, null, now, effects);
        return effects;
      case "match-control":
        if (this.status === "done") return [{ type: "submit" }];
        if (this.status === "running") return effects;
        this.aStopEngaged = false;
        this.record(button, button.id, true);
        this.start(now);
        effects.push({ type: "started" });
        this.runExecutables(button, this.queue[this.queue.length - 1], now, effects);
        return effects;
      default: {
        if (this.aStopLocked) return effects;
        const { effectiveId } = this.resolve(button);
        const temp = button.type === "none";
        const entry = this.record(button, temp ? effectiveId : this.prefix + effectiveId, temp);
        if (temp && this.cfg.shifts?.enabled) this.handleShiftButton(button.id);
        if (!temp && this.cfg.aStop.enabled && this.isAStopButton(button) && this.time > this.aStopUntil) {
          this.aStopEngaged = true;
          entry.undo.engagedAStop = true;
        }
        this.runExecutables(button, entry, now, effects);
        return effects;
      }
    }
  }

  private handleShiftButton(id: string) {
    const s = this.cfg.shifts;
    if (id === s.activeButtonId) {
      this.shift.current = "active";
      this.shift.number = ++this.shift.activeCount;
    } else if (id === s.inactiveButtonId) {
      this.shift.current = "inactive";
      this.shift.number = ++this.shift.inactiveCount;
    } else return;
    this.shift.lastSwitch = this.time;
    this.shift.pressed = true;
  }

  private record(button: ScoutButton, id: string, temp: boolean): QueueEntry {
    const entry: QueueEntry = {
      id,
      baseId: button.id,
      uid: button.uid,
      ts: Math.round(this.time),
      ...(temp ? { temp: true } : {}),
      undo: {
        historyMark: this.history.length,
        epoch: this.epoch,
        highlights: [...this.highlights],
        hidden: [...this.hidden],
        shift: { ...this.shift },
        vars: [],
        extra: 0,
        engagedAStop: false,
      },
    };
    this.queue.push(entry);
    return entry;
  }

  private runExecutables(button: ScoutButton, entry: QueueEntry | null, now: number, effects: EngineEffect[]) {
    for (const ex of button.executables) {
      const a = ex.args || [];
      switch (ex.type) {
        case "layer":
          this.showLayer(Number(a[1]));
          break;
        case "conditionalLayer":
          this.showLayer(Number(a[1]), (a[3] as Phase["conditional"]) || {}, (a[2] as string[]) || []);
          break;
        case "setVariable": {
          const name = String(a[0]);
          entry?.undo.vars.push([name, this.variables[name]]);
          this.variables[name] = a[1] as VariableValue;
          break;
        }
        case "climbHighlight": {
          for (const b of this.byUid.values()) if (b.executables.some((e) => e.type === "climbHighlight")) this.highlights.delete(b.uid);
          this.highlights.add(button.uid);
          break;
        }
        case "clearHighlight":
          this.highlights.delete(button.uid);
          break;
        case "hide":
          this.hidden.add(button.uid);
          break;
        case "multiplier": {
          if (!entry) break;
          const n = Math.max(1, Number(a[0]) || 1);
          // Copies are marked extra = -1 so undo removes them together with the original.
          for (let i = 0; i < n - 1; i++) this.queue.push({ ...entry, undo: { ...entry.undo, extra: -1 } });
          entry.undo.extra = n - 1;
          break;
        }
        case "constantPosition":
          if (entry) entry.other = { ...(entry.other || {}), pos: a[0] as { x: number; y: number } };
          break;
        case "position": {
          if (!entry) break;
          if (this.positionLock && this.positionLock.until > now) {
            entry.other = { ...(entry.other || {}), pos: this.positionLock.pos };
            this.positionLock.until = now + this.cfg.positionLockMs;
            effects.push({ type: "positionReused" });
          } else {
            effects.push({ type: "requestPosition", entryIndex: this.queue.indexOf(entry) });
          }
          break;
        }
      }
    }
  }

  /** Called by the UI after the scouter taps the field map. */
  setPosition(entryIndex: number, pos: { x: number; y: number }, now: number) {
    const entry = this.queue[entryIndex];
    if (!entry) return;
    entry.other = { ...(entry.other || {}), pos };
    if (this.cfg.positionLockMs > 0) this.positionLock = { pos, until: now + this.cfg.positionLockMs };
  }

  get positionLockActive(): boolean {
    return !!this.positionLock && this.positionLock.until > Date.now();
  }

  undo(now: number) {
    if (!this.canUndo) return;
    let entry = this.queue.pop()!;
    while (entry.undo.extra === -1 && this.queue.length) entry = this.queue.pop()!;
    const button = this.byUid.get(entry.uid);
    if (button?.type === "match-control") {
      const kept = this.queue.slice();
      this.reset();
      this.queue = kept;
      this.lastTick = now;
      return;
    }
    // Layers: only roll back when still in the same phase; otherwise stay on the phase's layer.
    if (entry.undo.epoch === this.epoch && this.history.length > entry.undo.historyMark) {
      this.history.length = Math.max(1, entry.undo.historyMark);
    }
    for (const [name, prev] of entry.undo.vars.reverse()) {
      if (prev === undefined) delete this.variables[name];
      else this.variables[name] = prev;
    }
    this.highlights = new Set(entry.undo.highlights);
    this.hidden = new Set(entry.undo.hidden);
    if (this.cfg.shifts?.enabled && button && [this.cfg.shifts.activeButtonId, this.cfg.shifts.inactiveButtonId].includes(button.id)) {
      this.shift = { ...entry.undo.shift };
    }
    if (entry.undo.engagedAStop) this.aStopEngaged = false;
  }

  // ---------------------------------------------------------------- output

  /** Final action list for submission: temp actions removed, times clamped to >= 0. */
  submittedActions(): Action[] {
    return this.queue
      .filter((a) => !a.temp)
      .map((a) => ({ id: a.id, ts: Math.max(0, Math.round(a.ts)), ...(a.other ? { other: a.other } : {}) }));
  }

  /** Timer / match-control label. */
  controlLabel(now: number): string {
    const m = this.cfg.messages;
    if (this.status === "pre") return m.start;
    if (this.status === "done") return now - this.doneAt < 2000 ? m.complete : m.submit;
    const text = m.running.replace("{time}", (this.time / 1000).toFixed(2)).replace("{phase}", this.displayLabel);
    return this.holding ? `${m.hold} | ${this.displayLabel}` : text;
  }

  getVariables() {
    return { ...this.variables };
  }
}
