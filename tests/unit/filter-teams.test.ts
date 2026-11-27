/**
 * Filter Teams and Compare Team Scores (#387; docs/spec/08 AN-16, AN-17, AN-19 to AN-21a, A-14,
 * T-2): the rules that pick teams, and the bubbles. The browser test opens both views
 * (`analysis.spec.ts`).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bubbles, compareChoices, CONSTANT } from "@/analysis/compare";
import { getPath, type Dataset } from "@/analysis/engine";
import { filterChoices, filterTeams, inBand, teamMatches } from "@/analysis/filter-teams";
import { valueLabel, words } from "@/analysis/labels";
import { DEFAULT_RATING_BANDS } from "@/config/convert/v1-to-v2";
import type { AnalysisModulesConfig, RatingBand } from "@/config/types";
import { runGoldenSet } from "../../tools/oracle/compare";
import { goldenSets } from "../../tools/oracle/sets";

const band = (id: string) => DEFAULT_RATING_BANDS.find((b) => b.id === id)!;
const [rating4, rating3, rating2] = ["Rating4", "Rating3", "Rating2"].map(band);
const [elite, strong, low, negative] = ["eliteOPR", "strongOPR", "lowOPR", "negativeOPR"].map(band);

const dataset = {
  tmps: [],
  teams: {
    // Rated 3 or more at everything it does; OPR 180.
    "111": { averageScores: { shooting: 3.5, passing: 3, defense: 0 }, opr: { total: 180 } },
    // One strong rating, one weak.
    "254": { averageScores: { shooting: 4, passing: 1.5 }, opr: { total: 260 } },
    // No positive rating; a negative OPR.
    "3061": { averageScores: { shooting: 0, passing: 0 }, opr: { total: -5 } },
    // Only an OPR, and a value that is not a number.
    "9999": { averageScores: { shooting: null }, opr: { total: 50, fouls: 2 } },
  },
} as unknown as Dataset;
const all = Object.keys(dataset.teams);
const match = (values: string[], bands: RatingBand[]) => filterTeams(dataset, all, values, bands);
const bandsIn = (file: string) =>
  (JSON.parse(readFileSync(file, "utf8")) as AnalysisModulesConfig).filterTeams.ratingBands;
const rated = (bands: RatingBand[]) => bands.filter((b) => b.rating).map((b) => b.id);

describe("AN-21: which teams match", () => {
  it("nothing picked: every team", () => {
    expect(match([], [])).toEqual(all);
  });

  it("values only: a positive value for every value picked, an average else an OPR", () => {
    expect(match(["shooting"], [])).toEqual(["111", "254"]);
    expect(match(["shooting", "passing"], [])).toEqual(["111", "254"]);
    expect(match(["total"], [])).toEqual(["111", "254", "9999"]);
    expect(match(["fouls"], [])).toEqual(["9999"]);
    expect(match(["defense"], [])).toEqual([]);
  });

  it("rating bands only: every positive average at least the highest band picked", () => {
    expect(match([], [rating3])).toEqual(["111"]);
    expect(match([], [rating2, rating3])).toEqual(["111"]);
    expect(match([], [rating4])).toEqual([]);
    // A team with no positive average matches no rating band (3061, 9999).
    expect(teamMatches(dataset.teams["3061"], [], [band("Rating1")])).toBe(false);
    expect(teamMatches(dataset.teams["9999"], [], [band("Rating1")])).toBe(false);
  });

  it("other or mixed bands: any average or OPR of the team in any band picked", () => {
    expect(match([], [elite])).toEqual(["254"]);
    expect(match([], [strong])).toEqual(["111"]);
    expect(match([], [negative])).toEqual(["3061"]);
    // Mixed with a rating band, the any-value rule: 254's 4 is in Rating4. As in v5, every band
    // is checked against every value, so 111's average of 0 is in Low OPR (0 to 100).
    expect(match([], [rating4, low])).toEqual(["111", "254", "3061", "9999"]);
  });

  it("both: every value picked is positive and in a band picked", () => {
    expect(match(["shooting"], [rating4])).toEqual(["254"]);
    expect(match(["shooting", "passing"], [rating3])).toEqual(["111"]);
    expect(match(["total"], [strong, elite])).toEqual(["111", "254"]);
    // 3061's 0 is in Low OPR, but a value must be positive.
    expect(match(["shooting"], [low])).toEqual(["111", "254"]);
  });
});

describe("A-14, AN-21a: the bands are configuration", () => {
  it("each kind of band", () => {
    expect(inBand(4, rating4)).toBe(true);
    expect(inBand(3.9, rating4)).toBe(false);
    expect(inBand(3, rating3)).toBe(true);
    expect([150, 151, 250, 251].map((v) => inBand(v, strong))).toEqual([false, true, true, false]);
    expect([-1, 0].map((v) => inBand(v, negative))).toEqual([true, false]);
    // A band missing its number holds nothing.
    expect(inBand(5, { id: "x", label: "x", kind: "min" })).toBe(false);
  });

  it('a band marked "rating" uses the rating rule, whatever its id', () => {
    const renamed: RatingBand = {
      id: "good",
      label: "Rated 3+",
      kind: "min",
      value: 3,
      rating: true,
    };
    expect(match([], [renamed])).toEqual(["111"]);
    // Unmarked, the any-value rule: 9999's OPR of 50 is at least 3.
    expect(match([], [{ ...renamed, rating: undefined }])).toEqual(["111", "254", "9999"]);
  });

  it("the converter and 2026 mark Rating1 to Rating4, and only them", () => {
    const ratings = ["Rating4", "Rating3", "Rating2", "Rating1"];
    expect(rated(DEFAULT_RATING_BANDS)).toEqual(ratings);
    expect(rated(bandsIn("config/analysis-modules.json"))).toEqual(ratings);
  });

  it("#408: 2025, scouted without ratings or OPRs, has point bands that sort 2025ilch's teams", () => {
    const bands = bandsIn("config/seasons/2025/analysis-modules.json");
    expect(rated(bands)).toEqual([]);
    // The event as the analysis page reads it: without the re-scouts v4.2.0 counted twice.
    const set = goldenSets.find((s) => s.name === "2025ilch_official-v4.2.0")!;
    const { dataset: ilch } = runGoldenSet({ ...set, includeSuperseded: false });
    const teams = Object.keys(ilch.teams);
    const matched = bands.map((b) => {
      const atLeast = teams.filter(
        (t) => Number(getPath(ilch.teams[t], "averageScores.total", null)) >= b.value!,
      );
      // A team's total is its largest average, so a band picks the same teams with or without
      // Total picked.
      expect(filterTeams(ilch, teams, ["total"], [b])).toEqual(atLeast);
      expect(filterTeams(ilch, teams, [], [b])).toEqual(atLeast);
      return atLeast.length;
    });
    // Each band, from the highest, holds more teams, and none holds them all.
    expect(matched[0]).toBeGreaterThan(0);
    matched.slice(1).forEach((n, i) => expect(n).toBeGreaterThan(matched[i]));
    expect(matched.at(-1)).toBeLessThan(teams.length);
  });
});

describe("AN-16, AN-19: the values to choose, by name", () => {
  it("names a value in words", () => {
    expect(words("autoShootingRating")).toBe("Auto Shooting Rating");
    expect(words("hub_total-count")).toBe("Hub Total Count");
    expect(words("Hub Total Fuel Count")).toBe("Hub Total Fuel Count");
    expect(words("activeShift1PassingRating")).toBe("Active Shift 1 Passing Rating");
    expect(words("scoreL4")).toBe("Score L4");
    expect(valueLabel("opr", "minorFoulCount")).toBe("OPR Minor Foul Count");
  });

  it("Filter Teams: every team's averages and OPRs, by name", () => {
    expect(filterChoices(dataset)).toEqual([
      { id: "defense", label: "Average Defense" },
      { id: "passing", label: "Average Passing" },
      { id: "shooting", label: "Average Shooting" },
      { id: "fouls", label: "OPR Fouls" },
      { id: "total", label: "OPR Total" },
    ]);
  });

  it("Compare: averages then OPRs by name, then Constant; first, the values most teams have", () => {
    const { choices, defaults } = compareChoices(dataset);
    expect(choices.map((c) => c.path)).toEqual([
      "averageScores.defense",
      "averageScores.passing",
      "averageScores.shooting",
      "opr.fouls",
      "opr.total",
      CONSTANT,
    ]);
    // Every team has an OPR total; three have shooting and passing (9999's is not a number),
    // which tie and keep the order the teams have them in; one has defense.
    expect(defaults).toEqual({
      x: "opr.total",
      y: "averageScores.shooting",
      size: "averageScores.passing",
    });
    const none = { tmps: [], teams: { "1": {} } } as unknown as Dataset;
    expect(compareChoices(none)).toEqual({
      choices: [{ path: CONSTANT, label: "Constant" }],
      defaults: { x: CONSTANT, y: CONSTANT, size: CONSTANT },
    });
  });
});

describe("AN-17, F-27: a bubble per team with every value chosen", () => {
  it("a team missing a value is left out and listed, not drawn at 0", () => {
    const { shown, missing } = bubbles(dataset, all, {
      x: "averageScores.shooting",
      y: "opr.total",
      size: CONSTANT,
    });
    expect(shown).toEqual([
      { team: "111", x: 3.5, y: 180, size: null },
      { team: "254", x: 4, y: 260, size: null },
      { team: "3061", x: 0, y: -5, size: null },
    ]);
    expect(missing).toEqual(["9999"]);
    expect(
      bubbles(dataset, ["111"], { x: "opr.total", y: "opr.total", size: "averageScores.passing" })
        .shown,
    ).toEqual([{ team: "111", x: 180, y: 180, size: 3 }]);
  });
});
