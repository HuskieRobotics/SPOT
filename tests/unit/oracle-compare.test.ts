/**
 * T-4: the v6 engine against the legacy golden output (#310). The comparison itself is tested on
 * small inputs; then every golden set is migrated and run, and two kinds of check apply:
 *
 * - Structure, all sets: every legacy performance and team is present in v6 (migration keeps ids
 *   and team keys), and the only extra performances are the ones legacy removeDuplicates dropped.
 * - Acceptance, every set (#319, #320, gate K-1): every entry runs and matches the golden output,
 *   after the reviewed divergences, each of which must accept exactly the values counted below.
 *   2026 is compared through the translation table generated from its configuration (CS-16).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDataset, getPath, type Dataset } from "@/analysis/engine";
import { generate } from "@/generate/synthetic";
import { TransformerRegistry } from "@/analysis/engine";
import { builtInTransformers } from "@/analysis/transformers";
import type { MatchScoutingConfig, PipelineEntry } from "@/config/types";
import {
  compareDatasets,
  compareGoldenSet,
  flatten,
  loadDivergences,
  pathMatches,
  runGoldenSet,
  type DivergenceRule,
} from "../../tools/oracle/compare";
import { goldenSets } from "../../tools/oracle/sets";
import { translationFor } from "../../tools/oracle/translate";

describe("divergence rules", () => {
  it("every rule cites a requirement or defect and says why", () => {
    for (const rule of loadDivergences()) {
      expect(rule.id).toMatch(/^[a-z0-9-]+$/);
      expect(rule.cites.length).toBeGreaterThan(0);
      expect(rule.why.length).toBeGreaterThan(20);
      // Either a value rule (legacy values and the v6 value) or a key rename limited to paths.
      if (rule.rename) {
        expect(rule.legacy).toBeUndefined();
        expect(rule.paths?.length).toBeGreaterThan(0);
      } else {
        expect(rule.legacy?.length).toBeGreaterThan(0);
        expect(rule).toHaveProperty("v6");
      }
      // A rule that accepts any legacy value is only as good as its paths: name them.
      if (rule.legacy?.includes("(any)")) {
        expect(rule.sets?.length).toBeGreaterThan(0);
        expect(rule.paths?.length).toBeGreaterThan(0);
        expect(rule.paths).not.toContain("**");
      }
    }
  });

  it("path patterns: * is one segment, ** any number", () => {
    expect(pathMatches("timePerGamePiece", "timePerGamePiece")).toBe(true);
    expect(pathMatches("averages.*", "averages.l4")).toBe(true);
    expect(pathMatches("averages.*", "averages.l4.x")).toBe(false);
    expect(pathMatches("cycles.**", "cycles.coral.all.0.ts")).toBe(true);
    expect(pathMatches("**.averageTime", "cycles.coral.averageTime")).toBe(true);
    expect(pathMatches("counts", "counts.l4")).toBe(false);
  });

  it("flatten keeps empty objects and arrays as leaves", () => {
    expect([...flatten({ a: { b: 1, e: {} }, l: [], m: [2] })]).toEqual([
      ["a.b", 1],
      ["a.e", "{}"],
      ["l", "[]"],
      ["m.0", 2],
    ]);
  });
});

describe("compareDatasets", () => {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), "config", "seasons", "2025", "match-scouting.json"), "utf8"),
  ) as MatchScoutingConfig;
  const performances = generate({
    config,
    seed: "compare",
    matches: 2,
    robotsPerMatch: 2,
  }).performances;
  const pipeline: PipelineEntry[] = [
    { type: "tmp", name: "x", outputPath: "counts" },
    { type: "tmp", name: "y", outputPath: "counts.total" },
    { type: "team", name: "z", outputPath: "averages" },
  ];
  const rules: DivergenceRule[] = [
    { id: "nan", cites: "DM-1b", why: "missing is null in v6", legacy: ["__NaN__"], v6: null },
    {
      id: "scoped",
      cites: "test",
      why: "only for one path in one set",
      legacy: ["N/A"],
      v6: 0,
      sets: ["s"],
      paths: ["averages.*"],
    },
  ];

  const build = () => {
    const v6: Dataset = buildDataset(performances);
    const legacy = {
      tmps: v6.tmps.map(
        (t) => ({ _id: t._id, robotNumber: 1, actionQueue: [] }) as Record<string, unknown>,
      ),
      teams: Object.fromEntries(
        Object.keys(v6.teams).map((k) => [k, {} as Record<string, unknown>]),
      ),
    };
    return { v6, legacy };
  };

  it("compares derived values only, and attributes a difference to the deepest owning entry", () => {
    const { v6, legacy } = build();
    const [a, b] = v6.tmps;
    Object.assign(a, { counts: { l1: 1, total: 5 } });
    Object.assign(legacy.tmps[0], { counts: { l1: 1, total: 4 } });
    Object.assign(b, { counts: { l1: 2 } });
    Object.assign(legacy.tmps[1], { counts: { l1: 3 } });
    const c = compareDatasets(legacy, v6, { set: "s", pipeline, rules });
    expect(c.differenceCount).toBe(2);
    expect(c.differences.map((d) => [d.id, d.path, d.legacy, d.v6])).toEqual([
      [a._id, "counts.total", 4, 5],
      [b._id, "counts.l1", 3, 2],
    ]);
    expect(c.entries.map((e) => [e.name, e.status, e.differences])).toEqual([
      ["x", "differs", 1],
      ["y", "differs", 1],
      ["z", "match", 0],
    ]);
  });

  it("accepts a difference only when a rule matches its value, set and path", () => {
    const { v6, legacy } = build();
    const team = Object.keys(v6.teams)[0];
    v6.teams[team].averages = { l4: null, l3: 0, l2: 0 };
    legacy.teams[team].averages = { l4: "__NaN__", l3: "N/A", l2: "N/A" };
    let c = compareDatasets(legacy, v6, { set: "s", pipeline, rules });
    expect(c.accepted).toEqual({ nan: 1, scoped: 2 });
    expect(c.differenceCount).toBe(0);
    c = compareDatasets(legacy, v6, { set: "other", pipeline, rules });
    expect(c.accepted).toEqual({ nan: 1 });
    expect(c.differenceCount).toBe(2);
  });

  it("reports values present on one side only, and membership", () => {
    const { v6, legacy } = build();
    Object.assign(v6.tmps[0], { extra: 1 });
    Object.assign(legacy.tmps[0], { gone: 1 });
    legacy.tmps.push({ _id: "f".repeat(24) });
    const c = compareDatasets(legacy, v6, { set: "s", pipeline, rules });
    expect(c.differences.map((d) => [d.path, d.legacy, d.v6])).toEqual([
      ["gone", 1, "(absent)"],
      ["extra", "(absent)", 1],
    ]);
    expect(c.tmps.missingInV6).toEqual(["f".repeat(24)]);
    expect(c.entries.every((e) => e.status === "match")).toBe(true); // nothing owns those paths
  });

  it("maps legacy paths through a translation, or skips them (#320)", () => {
    const { v6, legacy } = build();
    Object.assign(v6.tmps[0], { counts: { teleop: { l1: 2 } } });
    Object.assign(legacy.tmps[0], { counts: { teleopl1: 2, skipped: 9 } });
    const c = compareDatasets(legacy, v6, {
      set: "s",
      pipeline,
      rules,
      mapLegacyPath: (_scope, path) =>
        path === "counts.teleopl1" ? "counts.teleop.l1" : path === "counts.skipped" ? null : path,
    });
    expect(c.differenceCount).toBe(0);
  });

  it("maps legacy values, and limits a rule to named records (#320)", () => {
    const { v6, legacy } = build();
    const [a, b] = v6.tmps;
    Object.assign(a, { first: { id: "l1" }, n: 2 });
    Object.assign(b, { first: { id: "l1" }, n: 2 });
    Object.assign(legacy.tmps[0], { first: { id: "autol1" }, n: 1 });
    Object.assign(legacy.tmps[1], { first: { id: "autol1" }, n: 1 });
    const only: DivergenceRule = {
      id: "only",
      cites: "test",
      why: "one record entered late",
      sets: ["s"],
      records: [a._id],
      paths: ["n"],
      legacy: ["(any)"],
      v6: "(any)",
    };
    const c = compareDatasets(legacy, v6, {
      set: "s",
      pipeline,
      rules: [...rules, only],
      mapLegacyValue: (_scope, path, value) =>
        path.endsWith(".id") && value === "autol1" ? "l1" : value,
    });
    expect(c.accepted).toEqual({ only: 1 });
    expect(c.differences.map((d) => [d.id, d.path])).toEqual([[b._id, "n"]]);
  });

  it("renames a legacy key, and accepts any v6 value where a rule says (any) (#314)", () => {
    const { v6, legacy } = build();
    Object.assign(v6.tmps[0], { c: { all: [{ starts: { id: "p", phase: "auto" } }] } });
    Object.assign(legacy.tmps[0], { c: { all: [{ pickup: { id: "p" } }] } });
    const extra: DivergenceRule[] = [
      {
        id: "key",
        cites: "test",
        why: "legacy named the key differently",
        paths: ["c.*.*.pickup.**"],
        rename: { from: "pickup", to: "starts" },
      },
      {
        id: "field",
        cites: "test",
        why: "v6 adds a field legacy lacked",
        paths: ["**.starts.phase"],
        legacy: ["(absent)"],
        v6: "(any)",
      },
    ];
    const c = compareDatasets(legacy, v6, { set: "s", pipeline, rules: [...rules, ...extra] });
    expect(c.differenceCount).toBe(0);
    expect(c.accepted).toEqual({ key: 1, field: 1 });
  });
});

/** Each golden set compared once, unfed: every entry runs on v6's own outputs. */
const comparisons = new Map(
  goldenSets.map((set) => [set.name, compareGoldenSet(set, { keep: 20 })]),
);

describe.each(goldenSets.map((s) => [s.name, s] as const))("golden set %s", (name) => {
  const comparison = comparisons.get(name)!;
  const report = JSON.parse(
    readFileSync(join(process.cwd(), "tools", "oracle", "golden", name, "report.json"), "utf8"),
  ) as { tmpCount: number; derivedTmpCount: number; teamCount: number };

  it("analyzes exactly the performances legacy did, keeping ids and team keys", () => {
    // The migration marks superseded exactly the re-scouts v5's removeDuplicates dropped, and v6
    // leaves them out (RT-14a). The 2025 sets feed them in, as v4.2.0 counted them (sets.ts).
    expect(comparison.tmps.missingInV6).toEqual([]);
    expect(comparison.tmps.extraInV6).toEqual([]);
    expect(comparison.tmps.v6).toBe(report.derivedTmpCount);
    expect(comparison.teams.missingInV6).toEqual([]);
    expect(comparison.teams.extraInV6).toEqual([]);
  });

  it("runs every pipeline entry", () => {
    expect(comparison.problems.map((p) => p.message)).toEqual([]);
  });
});

/**
 * #319 (gate K-1): the engine reproduces the 2025 golden output, nothing fed from it, and the
 * only differences are the reviewed divergences (tools/oracle/README.md), each accepting exactly
 * the values counted here. A change in any count is a change in behavior to look at.
 */
describe("#319: oracle acceptance, 2025", () => {
  const accepted2025 = {
    "2025ilch_official-v4.2.0": {
      "missing-nan": 1635,
      "ratio-falsy-divbyzero-2025": 24,
      "ratio-misplaced-divbyzero-2025": 3,
      "counts-nonaction-buttons": 1964,
      "cycle-start-key-2025": 17648,
      "action-period-fields": 70416,
      "cycle-unended-count": 1221,
      "cycle-pairing-2025": 4900,
    },
    "2025syn_synthetic-v4.2.0": {
      "missing-nan": 1345,
      "ratio-falsy-divbyzero-2025": 1,
      "counts-nonaction-buttons": 1824,
      "cycle-start-key-2025": 4068,
      "action-period-fields": 15056,
      "cycle-unended-count": 1080,
      "cycle-pairing-2025": 3598,
    },
  };

  it.each(Object.keys(accepted2025))("%s matches the golden output entry by entry", (name) => {
    const c = comparisons.get(name)!;
    expect(c.entries).toHaveLength(46);
    expect(c.entries.filter((e) => e.status !== "match")).toEqual([]);
    expect(c.differenceCount).toBe(0);
    expect(c.accepted).toEqual(accepted2025[name as keyof typeof accepted2025]);
  });

  it.each(Object.keys(accepted2025))(
    "%s: cycles differ only where a start was left without an end (F-28)",
    (name) => {
      // Compare again without the pairing rule: every performance whose cycles differ must have
      // a start that never got its end, and every team that differs must have such a performance.
      const set = goldenSets.find((s) => s.name === name)!;
      const rules = loadDivergences().filter((r) => r.id !== "cycle-pairing-2025");
      const strict = compareGoldenSet(set, { rules, keep: 1_000_000 });
      const { dataset } = runGoldenSet(set);
      const byId = new Map(dataset.tmps.map((t) => [t._id, t as Record<string, unknown>]));
      const tmps = new Set<string>();
      for (const d of strict.differences.filter((d) => d.scope === "tmp")) {
        const [, cycle] = d.path.split(".");
        const unended = getPath(byId.get(d.id)!, `cycles.${cycle}.unendedCount`);
        expect([d.path, unended]).toEqual([d.path, expect.any(Number)]);
        expect(unended).toBeGreaterThan(0);
        tmps.add(d.id);
      }
      const teams = new Set([...tmps].map((id) => byId.get(id)!.team));
      for (const d of strict.differences.filter((d) => d.scope === "team")) {
        expect(teams.has(d.id)).toBe(true);
      }
      expect(strict.differenceCount).toBe(
        accepted2025[name as keyof typeof accepted2025]["cycle-pairing-2025"],
      );
      expect(tmps.size).toBeGreaterThan(0);
    },
    60000,
  );

  it('the ratio rules excuse exactly the 27 "N/A" values docs/spec/12 counts (F-24, F-25)', () => {
    const c = comparisons.get("2025ilch_official-v4.2.0")!;
    expect(c.acceptedPaths["ratio-falsy-divbyzero-2025"]).toEqual({
      algaeAccuracy: 21,
      coralAccuracy: 3,
    });
    expect(c.acceptedPaths["ratio-misplaced-divbyzero-2025"]).toEqual({ timePerGamePiece: 3 });
  });

  it("NaN is accepted only where there was nothing to average: cycle times (DM-1b)", () => {
    for (const name of Object.keys(accepted2025)) {
      const paths = Object.keys(comparisons.get(name)!.acceptedPaths["missing-nan"]);
      expect(
        paths.every((p) => /^cycles\.(algae|coral|endgame)\.averageTime(Complete)?$/.test(p)),
      ).toBe(true);
    }
  });

  it("feed mode stands in for a transformer the engine does not have", () => {
    // Used while a season's transformers are written (#320): an entry that cannot run takes its
    // golden output, converted to v6 form, and the entries after it are judged on that.
    const set = goldenSets.find((s) => s.name === "2025syn_synthetic-v4.2.0")!;
    const registry = new TransformerRegistry(builtInTransformers.filter((t) => t.name !== "cycle"));
    const fed = compareGoldenSet(set, { keep: 20, registry, feed: true });
    const notRun = fed.entries.filter((e) => e.status === "not-run").map((e) => e.name);
    expect(notRun).toEqual(["cycle", "cycle", "cycle"]);
    expect(fed.entries.filter((e) => e.status === "differs")).toEqual([]);
  });
});

/**
 * #320 (gate K-1): the native 2026 configuration reproduces the 2026 golden output, through the
 * translation table generated from its prefixes, with the reviewed divergences
 * (tools/oracle/README.md) accepting exactly the values counted here.
 */
describe("#320: oracle acceptance, 2026", () => {
  const accepted2026 = {
    "2026mnwi_official-v5": {
      "missing-nan": 2651,
      "missing-undefined": 21,
      "counts-nonaction-buttons": 2036,
      "counts-catalog-ids-2026": 3054,
      "action-period-fields": 134012,
      "cycle-unended-count": 2065,
      "tba-ids-start-at-zero-2026": 75,
      "tba-none-average-2026": 26,
      "shift-slots-2026": 128269,
      "shift-numbering-2026": 318,
      "counts-every-period-2026": 141919,
      "average-keys-2026": 23,
      "cycles-2026": 26765,
      "performance-order-2026": 1448,
      "attempt-climb-2026": 21,
      "opr-auto-fuel-2026": 48,
    },
    "2026syn_synthetic-v5": {
      "missing-nan": 3231,
      "counts-nonaction-buttons": 1824,
      "counts-catalog-ids-2026": 2736,
      "action-period-fields": 60552,
      "cycle-unended-count": 1800,
      "tba-ids-without-tba": 1824,
      "opr-without-tba": 192,
      "shift-slots-2026": 90287,
      "shift-numbering-2026": 60,
      "counts-every-period-2026": 100868,
      "average-keys-2026": 1172,
      "cycles-2026": 14984,
      "attempt-climb-2026": 262,
    },
  };

  it.each(Object.keys(accepted2026))("%s matches the golden output entry by entry", (name) => {
    const c = comparisons.get(name)!;
    expect(c.entries).toHaveLength(73);
    expect(c.entries.filter((e) => e.status !== "match")).toEqual([]);
    expect(c.differenceCount).toBe(0);
    expect(c.accepted).toEqual(accepted2026[name as keyof typeof accepted2026]);
  });

  it.each(Object.keys(accepted2026))(
    "%s: per-shift values differ only where v5's shift number does not fit the clock (#326)",
    (name) => {
      // Compare again without the shift-numbering rule: every performance whose values differ
      // must have an action whose v5 shift number is outside the clock slots it can be in, and
      // every team that differs must have such a performance.
      const set = goldenSets.find((s) => s.name === name)!;
      const rules = loadDivergences().filter((r) => r.id !== "shift-numbering-2026");
      const strict = compareGoldenSet(set, { rules, keep: 1_000_000 });
      const { dataset, migration } = runGoldenSet(set);
      const flagged = new Set(migration.shiftNumbering.performances);
      const teams = new Set(dataset.tmps.filter((t) => flagged.has(t._id)).map((t) => t.team));
      for (const d of strict.differences) {
        expect([d.scope, d.id, d.path, (d.scope === "tmp" ? flagged : teams).has(d.id)]).toEqual([
          d.scope,
          d.id,
          d.path,
          true,
        ]);
      }
      // Not vacuous, and nothing the rule accepts escapes the check. (A few values of the three
      // late-entry teams fall to performance-order-2026 when this rule is left out.)
      expect(strict.differenceCount).toBeGreaterThan(0);
      expect(strict.differenceCount).toBeLessThanOrEqual(
        accepted2026[name as keyof typeof accepted2026]["shift-numbering-2026"],
      );
    },
    60000,
  );

  it("the migration reports v5 shift numbers the clock does not fit (#326)", () => {
    const numbering = Object.fromEntries(
      goldenSets
        .filter((s) => s.name.startsWith("2026"))
        .map((s) => {
          const n = runGoldenSet(s).migration.shiftNumbering;
          return [s.name, [n.actions, n.disagree, n.performances.length]];
        }),
    );
    // The real event: late presses, repeated toggles and labels that did not flip. The synthetic
    // event: the generated scouter alternates at the clock, except after a late or repeated press.
    expect(numbering).toEqual({
      "2026mnwi_official-v5": [6479, 333, 175],
      "2026syn_synthetic-v5": [2172, 84, 31],
    });
  });

  it("the translation table comes from the configuration's prefixes", () => {
    const set = goldenSets.find((s) => s.name === "2026mnwi_official-v5")!;
    const { config, pipeline } = runGoldenSet(set);
    const t = translationFor(config, pipeline)!;
    expect(t.mapLegacyPath("tmp", "counts.activeShift1Defense")).toBe("counts.active1.Defense");
    // v5's second active shift is clock slot 3 or 4; the table names the first (#326).
    expect(t.mapLegacyPath("tmp", "counts.activeShift2Defense")).toBe("counts.active3.Defense");
    expect(t.mapLegacyPath("tmp", "counts.teleopTransitionRatingStoring2")).toBe(
      "counts.transition.RatingStoring2",
    );
    expect(t.mapLegacyPath("team", "averages.autoPassing")).toBe("averages.auto.Passing");
    expect(t.mapLegacyPath("tmp", "counts.endGameTowerRobot_Level3")).toBe(
      "counts.endgame.endGameTowerRobot_Level3",
    );
    expect(t.mapLegacyPath("tmp", "counts.preloadFuel")).toBe("counts.preMatch.preloadFuel");
    // Values a pipeline entry wrote, and paths outside grouped counts, stay as they are.
    expect(t.mapLegacyPath("tmp", "counts.shooting")).toBe("counts.shooting");
    expect(t.mapLegacyPath("tmp", "scores.activeShift1DefenseRating")).toBe(
      "scores.activeShift1DefenseRating",
    );
    expect(
      t.mapLegacyValue("tmp", "cycle.shootingTime.all.0.starts.id", "activeShift1StartShooting"),
    ).toBe("StartShooting");
    // 2025 recorded no composite ids: nothing to translate.
    const s2025 = runGoldenSet(goldenSets.find((s) => s.name === "2025syn_synthetic-v4.2.0")!);
    expect(translationFor(s2025.config, s2025.pipeline)).toBeNull();
  });

  it("NaN is accepted only where there was nothing to average (DM-1b)", () => {
    for (const name of Object.keys(accepted2026)) {
      const paths = Object.keys(comparisons.get(name)!.acceptedPaths["missing-nan"]);
      expect(
        paths.every((p) =>
          /^(cycles?\.\w+\.averageTime(Complete|Seconds)?|averageScores\.\w+Rating)$/.test(p),
        ),
      ).toBe(true);
    }
  });

  it("F-29 (#392): the climb time, once v5's misspelled id names the button, is the first AttemptClimb press", () => {
    // v5 asked for "attemptClimb" and wrote null everywhere; the active configuration names the
    // button, and attempt-climb-2026 accepts exactly the performances that pressed it.
    const name = "2026mnwi_official-v5";
    const set = goldenSets.find((s) => s.name === name)!;
    const { dataset } = runGoldenSet(set);
    const pressed = dataset.tmps.filter((t) => t.actions.some((a) => a.id === "AttemptClimb"));
    expect(pressed.length).toBeGreaterThan(10);
    for (const t of pressed)
      expect(getPath(t, "actionTimes.attemptClimb", null)).toBe(
        t.actions.find((a) => a.id === "AttemptClimb")!.ts,
      );
    const c = comparisons.get(name)!;
    expect(c.acceptedPaths["attempt-climb-2026"]["actionTimes.attemptClimb"]).toBe(pressed.length);
  });
});

describe("divergence rules in use", () => {
  it("every rule is applied by some golden set", () => {
    const applied = new Set([...comparisons.values()].flatMap((c) => Object.keys(c.accepted)));
    expect(
      loadDivergences()
        .filter((r) => !applied.has(r.id))
        .map((r) => r.id),
    ).toEqual([]);
  });
});
