/**
 * countActions with period filters and grouping (#311, CS-16, docs/spec/20 §2.2, docs/spec/09).
 * Oracle agreement for 2025 is checked by the ratchet in oracle-compare.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDataset, getPath, runPipeline, type Dataset } from "@/analysis/engine";
import { createRegistry } from "@/analysis/transformers";
import {
  configuredPeriods,
  groupKey,
  groupKeys,
  passesFilter,
  PRE_MATCH,
} from "@/analysis/transformers/periods";
import { actionButtonIds } from "@/config/knownActionIds";
import { generate } from "@/generate/synthetic";
import type { MatchScoutingConfig, PipelineEntry } from "@/config/types";
import type { Action, TeamMatchPerformance } from "@/data/types";

const load = (...p: string[]) =>
  JSON.parse(readFileSync(join(process.cwd(), ...p), "utf8")) as MatchScoutingConfig;
const config2025 = load("config", "seasons", "2025", "match-scouting.json");
const config2026 = load("config", "match-scouting.json");
const registry = createRegistry();

const run = (
  config: MatchScoutingConfig,
  performances: TeamMatchPerformance[],
  entries: PipelineEntry[],
) => {
  const result = runPipeline(buildDataset(performances), entries, {
    registry,
    context: { config },
  });
  expect(result.problems).toEqual([]);
  return result.dataset;
};
const counts = (dataset: Dataset, i = 0) => dataset.tmps[i].counts as Record<string, unknown>;
const sumOf = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

const data2025 = generate({ config: config2025, seed: "count-2025", matches: 8 }).performances;
const data2026 = generate({ config: config2026, seed: "count-2026", matches: 8 }).performances;

describe("CS-16: periods", () => {
  it("2025 (phases only): keys are preMatch and the phase ids", () => {
    expect(groupKeys(config2025, "phase")).toEqual([PRE_MATCH, "auto", "teleop"]);
    expect(groupKeys(config2025, "segment")).toEqual([PRE_MATCH, "auto", "teleop"]);
  });

  it("2026: grouping by segment names the most specific period", () => {
    expect(groupKeys(config2026, "phase")).toEqual([PRE_MATCH, "auto", "teleop", "endgame"]);
    expect(groupKeys(config2026, "segment")).toEqual([
      PRE_MATCH,
      "auto",
      "teleop",
      "transition",
      "shift1",
      "active1",
      "inactive1",
      "shift2",
      "active2",
      "inactive2",
      "shift3",
      "active3",
      "inactive3",
      "shift4",
      "active4",
      "inactive4",
      "endgame",
    ]);
  });

  it("keys follow the stored action fields", () => {
    const a = (p: Partial<Action>) => ({
      phase: null,
      segment: null,
      segmentKind: null,
      segmentIndex: null,
      ...p,
    });
    expect(groupKey(a({}), "segment")).toBe(PRE_MATCH);
    expect(
      groupKey(
        a({ phase: "teleop", segment: "shift", segmentKind: "active", segmentIndex: 2 }),
        "segment",
      ),
    ).toBe("active2");
    expect(groupKey(a({ phase: "teleop", segment: "shift", segmentIndex: 3 }), "segment")).toBe(
      "shift3",
    );
    expect(groupKey(a({ phase: "teleop", segment: "transition" }), "segment")).toBe("transition");
    expect(
      groupKey(
        a({ phase: "teleop", segment: "shift", segmentKind: "active", segmentIndex: 2 }),
        "phase",
      ),
    ).toBe("teleop");
  });

  it("filters: every filter must pass; any listed value passes it", () => {
    const shift = { phase: "teleop", segment: "shift", segmentKind: "active", segmentIndex: 1 };
    expect(passesFilter(shift, { phases: ["auto", "teleop"] })).toBe(true);
    expect(passesFilter(shift, { phases: ["teleop"], kinds: ["inactive"] })).toBe(false);
    expect(passesFilter({ phase: "teleop", segment: null }, { segments: ["shift"] })).toBe(false);
    expect(passesFilter({ phase: null }, { phases: [PRE_MATCH] })).toBe(true);
    expect(passesFilter({}, { phases: [PRE_MATCH] })).toBe(true); // arrays without period fields
  });

  it("refuses ids that would merge two periods under one key", () => {
    const clash = structuredClone(config2026);
    clash.timing.phases[2].id = "active1"; // endgame renamed to collide with a shift kind
    expect(() => groupKeys(clash, "segment")).toThrow(/two different periods the key "active1"/);
    const reserved = structuredClone(config2025);
    reserved.timing.phases[0].id = PRE_MATCH;
    expect(() => groupKeys(reserved, "phase")).toThrow(/"preMatch" is reserved/);
    expect(configuredPeriods(config2025)).toHaveLength(3);
  });
});

describe("countActions", () => {
  it("all: starts every action button at 0, lists no non-action buttons, counts every action", () => {
    const dataset = run(config2025, data2025, [
      { type: "tmp", name: "countActions", outputPath: "counts", options: { all: true } },
    ]);
    const buttons = actionButtonIds(config2025);
    dataset.tmps.forEach((tmp, i) => {
      const c = counts(dataset, i) as Record<string, number>;
      for (const id of buttons) expect(typeof c[id]).toBe("number");
      for (const id of ["startGame", "undo", "Reef", "autoScoreCoral"])
        expect(c).not.toHaveProperty(id);
      expect(sumOf(c)).toBe(tmp.actions.length);
    });
  });

  it("all: counts ids the configuration does not know (decision of 2026-09-17)", () => {
    const p = structuredClone(data2025[0]);
    p.actions = [...p.actions, { ...p.actions[0], id: "notAButton" }];
    const dataset = run(
      config2025,
      [p],
      [{ type: "tmp", name: "countActions", outputPath: "counts", options: { all: true } }],
    );
    expect(counts(dataset).notAButton).toBe(1);
  });

  it("ids: counts only the listed ids, each starting at 0", () => {
    const dataset = run(config2025, data2025, [
      {
        type: "tmp",
        name: "countActions",
        outputPath: "counts",
        options: { ids: ["leave", "neverPressed"] },
      },
    ]);
    for (let i = 0; i < dataset.tmps.length; i++) {
      const c = counts(dataset, i);
      expect(Object.keys(c).sort()).toEqual(["leave", "neverPressed"]);
      expect(c.neverPressed).toBe(0);
      expect(c.leave).toBe(dataset.tmps[i].actions.filter((a) => a.id === "leave").length);
    }
  });

  it("by phase: per-phase counts add up to the ungrouped counts (2025, phases only)", () => {
    const dataset = run(config2025, data2025, [
      { type: "tmp", name: "countActions", outputPath: "counts", options: { all: true } },
      {
        type: "tmp",
        name: "countActions",
        outputPath: "byPhase",
        options: { all: true, by: "phase" },
      },
    ]);
    for (const tmp of dataset.tmps) {
      const byPhase = tmp.byPhase as Record<string, Record<string, number>>;
      expect(Object.keys(byPhase)).toEqual([PRE_MATCH, "auto", "teleop"]);
      const total = tmp.counts as Record<string, number>;
      for (const id of Object.keys(total)) {
        expect(byPhase.preMatch[id] + byPhase.auto[id] + byPhase.teleop[id]).toBe(total[id]);
      }
      expect(byPhase.auto.leave).toBe(
        tmp.actions.filter((a) => a.id === "leave" && a.phase === "auto").length,
      );
    }
  });

  it("by segment: 2026 shifts, transition and endgame each get their own counts", () => {
    const dataset = run(config2026, data2026, [
      {
        type: "tmp",
        name: "countActions",
        outputPath: "bySegment",
        options: { all: true, by: "segment" },
      },
    ]);
    let active = 0;
    for (const tmp of dataset.tmps) {
      const bySegment = tmp.bySegment as Record<string, Record<string, number>>;
      expect(Object.keys(bySegment)).toEqual(groupKeys(config2026, "segment"));
      expect(
        Object.values(bySegment)
          .map(sumOf)
          .reduce((a, b) => a + b, 0),
      ).toBe(tmp.actions.length);
      active += sumOf(bySegment.active1) + sumOf(bySegment.active2);
    }
    expect(active).toBeGreaterThan(0); // the fixture exercises shifts
  });

  it("filters restrict what is counted, and which groups are seeded", () => {
    const dataset = run(config2026, data2026, [
      {
        type: "tmp",
        name: "countActions",
        outputPath: "auto",
        options: { all: true, phases: ["auto"] },
      },
      {
        type: "tmp",
        name: "countActions",
        outputPath: "activeShifts",
        options: { all: true, kinds: ["active"], by: "segment" },
      },
      {
        type: "tmp",
        name: "countActions",
        outputPath: "pre",
        options: { all: true, phases: [PRE_MATCH] },
      },
    ]);
    for (const tmp of dataset.tmps) {
      expect(sumOf(tmp.auto as Record<string, number>)).toBe(
        tmp.actions.filter((a) => a.phase === "auto").length,
      );
      expect(Object.keys(tmp.activeShifts as object)).toEqual([
        "active1",
        "active2",
        "active3",
        "active4",
      ]);
      expect(sumOf(tmp.pre as Record<string, number>)).toBe(
        tmp.actions.filter((a) => a.phase === null).length,
      );
    }
  });

  it("team: sums the team's performances", () => {
    const dataset = run(config2025, data2025, [
      { type: "tmp", name: "countActions", outputPath: "counts", options: { all: true } },
      {
        type: "team",
        name: "countActions",
        outputPath: "counts",
        options: { all: true, by: "phase" },
      },
    ]);
    for (const [team, data] of Object.entries(dataset.teams)) {
      const mine = dataset.tmps.filter((t) => t.team === team);
      const expected = mine.reduce(
        (s, t) => s + ((t.counts as Record<string, number>).leave ?? 0),
        0,
      );
      const byPhase = data.counts as Record<string, Record<string, number>>;
      expect(byPhase.preMatch.leave + byPhase.auto.leave + byPhase.teleop.leave).toBe(expected);
    }
  });

  it("actionArrayPath counts another list of actions", () => {
    const p = structuredClone(data2025[0]) as TeamMatchPerformance & Record<string, unknown>;
    const dataset = buildDataset([p]);
    Object.assign(dataset.tmps[0], { picked: [{ id: "leave" }, { id: "leave" }] });
    const { dataset: out, problems } = runPipeline(
      dataset,
      [
        {
          type: "tmp",
          name: "countActions",
          outputPath: "c",
          options: { ids: ["leave"], actionArrayPath: "picked" },
        },
      ],
      { registry, context: { config: config2025 } },
    );
    expect(problems).toEqual([]);
    expect(getPath(out.tmps[0], "c.leave")).toBe(2);
  });

  it("CS-10: options are validated", () => {
    const { problems } = runPipeline(
      buildDataset(data2025),
      [
        {
          type: "tmp",
          name: "countActions",
          outputPath: "a",
          options: { all: true, phase: ["auto"] },
        },
        { type: "tmp", name: "countActions", outputPath: "b", options: { all: true, by: "shift" } },
        { type: "tmp", name: "countActions", outputPath: "c", options: {} },
      ],
      { registry, context: { config: config2025 } },
    );
    expect(problems.map((p) => p.message)).toEqual([
      'Invalid options: options: unknown property "phase"; did you mean "phases"?',
      "Invalid options: options.by: must be one of: phase, segment",
      'Invalid options: options: needs one of these properties: "all", "ids"',
    ]);
  });
});
