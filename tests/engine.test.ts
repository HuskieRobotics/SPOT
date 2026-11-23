import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ScoutingEngine } from "@/lib/scouting/engine";
import { projectFromLegacy, convertLegacyScouting } from "@/lib/project/legacy";
import { blankProject } from "@/lib/project/defaults";
import { synthesizeEvent } from "@/lib/scouting/synthetic";
import { runPipeline } from "@/lib/analysis/pipeline";
import { decodeTmp, encodeTmp } from "@/lib/scouting/qr";
import { allActionIds } from "@/lib/scouting/ids";
import { validateProject } from "@/lib/project/validate";
import { calculatePredictedScore, calculateScouterAccuracy } from "@/lib/scoring";
import type { ScoutingConfig } from "@/lib/types";

const root = path.resolve(__dirname, "..");
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const cfg2026 = () => convertLegacyScouting(read("presets/2026/match-scouting.json"));

const byId = (e: ScoutingEngine, id: string) => {
  const b = e.visibleButtons().find((x) => x.id === id);
  if (!b) throw new Error(`button ${id} not visible; visible: ${e.visibleButtons().map((x) => x.id).join(",")}`);
  return b.uid;
};
const ids = (e: ScoutingEngine) => e.queue.map((a) => a.id);

describe("legacy conversion", () => {
  it("turns the 2026 hidden catalog layer into knownActionIds and detects game features", () => {
    const c = cfg2026();
    expect(c.layers.length).toBe(12);
    expect(c.knownActionIds).toContain("endGameTowerRobot_Level2");
    expect(c.prefixActionIds).toBe(true);
    expect(c.shifts.enabled).toBe(true);
    expect(c.shifts.startsAt).toBe(130000);
    expect(c.aStop.enabled).toBe(true);
    expect(c.field.zoneButtons).toEqual(["AZone", "OAZone"]);
    expect(c.minQueueLength).toBe(2);
    // Derived ids cover shifts the hand-written catalog missed (activeShift3...).
    expect(allActionIds(c)).toContain("activeShift3StopShooting");
  });

  it("converts every past season without layout errors", () => {
    for (const y of ["2022", "2023", "2024", "2025", "2026"]) {
      const p = projectFromLegacy({ name: y, season: y, matchScouting: read(`presets/${y}/match-scouting.json`), pipeline: read(`presets/${y}/analysis-pipeline.json`), modules: read(`presets/${y}/analysis-modules.json`) });
      const errors = validateProject(p).filter((i) => i.level === "error" && i.area !== "dashboard");
      expect(errors, y).toEqual([]);
    }
  });
});

describe("scouting engine (2026 flow)", () => {
  it("prefixes ids by phase and shift, and switches layers on time", () => {
    const e = new ScoutingEngine(cfg2026());
    let t = 0;
    e.press(byId(e, "preloadFuel"), t);
    e.press(byId(e, "startGame"), t);
    e.tick((t += 1000)); // 159 s
    expect(e.displayLabel).toBe("Auto");
    e.press(byId(e, "StartShooting"), t);
    expect(ids(e)).toEqual(["preloadFuel", "startGame", "autoStartShooting"]);
    e.tick((t += 24_000)); // 135 s → transition
    expect(e.displayLabel).toBe("Teleop Transition");
    e.press(byId(e, "AZone"), t);
    expect(ids(e).at(-1)).toBe("teleopTransitionAZone");
    e.tick((t += 6_000)); // 129 s → shift picker layer
    e.press(byId(e, "teleopActive"), t);
    expect(e.displayLabel).toBe("Active Shift 1");
    const effects = e.press(byId(e, "StartShooting"), t);
    expect(effects.some((x) => x.type === "requestPosition")).toBe(true);
    expect(ids(e).at(-1)).toBe("activeShift1StartShooting");
    e.tick((t += 25_000));
    expect(e.displayLabel).toBe("Inactive Shift 1");
    e.tick((t += 75_000)); // 29 s
    expect(e.displayLabel).toBe("Endgame");
    e.tick((t += 40_000));
    expect(e.status).toBe("done");
    const out = e.submittedActions();
    expect(out.find((a) => a.id === "startGame")).toBeUndefined();
    expect(out.find((a) => a.id === "teleopActive")).toBeUndefined();
  });

  it("undo restores the previous layer within a phase and keeps the phase layer across phases", () => {
    const e = new ScoutingEngine(cfg2026());
    let t = 0;
    e.press(byId(e, "preloadFuel"), t);
    e.press(byId(e, "startGame"), t);
    e.tick((t += 1000));
    const auto = e.currentLayerIndex;
    e.press(byId(e, "Passing"), t);
    expect(e.currentLayerIndex).toBe(5);
    e.undo(t);
    expect(e.currentLayerIndex).toBe(auto);
    e.press(byId(e, "Passing"), t);
    e.tick((t += 22_000)); // 137 s: phase changes to teleop transition (layer 7)
    expect(e.currentLayerIndex).toBe(7);
    e.undo(t); // undo the auto Passing press: stay on the current phase's layer
    expect(e.currentLayerIndex).toBe(7);
    expect(ids(e).at(-1)).toBe("startGame");
  });

  it("undo of a shift button restores shift state", () => {
    const e = new ScoutingEngine(cfg2026());
    let t = 0;
    e.press(byId(e, "preloadFuel"), t);
    e.press(byId(e, "startGame"), t);
    e.tick((t += 31_000));
    e.press(byId(e, "teleopActive"), t);
    expect(e.displayLabel).toBe("Active Shift 1");
    e.undo(t);
    expect(e.displayLabel).toBe("Teleop");
  });

  it("A-Stop locks buttons until auto ends; undo releases it", () => {
    const e = new ScoutingEngine(cfg2026());
    let t = 0;
    e.press(byId(e, "preloadFuel"), t);
    e.press(byId(e, "startGame"), t);
    e.tick((t += 1000));
    e.press(byId(e, "aStop"), t);
    expect(e.aStopLocked).toBe(true);
    expect(e.visibleButtons().find((b) => b.id === "StartShooting")!.disabled).toBe(true);
    expect(e.visibleButtons().find((b) => b.type === "undo")!.disabled).toBe(false);
    e.undo(t);
    expect(e.aStopLocked).toBe(false);
    e.press(byId(e, "aStop"), t);
    e.tick((t += 20_000));
    expect(e.aStopLocked).toBe(false);
  });

  it("swaps zone ids for blue alliance and positions for flipped fields", () => {
    const e = new ScoutingEngine(cfg2026(), { swapZones: true, alliance: "blue" });
    let t = 0;
    e.press(byId(e, "preloadFuel"), t);
    e.press(byId(e, "startGame"), t);
    e.tick((t += 25_000));
    const az = e.visibleButtons().find((b) => b.id === "AZone")!;
    const oz = e.visibleButtons().find((b) => b.id === "OAZone")!;
    expect(az.effectiveId).toBe("OAZone");
    expect(az.effectiveArea).toEqual(oz.area);
    e.press(az.uid, t);
    expect(ids(e).at(-1)).toBe("teleopTransitionOAZone");
  });

  it("phase hold freezes the clock", () => {
    const c = cfg2026();
    c.phases.find((p) => p.at === 140000)!.holdMs = 3000;
    const e = new ScoutingEngine(c);
    let t = 0;
    e.press(byId(e, "preloadFuel"), t);
    e.press(byId(e, "startGame"), t);
    e.tick((t += 20_500)); // reaches 139.5 s → hold starts
    const held = e.time;
    e.tick((t += 2000));
    expect(e.holding).toBe(true);
    expect(e.time).toBe(held);
    e.tick((t += 2000));
    expect(e.holding).toBe(false);
    expect(e.time).toBeLessThan(held);
  });

  it("multiplier records copies and undo removes them together", () => {
    const p = blankProject();
    const c: ScoutingConfig = p.scouting;
    c.layers[1].buttons.find((b) => b.id === "autoScore")!.executables.push({ type: "multiplier", args: [3] });
    const e = new ScoutingEngine(c);
    e.press(byId(e, "startGame"), 0);
    e.tick(500);
    e.press(byId(e, "autoScore"), 500);
    expect(ids(e).filter((x) => x === "autoScore").length).toBe(3);
    e.undo(600);
    expect(ids(e)).toEqual(["startGame"]);
  });
});

describe("qr codec", () => {
  it("round-trips a match including composite ids and positions", async () => {
    const tmp = {
      matchId: "12-3061-Ada-abc",
      matchId_rand: "abc",
      timestamp: 1700000000000,
      clientVersion: "6.0",
      scouterId: "AdaLovelace",
      robotNumber: 3061,
      matchNumber: 12,
      eventNumber: "69a5ac455b39b683634e795e",
      flagged: false,
      actionQueue: [
        { id: "preloadFuel", ts: 160000 },
        { id: "activeShift3StartShooting", ts: 101230, other: { pos: { x: 40, y: 61 } } },
        { id: "activeShift3StopShooting", ts: 99870 },
      ],
    };
    const text = await encodeTmp(tmp);
    expect(text.length).toBeLessThan(2000);
    const back = await decodeTmp(text);
    expect(back.actionQueue).toEqual(tmp.actionQueue);
    expect(back.robotNumber).toBe(3061);
    expect(back.matchId).toBe("12-3061-AdaLovelace-abc");
  });
});

describe("every preset runs end-to-end on synthetic data", () => {
  for (const y of ["2022", "2023", "2024", "2025", "2026"]) {
    it(y, () => {
      const p = projectFromLegacy({ name: y, season: y, matchScouting: read(`presets/${y}/match-scouting.json`), pipeline: read(`presets/${y}/analysis-pipeline.json`), modules: read(`presets/${y}/analysis-modules.json`) });
      const { tmps } = synthesizeEvent(p.scouting, 12, 12, 7);
      expect(tmps.length).toBe(72);
      expect(tmps.every((t) => t.actionQueue.length > 0)).toBe(true);
      const run = runPipeline(p, tmps);
      const failed = run.steps.filter((s) => !s.ok);
      expect(failed, JSON.stringify(failed.slice(0, 3))).toEqual([]);
      expect(Object.keys(run.dataset.teams).length).toBe(12);
    });
  }
  it("blank project", () => {
    const p = blankProject();
    const run = runPipeline(p, synthesizeEvent(p.scouting, 6, 4).tmps);
    expect(run.steps.every((s) => s.ok)).toBe(true);
    const team = Object.values(run.dataset.teams)[0] as any;
    expect(typeof team.averageScores.total).toBe("number");
  });
});

describe("scoring + accuracy", () => {
  it("matches exact ids before the longest suffix", () => {
    const s = { points: { StartShooting: 1, autoStartShooting: 5, Shooting: 9 }, suffixMatch: true };
    expect(calculatePredictedScore([{ id: "autoStartShooting", ts: 0 }, { id: "teleopStartShooting", ts: 0 }, { id: "x", ts: 0 }], s).total).toBe(6);
  });
  it("attributes the residual to the alliance's scouters", () => {
    const official = [{ key: "2025x_qm1", alliances: { red: { score: 30, team_keys: ["frc1", "frc2", "frc3"] }, blue: { score: 10, team_keys: ["frc4", "frc5", "frc6"] } } }];
    const rec = (s: string, r: number, n: number) => ({ scouterId: s, robotNumber: r, matchKey: "2025x_qm1", actionQueue: Array.from({ length: n }, () => ({ id: "score", ts: 0 })) });
    const res = calculateScouterAccuracy([rec("A", 1, 10), rec("B", 2, 10), rec("C", 3, 4), rec("D", 4, 5)], official, { version: 1, points: { score: 1 }, suffixMatch: true });
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0].residual).toBe(6);
    expect(res.scouters.find((s) => s.scouterId === "A")!.averageAttributedError).toBeCloseTo(2);
  });
});
