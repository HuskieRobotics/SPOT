/**
 * T-2: placing an action in the match from the clock, and recovering it from a composite id.
 * The clock counts DOWN, so a phase begins when the time remaining reaches its startMs; getting
 * that direction backwards is an easy mistake and every migrated action depends on it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compositeActionId,
  placeAt,
  prefixTable,
  repeatIndexAt,
  splitActionId,
} from "@/data/phase";
import type { MatchScoutingConfig, Segment } from "@/config/types";

const load = (...p: string[]) =>
  JSON.parse(readFileSync(join(process.cwd(), ...p), "utf8")) as MatchScoutingConfig;
const config2026 = load("config", "match-scouting.json");
const config2025 = load("config", "seasons", "2025", "match-scouting.json");

describe("placing an action by the clock (2026)", () => {
  it("has no phase before the first one begins", () => {
    expect(placeAt(config2026, 160000).phase).toBeNull();
  });

  it("enters a phase exactly when the countdown reaches its startMs", () => {
    expect(placeAt(config2026, 159999).phase).toBe("auto");
    expect(placeAt(config2026, 150000).phase).toBe("auto");
    expect(placeAt(config2026, 140001).phase).toBe("auto");
    expect(placeAt(config2026, 140000).phase).toBe("teleop");
    expect(placeAt(config2026, 30001).phase).toBe("teleop");
    expect(placeAt(config2026, 30000).phase).toBe("endgame");
    expect(placeAt(config2026, 0).phase).toBe("endgame");
  });

  it("picks the segment and the shift index inside teleop", () => {
    expect(placeAt(config2026, 140000)).toMatchObject({ phase: "teleop", segment: "transition" });
    expect(placeAt(config2026, 130000)).toMatchObject({ segment: "shift", segmentIndex: 1 });
    // each shift is 25 s of elapsed teleop, so a shift begins exactly on its boundary
    expect(placeAt(config2026, 105001)).toMatchObject({ segment: "shift", segmentIndex: 1 });
    expect(placeAt(config2026, 105000)).toMatchObject({ segment: "shift", segmentIndex: 2 });
    expect(placeAt(config2026, 80000)).toMatchObject({ segment: "shift", segmentIndex: 3 });
    expect(placeAt(config2026, 55000)).toMatchObject({ segment: "shift", segmentIndex: 4 });
    expect(placeAt(config2026, 30001)).toMatchObject({ segment: "shift", segmentIndex: 4 });
    // endgame is its own phase, so no segment survives into it
    expect(placeAt(config2026, 20000)).toMatchObject({ phase: "endgame", segment: null });
  });

  it("caps the repeat index at the configured count", () => {
    const shift = config2026.timing.phases[1].segments!.find((s) => s.id === "shift") as Segment;
    expect(repeatIndexAt(shift, 31000)).toBe(shift.repeat!.count);
  });

  it("the clock alone cannot know which kind of shift the scouter chose", () => {
    expect(placeAt(config2026, 120000).segmentKind).toBeNull();
  });
});

describe("placing an action by the clock (2025, a season with no prefixes)", () => {
  it("still resolves the two phases", () => {
    expect(placeAt(config2025, 153000).phase).toBeNull();
    expect(placeAt(config2025, 152999).phase).toBe("auto");
    expect(placeAt(config2025, 135000).phase).toBe("teleop");
    expect(placeAt(config2025, 1).phase).toBe("teleop");
  });
});

describe("splitting a composite id", () => {
  it("recovers the button and the period from a shift id", () => {
    expect(splitActionId(config2026, "activeShift2Storing")).toEqual({
      baseId: "Storing",
      known: true,
      phase: "teleop",
      segment: "shift",
      segmentKind: "active",
      segmentIndex: 2,
    });
  });

  it("prefers the longer prefix when one prefix starts with another", () => {
    // "teleopTransition" must not be read as "teleop" + "TransitionStoring"
    expect(splitActionId(config2026, "teleopTransitionStoring")).toMatchObject({
      baseId: "Storing",
      segment: "transition",
    });
    expect(splitActionId(config2026, "teleopStoring")).toMatchObject({
      baseId: "Storing",
      phase: "teleop",
      segment: null,
    });
  });

  it("handles the auto and endgame phases", () => {
    expect(splitActionId(config2026, "autoAttemptL1")).toMatchObject({
      baseId: "AttemptL1",
      phase: "auto",
    });
    expect(splitActionId(config2026, "endgameAttemptClimb")).toMatchObject({
      baseId: "AttemptClimb",
      phase: "endgame",
    });
  });

  it("returns an unprefixed id unchanged, with no placement", () => {
    const split = splitActionId(config2025, "teleopGroundPickupCoral");
    expect(split.baseId).toBe("teleopGroundPickupCoral");
    expect(split.known).toBe(true);
    expect(split.phase).toBeNull();
  });

  it("reports an id the configuration cannot explain", () => {
    expect(splitActionId(config2026, "autoTowerRobot_None")).toMatchObject({ known: false });
  });

  it("round-trips every derived prefix back to the recorded id", () => {
    for (const entry of prefixTable(config2026)) {
      if (entry.prefix === "") continue;
      const recorded = `${entry.prefix}Storing`;
      const split = splitActionId(config2026, recorded);
      if (!split.known) continue;
      expect(compositeActionId(config2026, split.baseId, split)).toBe(recorded);
    }
  });
});
