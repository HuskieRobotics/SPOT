/**
 * The chance of winning (#389; docs/spec/08 AN-23, AN-24, F-18, F-27): Simulate Match's
 * `percentChanceOfWinning` and the Auto Pick List, on a dataset whose answers are known. The
 * browser test turns both on (`analysis.spec.ts`).
 */
import { describe, expect, it } from "vitest";
import type { Dataset } from "@/analysis/engine";
import {
  allianceScore,
  autoPickList,
  chanceOfWinning,
  MIN_DEVIATION,
  normalCdf,
} from "@/analysis/win-chance";

const team = (total: number | null, sd?: number | null) => ({
  ...(total === null ? {} : { averageScores: { total } }),
  ...(sd === undefined ? {} : { standardDeviation: sd }),
});

const dataset = {
  tmps: [],
  teams: {
    a: team(60, 6),
    b: team(40, 8),
    c: team(30, 0),
    d: team(30),
    e: team(null, 5),
    f: team(50, 0),
    g: team(50, 0),
    h: team(20, 0),
  },
} as unknown as Dataset;

describe("Φ, the standard normal distribution", () => {
  it("matches its table to six places", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1)).toBeCloseTo(0.841345, 6);
    expect(normalCdf(-1)).toBeCloseTo(0.158655, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975002, 6);
    expect(normalCdf(2)).toBeCloseTo(0.97725, 5);
    expect(normalCdf(40)).toBe(1);
  });
});

describe("AN-23: an alliance's chance of beating the other", () => {
  it("one team each: Φ((60 − 40) / √(6² + 8²)) = Φ(2)", () => {
    expect(chanceOfWinning(dataset, ["a"], ["b"])).toBeCloseTo(0.97725, 5);
    expect(chanceOfWinning(dataset, ["b"], ["a"])).toBeCloseTo(0.02275, 5);
  });

  it("alliances add their scores, and their deviations as √(Σ sd²)", () => {
    expect(allianceScore(dataset, ["a", "b"])).toEqual({ score: 100, deviation: 10 });
    // 100 against 60 (c and d have no deviation): Φ(40 / √(10²)) = Φ(4).
    expect(chanceOfWinning(dataset, ["a", "b"], ["c", "d"])).toBeCloseTo(normalCdf(4), 9);
  });

  it("F-27: a team without a total does not count; with no team that has one, no chance", () => {
    expect(allianceScore(dataset, ["a", "e"])).toEqual({ score: 60, deviation: 6 });
    expect(chanceOfWinning(dataset, ["e"], ["a"])).toBeNull();
    expect(chanceOfWinning(dataset, [], ["a"])).toBeNull();
  });

  it(`equal teams with no deviation: an even chance, the deviation at least ${MIN_DEVIATION}`, () => {
    expect(chanceOfWinning(dataset, ["f"], ["g"])).toBe(0.5);
    expect(chanceOfWinning(dataset, ["f"], ["h"])).toBe(1);
  });
});

describe("AN-24: the Auto Pick List", () => {
  it("ranks by the average chance of beating each other team; ties keep their order", () => {
    const { ranked, unranked } = autoPickList(dataset, ["h", "g", "f", "e"]);
    // f and g: 0.5 against each other, 1 against h. h: 0 against both.
    expect(ranked.map((p) => [p.team, p.chance])).toEqual([
      ["g", 0.75],
      ["f", 0.75],
      ["h", 0],
    ]);
    expect(unranked).toEqual(["e"]);
  });

  it("the stronger team ranks first, and a chance is between 0 and 1", () => {
    const { ranked } = autoPickList(dataset, ["b", "a", "c"]);
    expect(ranked.map((p) => p.team)).toEqual(["a", "b", "c"]);
    for (const p of ranked) {
      expect(p.chance).toBeGreaterThanOrEqual(0);
      expect(p.chance).toBeLessThanOrEqual(1);
    }
    // a: Φ(2) against b, Φ(30 / 6) = Φ(5) against c.
    expect(ranked[0].chance).toBeCloseTo((normalCdf(2) + normalCdf(5)) / 2, 9);
  });

  it("fewer than two teams with a total: nobody is ranked", () => {
    expect(autoPickList(dataset, ["a", "e"])).toEqual({ ranked: [], unranked: ["a", "e"] });
  });

  it("F-18: nothing it is given changes", () => {
    const teams = Object.freeze(["a", "b"]);
    const before = JSON.stringify(dataset);
    autoPickList(dataset, teams);
    chanceOfWinning(dataset, teams, ["c"]);
    expect(JSON.stringify(dataset)).toBe(before);
  });
});
