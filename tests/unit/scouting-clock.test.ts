/**
 * The match clock (docs/spec/05 SC-19 to SC-21, BL-298, NF-3): src/scouting/clock.ts.
 */
import { describe, expect, it } from "vitest";
import type { MatchScoutingConfig } from "@/config/types";
import {
  boundaries,
  nextBoundary,
  progressFor,
  progressOf,
  readClock,
  startClock,
  STOPPED,
  withProgress,
  withSpeed,
} from "@/scouting/clock";

function config(pauseMs?: number): MatchScoutingConfig {
  return {
    version: 2,
    timing: {
      totalMs: 150000,
      phases: [
        { id: "auto", label: "Auto", startMs: 149999, prefix: "" },
        {
          id: "teleop",
          label: "Teleop",
          startMs: 135000,
          prefix: "",
          ...(pauseMs ? { pauseMs } : {}),
          segments: [{ id: "shift", startMs: 130000, repeat: { intervalMs: 25000, count: 4 } }],
        },
      ],
    },
    variables: {},
    rules: {
      undo: { minQueueLength: 1 },
      positionLockMs: 1000,
      locks: [],
      allianceRelativeButtons: [],
      fieldMap: { image: "/img/field.svg" },
    },
    layout: { rows: 1, columns: 1, initialLayer: "layer-0", layers: [] },
    extraActionIds: [],
  };
}

describe("SC-20, NF-3: time remaining comes from elapsed time", () => {
  it("counts down from the match length and stops at 0", () => {
    expect(readClock(config(), 0)).toEqual({ remaining: 150000, holding: null });
    expect(readClock(config(), 15000).remaining).toBe(135000);
    expect(readClock(config(), 149000).remaining).toBe(1000);
    expect(readClock(config(), 999999).remaining).toBe(0);
  });

  it("reads progress from the real time since the start, at any speed", () => {
    const clock = startClock(10_000);
    expect(progressOf(clock, 10_000)).toBe(0);
    expect(progressOf(clock, 12_500)).toBe(2500);
    const fast = withSpeed(clock, 12_500, 4);
    expect(progressOf(fast, 13_500)).toBe(6500);
    expect(progressOf(STOPPED, 99_999)).toBe(0);
    expect(progressOf(withProgress(clock, 20_000, 100_000), 20_010)).toBe(100_010);
  });
});

describe("SC-21a, BL-298: a phase with pauseMs holds the clock at its start", () => {
  it("shows the phase's start for the hold, then counts down again", () => {
    const c = config(3000);
    expect(readClock(c, 14999)).toEqual({ remaining: 135001, holding: null });
    expect(readClock(c, 15000)).toEqual({ remaining: 135000, holding: 3000 });
    expect(readClock(c, 17999)).toEqual({ remaining: 135000, holding: 1 });
    expect(readClock(c, 18000)).toEqual({ remaining: 135000, holding: null });
    expect(readClock(c, 19000).remaining).toBe(134000);
    expect(readClock(c, 153000).remaining).toBe(0);
  });

  it("progressFor is the inverse, landing at the start of a hold", () => {
    const c = config(3000);
    for (const ts of [150000, 140000, 135001, 135000, 134999, 60000, 0]) {
      expect(readClock(c, progressFor(c, ts)).remaining).toBe(ts);
    }
    expect(readClock(c, progressFor(c, 135000)).holding).toBe(3000);
  });
});

describe("the preview's skip control", () => {
  it("knows every phase, segment and repeat boundary, and the end", () => {
    expect(boundaries(config())).toEqual([149999, 135000, 130000, 105000, 80000, 55000, 0]);
    expect(nextBoundary(config(), 150000)).toBe(149999);
    expect(nextBoundary(config(), 130000)).toBe(105000);
    expect(nextBoundary(config(), 1000)).toBe(0);
  });
});
