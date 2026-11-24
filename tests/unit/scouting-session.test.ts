/**
 * The scouting rules (docs/spec/05) as a state machine: src/scouting/session.ts and view.ts
 * (#322). Each describe names the requirement it checks; "v6" marks a rule doc 05 records under
 * "v6: the scouting rules".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { convertMatchScouting } from "@/config/convert/v1-to-v2";
import { deriveKnownActionIds } from "@/config/knownActionIds";
import type { MatchScoutingConfig } from "@/config/types";
import { compositeActionId, placeAt } from "@/data/phase";
import { DEFAULT_TENANT, NOT_FLAGGED, type TeamMatchPerformance } from "@/data/types";
import { validateDocument } from "@/data/validate";
import { Random } from "@/generate/random";
import {
  canUndo,
  currentScreen,
  DEFAULT_SETTINGS,
  initialState,
  isShown,
  placePosition,
  press,
  recordedActions,
  setSpeed,
  skip,
  advance,
  type ScoutingContext,
  type ScoutingSettings,
  type SessionState,
} from "@/scouting/session";
import { tapOnMap } from "@/scouting/map";
import { clockLabel, periodLabel, readout, screenButtons } from "@/scouting/view";

const read = (path: string) => JSON.parse(readFileSync(join(process.cwd(), path), "utf8"));
const c2026 = read("config/match-scouting.json") as MatchScoutingConfig;
const c2025 = read("config/seasons/2025/match-scouting.json") as MatchScoutingConfig;
const v1 = (year: string) =>
  convertMatchScouting(read(`config/v1/match-scouting-${year}.json`)).config;
const c2022 = v1("2022");
const c2023 = v1("2023");

/** A scouter playing a match: presses at given real times, starting the clock at 1000. */
class Match {
  state: SessionState;
  now = 0;
  readonly context: ScoutingContext;

  constructor(config: MatchScoutingConfig, settings: Partial<ScoutingSettings> = {}) {
    this.context = { config, settings: { ...DEFAULT_SETTINGS, ...settings } };
    this.state = initialState(config);
  }

  get layer() {
    return currentScreen(this.state).layer;
  }

  press(button: string, layer = this.layer) {
    this.state = press(this.state, this.context, { layer, button }, this.now);
    return this;
  }

  start() {
    this.now = 1000;
    return this.press("startGame");
  }

  /** Let the clock run until `ts` remaining (at speed 1, with no holds). */
  until(ts: number) {
    this.now = 1000 + (this.context.config.timing.totalMs - ts);
    this.state = advance(this.state, this.context, this.now);
    return this;
  }

  undo() {
    return this.press("undo");
  }

  actions() {
    return recordedActions(this.state);
  }
}

describe("SC-14, SC-17: the screen before the match", () => {
  it("shows the initial layer, with the clock stopped and the start control's own label", () => {
    const m = new Match(c2026);
    expect(m.state.status).toBe("pre-match");
    expect(m.layer).toBe("layer-0");
    const views = screenButtons(m.state, m.context, 0);
    expect(views.map((b) => b.id)).toEqual(["startGame", "preloadFuel", "preloadNone"]);
    expect(views[0].label).toBe("Start Match");
    expect(views[0].gridArea).toEqual([2, 1, 4, 12]);
  });

  it("records a press before the match with no period and the full time (DM-3)", () => {
    const m = new Match(c2026).press("preloadFuel");
    expect(m.actions()).toEqual([
      {
        id: "preloadFuel",
        ts: 160000,
        phase: null,
        segment: null,
        segmentKind: null,
        segmentIndex: null,
      },
    ]);
  });
});

describe("SC-19, SC-20: the clock runs the phases", () => {
  it("starts on the match control and enters each phase and segment as the clock reaches it", () => {
    const m = new Match(c2026).start();
    expect(m.state.status).toBe("running");
    expect(m.layer).toBe("layer-1"); // the start control's layer executable
    m.until(159999);
    expect(m.state.placement.phase).toBe("auto");
    expect(m.layer).toBe("layer-1");
    m.until(140000);
    expect(m.state.placement).toMatchObject({ phase: "teleop", segment: "transition" });
    expect(m.layer).toBe("layer-7");
    m.until(130000);
    expect(m.state.placement).toMatchObject({ segment: "shift", segmentIndex: 1 });
    expect(m.layer).toBe("layer-2");
    m.until(29000);
    expect(m.state.placement.phase).toBe("endgame");
    expect(m.layer).toBe("layer-2"); // endgame has no layer of its own
  });

  it("ends at 0, says Match Complete, then Submit Match, and submits on the next press", () => {
    const m = new Match(c2025).start().until(0);
    expect(m.state.status).toBe("ended");
    const control = c2025.layout.layers[2].buttons[0];
    expect(clockLabel(m.state, m.context, control, m.now)).toBe("Match Complete");
    expect(clockLabel(m.state, m.context, control, m.now + 2000)).toBe("Submit Match");
    m.press("startGame");
    expect(m.state.status).toBe("submitted");
  });

  it("v6: a phase's variables and conditional screen apply when it begins (2023)", () => {
    const m = new Match(c2023).start().until(29000);
    expect(m.state.variables.showPark).toBe("true");
    expect(isShown(m.state, { layer: "layer-1", button: "park" })).toBe(true);
  });
});

describe("SC-21: the clock's label", () => {
  it("shows the seconds left and the period, with a selected shift kind and its slot", () => {
    const m = new Match(c2026).start().until(150000);
    const control = c2026.layout.layers[1].buttons[0];
    expect(clockLabel(m.state, m.context, control, m.now)).toBe("150.00 | Auto");
    m.until(135000);
    expect(periodLabel(m.state, c2026)).toBe("Teleop Transition");
    m.until(129000);
    expect(periodLabel(m.state, c2026)).toBe("Teleop"); // no kind chosen yet
    m.press("teleopActive");
    expect(periodLabel(m.state, c2026)).toBe("Active Shift 1");
    m.until(100000);
    expect(periodLabel(m.state, c2026)).toBe("Inactive Shift 2");
    m.until(20000);
    expect(periodLabel(m.state, c2026)).toBe("Endgame");
  });
});

describe("SC-22 (v6, #326): segment kinds", () => {
  it("records the selected kind and the clock slot; an alternating kind moves on each slot", () => {
    const m = new Match(c2026).press("preloadFuel").start().until(129000).press("teleopActive");
    m.press("Defense").press("RatingDefense3").until(100000).press("Defense");
    const defense = m.actions().filter((a) => a.id === "Defense");
    expect(defense.map((a) => [a.segmentKind, a.segmentIndex])).toEqual([
      ["active", 1],
      ["inactive", 2],
    ]);
  });

  it("a later toggle selects that kind from then on, and the toggles themselves record nothing", () => {
    const m = new Match(c2026).start().until(129000).press("teleopActive");
    m.until(100000);
    m.state = { ...m.state, screens: [{ layer: "layer-2", visible: null, openedBy: null }] };
    m.press("teleopActive").press("Defense");
    expect(m.actions().map((a) => [a.id, a.segmentKind, a.segmentIndex])).toEqual([
      ["Defense", "active", 2],
    ]);
  });
});

describe("SC-23 (v6, CS-16): what a press records", () => {
  it("records the button id, the time left and the period beside it (DV-1)", () => {
    const m = new Match(c2025).start().until(140000).press("autoGroundPickupCoral");
    expect(m.actions()).toEqual([
      {
        id: "autoGroundPickupCoral",
        ts: 140000,
        phase: "auto",
        segment: null,
        segmentKind: null,
        segmentIndex: null,
      },
    ]);
  });
});

describe("SC-24 (v6): undo", () => {
  it("is refused while the queue holds no more than the configured minimum", () => {
    const m = new Match(c2026).start().until(150000).press("Broken");
    expect(m.state.queue).toHaveLength(2);
    expect(canUndo(m.state, c2026)).toBe(false);
    m.undo();
    expect(m.actions()).toHaveLength(1);
  });

  it("takes back the last press and returns to the screen before it", () => {
    const m = new Match(c2026).press("preloadFuel").start().until(150000);
    m.press("Storing");
    expect(m.layer).toBe("layer-4");
    m.undo();
    expect(m.layer).toBe("layer-1");
    expect(m.actions().map((a) => a.id)).toEqual(["preloadFuel"]);
  });

  it("leaves the screen a later phase opened: undoing an auto press in teleop stays in teleop", () => {
    const m = new Match(c2026).press("preloadFuel").start().until(150000).press("Storing");
    m.until(139000);
    expect(m.layer).toBe("layer-7");
    m.undo();
    expect(m.layer).toBe("layer-7");
    expect(m.actions().map((a) => a.id)).toEqual(["preloadFuel"]);
  });

  it("puts back a selected kind", () => {
    const m = new Match(c2026).press("preloadFuel").start().until(129000).press("teleopActive");
    m.undo();
    expect(m.state.kinds).toEqual({});
    expect(m.layer).toBe("layer-2");
  });

  it("undoing the start returns to before the match", () => {
    const config = { ...c2025, rules: { ...c2025.rules, undo: { minQueueLength: 0 } } };
    const m = new Match(config).start().until(150000);
    expect(m.layer).toBe("layer-1");
    m.undo();
    expect(m.state.status).toBe("pre-match");
    expect(m.state.ts).toBe(153000);
    expect(m.layer).toBe("layer-0");
  });
});

describe("SC-25, SC-26, SC-30, SC-31: layers, conditional layers and variables (2023)", () => {
  it("shows only the buttons the variables allow, and undo restores both", () => {
    const m = new Match(c2023).press("prePickupCone", "layer-0").start().until(140000);
    const shown = () => screenButtons(m.state, m.context, m.now).map((b) => b.id);
    expect(shown()).toContain("dropCone");
    expect(shown()).not.toContain("conePickup");
    m.press("placement31");
    expect(m.state.variables.heldPiece).toBe("none");
    expect(shown()).toContain("conePickup");
    expect(shown()).not.toContain("dropCone");
    m.undo();
    expect(m.state.variables.heldPiece).toBe("cone");
    expect(shown()).toContain("dropCone");
  });

  it("closes every screen a press opened (park opens two)", () => {
    const m = new Match(c2023).start().until(20000);
    const depth = m.state.screens.length;
    m.press("park");
    expect(m.state.screens).toHaveLength(depth + 2);
    m.undo();
    expect(m.state.screens).toHaveLength(depth);
    expect(m.state.variables.showPark).toBe("true");
  });
});

describe("SC-27 (v6): locks", () => {
  it("A-Stop disables every button but undo and the match control until teleop begins", () => {
    const m = new Match(c2026).press("preloadFuel").start().until(150000).press("aStop");
    expect(m.state.lock?.lock.id).toBe("aStop");
    const views = screenButtons(m.state, m.context, m.now);
    expect(views.find((b) => b.id === "StartShooting")?.disabled).toBe(true);
    expect(views.find((b) => b.id === "undo")?.disabled).toBe(false);
    m.press("StartShooting");
    expect(m.actions().map((a) => a.id)).toEqual(["preloadFuel", "aStop"]);
    m.until(140000);
    expect(m.state.lock).toBeNull();
  });

  it("undoing the trigger releases the lock", () => {
    const m = new Match(c2026).press("preloadFuel").start().until(150000).press("aStop");
    m.undo();
    expect(m.state.lock).toBeNull();
  });
});

describe("SC-28 (v6): alliance-relative buttons", () => {
  it("on blue, the button in a place records and shows its partner", () => {
    const m = new Match(c2026, { alliance: "blue" }).press("preloadFuel").start().until(139000);
    const azone = screenButtons(m.state, m.context, m.now).find((b) => b.id === "AZone")!;
    expect(azone.label).toBe("Opposing Zone");
    m.press("AZone");
    expect(m.actions().at(-1)?.id).toBe("OAZone");
    expect(readout(m.state).at(-1)).toBe("OAZone");
  });

  it("a flipped field swaps their places and turns the map, not what they record", () => {
    const m = new Match(c2026, { fieldFlipped: true }).start().until(139000);
    const views = screenButtons(m.state, m.context, m.now);
    expect(views.find((b) => b.id === "AZone")?.gridArea).toEqual([2, 9, 3, 14]);
    expect(views.find((b) => b.id === "OAZone")?.gridArea).toEqual([2, 1, 3, 5]);
    m.press("AZone");
    expect(m.actions().at(-1)?.id).toBe("AZone");
  });
});

describe("SC-32, SC-31a: field positions", () => {
  it("waits for a tap on the map, and stores it on the action", () => {
    const m = new Match(c2026).start().until(139000).press("StartShooting");
    expect(m.state.awaitingPosition).toBe(1);
    m.press("Defense"); // the map covers the screen
    expect(m.actions()).toHaveLength(1);
    m.state = placePosition(m.state, m.context, { x: 30.4, y: 140 }, m.now);
    expect(m.actions()[0].other).toEqual({ pos: { x: 30, y: 100 } });
  });

  it("reuses the last position within the lock window, and asks again after it", () => {
    const m = new Match(c2022).start().until(140000).press("groundPickup");
    m.state = placePosition(m.state, m.context, { x: 10, y: 20 }, m.now);
    const locked = () =>
      screenButtons(m.state, m.context, m.now)
        .filter((b) => b.positionLocked)
        .map((b) => b.id);
    expect(locked()).toContain("upperHub"); // the buttons that take a position flash
    expect(locked()).not.toContain("undo");
    m.now += 500;
    m.press("upperHub");
    expect(m.state.awaitingPosition).toBeNull();
    expect(m.actions()[1].other).toEqual({ pos: { x: 10, y: 20 } });
    m.now += 1600;
    expect(locked()).toEqual([]);
    m.press("lowerHub");
    expect(m.state.awaitingPosition).toBe(3);
  });

  it("measures a tap against the image drawn inside the map's box", () => {
    // A 2:1 map in a 400 × 400 box is drawn 400 × 200, 100 from the top.
    const box = { left: 10, top: 20, width: 400, height: 400 };
    expect(tapOnMap(box, 2, 10, 120)).toEqual({ x: 0, y: 0 });
    expect(tapOnMap(box, 2, 210, 220)).toEqual({ x: 50, y: 50 });
    expect(tapOnMap(box, 2, 410, 320)).toEqual({ x: 100, y: 100 });
    // A 1:2 map in the same box is drawn 200 × 400, 100 from the left.
    expect(tapOnMap(box, 0.5, 160, 120)).toEqual({ x: 25, y: 25 });
    // An unknown ratio fills the box.
    expect(tapOnMap(box, 0, 110, 120)).toEqual({ x: 25, y: 25 });
  });

  it("stores the position as the field reads, when the map is turned", () => {
    const m = new Match(c2022, { fieldFlipped: true }).start().until(140000).press("miss");
    m.state = placePosition(m.state, m.context, { x: 10, y: 20 }, m.now);
    expect(m.actions()[0].other).toEqual({ pos: { x: 90, y: 80 } });
  });
});

describe("SC-34, SC-35, SC-36: highlights and hiding", () => {
  it("highlights one button of a group, on every layer that has it; clearHighlight ends it", () => {
    const m = new Match(c2026).press("preloadFuel").start().until(150000).press("StartShooting");
    expect(m.state.highlights).toEqual(["StartShooting"]);
    m.until(139000);
    const teleop = screenButtons(m.state, m.context, m.now);
    expect(teleop.find((b) => b.id === "StartShooting")?.highlighted).toBe(true);
    m.press("StopShooting");
    expect(m.state.highlights).toEqual([]);
    m.undo();
    expect(m.state.highlights).toEqual(["StartShooting"]);
  });

  it("hide removes a button from its layer until undone (2022)", () => {
    const m = new Match(c2022).start().until(145000).press("leaveTarmac");
    expect(isShown(m.state, { layer: "layer-1", button: "leaveTarmac" })).toBe(false);
    m.undo();
    expect(isShown(m.state, { layer: "layer-1", button: "leaveTarmac" })).toBe(true);
  });
});

describe("SC-37: multiplier", () => {
  it("records the action as many times as the count, and undo takes them all", () => {
    const config = structuredClone(c2025);
    config.layout.layers[1].buttons.find((b) => b.id === "leave")!.executables = [
      { type: "multiplier", count: 3 },
    ];
    const m = new Match(config).press("preloadCoral").start().until(150000).press("leave");
    expect(m.actions().filter((a) => a.id === "leave")).toHaveLength(3);
    m.undo();
    expect(m.actions().filter((a) => a.id === "leave")).toHaveLength(0);
  });
});

describe("SC-2: the last-actions readout", () => {
  it("shows the last three runs, with a count for repeats, temp presses included", () => {
    const m = new Match(c2026).press("preloadFuel").start().until(150000);
    m.press("Broken").press("Broken").press("Broken");
    expect(readout(m.state)).toEqual(["preloadFuel", "startGame", "Broken (3)"]);
  });
});

describe("BL-298 and the preview's speed and skip controls", () => {
  it("holds the clock at a phase with pauseMs, and skip ends the hold", () => {
    const config = structuredClone(c2025);
    config.timing.phases[1].pauseMs = 3000;
    const m = new Match(config).start().until(135000);
    expect(m.state.holding).toBe(3000);
    m.now += 1000;
    m.state = advance(m.state, m.context, m.now);
    expect(m.state.ts).toBe(135000);
    m.state = skip(m.state, m.context, m.now);
    expect(m.state.holding).toBeNull();
    expect(m.state.ts).toBe(135000);
  });

  it("skips to the next phase, segment or shift, and plays faster", () => {
    const m = new Match(c2026).start();
    m.state = skip(m.state, m.context, m.now);
    expect(m.state.ts).toBe(159999);
    m.state = skip(m.state, m.context, m.now);
    expect(m.state.placement.phase).toBe("teleop");
    expect(m.layer).toBe("layer-7");
    m.state = setSpeed(m.state, m.context, m.now, 10);
    m.state = advance(m.state, m.context, m.now + 1000);
    expect(m.state.ts).toBe(130000);
    m.state = skip(m.state, m.context, m.now + 1000, 0);
    expect(m.state.status).toBe("ended");
  });
});

describe("v6: a played match records what the data model and the configuration allow", () => {
  /** Press random buttons through a whole match, tapping the map when it asks. */
  function playRandomly(
    config: MatchScoutingConfig,
    seed: string,
    settings?: Partial<ScoutingSettings>,
  ) {
    const random = new Random(seed);
    const m = new Match(config, settings);
    m.now = 1000;
    // Before the match a few presses, then the start; then presses until the clock runs out.
    for (let step = 0; step < 5000 && m.state.status !== "ended"; step++) {
      if (m.state.awaitingPosition !== null) {
        const tap = { x: random.int(0, 100), y: random.int(0, 100) };
        m.state = placePosition(m.state, m.context, tap, m.now);
        continue;
      }
      const views = screenButtons(m.state, m.context, m.now).filter(
        (b) => !b.disabled && b.type !== "label",
      );
      const weight = (type: string) =>
        type === "match-control"
          ? m.state.status === "pre-match"
            ? 3
            : 0
          : type === "undo"
            ? 1
            : 6;
      const pick = random.pickWeighted(views, (b) => weight(b.type));
      if (pick) m.press(pick.id, pick.layer);
      if (m.state.status === "running") m.now += random.int(200, 3000);
      m.state = advance(m.state, m.context, m.now);
    }
    // Then submit, from whatever screen the match ended on.
    m.now += 3000;
    const control = screenButtons(m.state, m.context, m.now).find(
      (b) => b.type === "match-control",
    );
    if (control) m.press(control.id, control.layer);
    return m;
  }

  it.each([
    ["2022", c2022],
    ["2023", c2023],
    ["2025", c2025],
    ["2026", c2026],
  ])("%s", (_year, config) => {
    const known = new Set(deriveKnownActionIds(config));
    for (const seed of ["a", "b", "c"]) {
      for (const settings of [
        DEFAULT_SETTINGS,
        { alliance: "blue" as const, fieldFlipped: true },
      ]) {
        const m = playRandomly(config, seed, settings);
        const actions = m.actions();
        // It played: through to submission, recording in more than one phase.
        expect(m.state.status).toBe("submitted");
        expect(new Set(actions.map((a) => a.phase)).size).toBeGreaterThanOrEqual(2);
        let last = Infinity;
        for (const a of actions) {
          // SY-4's check, for the client: the period agrees with the clock, and the composite id
          // v5 would have recorded is one the configuration can derive.
          const placed = a.phase === null ? null : placeAt(config, a.ts);
          if (placed)
            expect([placed.phase, placed.segment, placed.segmentIndex]).toEqual([
              a.phase,
              a.segment,
              a.segmentIndex,
            ]);
          expect(known.has(compositeActionId(config, a.id, a))).toBe(true);
          expect(a.ts).toBeLessThanOrEqual(last);
          last = a.ts;
        }
        const performance: TeamMatchPerformance = {
          _id: "0123456789abcdef01234567",
          tenantId: DEFAULT_TENANT,
          eventId: "0123456789abcdef01234568",
          level: "qual",
          matchNumber: 1,
          team: "3061",
          scouterId: "900001",
          source: "app",
          clientVersion: "6.0.0",
          submittedAt: m.now,
          matchKey: "1-3061-900001-abc",
          nonce: "abc",
          coverage: "full",
          superseded: false,
          flag: { ...NOT_FLAGGED },
          notes: null,
          tags: [],
          actions,
        };
        expect(validateDocument("team-match-performance", performance).issues).toEqual([]);
      }
    }
  });
});
