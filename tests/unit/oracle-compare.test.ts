/**
 * T-4: the v6 engine against the legacy golden output (#310). The comparison itself is tested on
 * small inputs; then every golden set is migrated and run, and two kinds of check apply:
 *
 * - Structure, all sets: every legacy performance and team is present in v6 (migration keeps ids
 *   and team keys), and the only extra performances are the ones legacy removeDuplicates dropped.
 * - Acceptance, 2025 sets (#319, gate K-1): every entry runs and matches the golden output, after
 *   the reviewed divergences, each of which must accept exactly the values counted below.
 *   The 2026 sets join in #320, once their paths are translated (CS-16).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDataset, type Dataset } from "@/analysis/engine";
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
  type DivergenceRule,
} from "../../tools/oracle/compare";
import { goldenSets } from "../../tools/oracle/sets";

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
      "counts-nonaction-buttons-2025": 1964,
      "cycle-start-key-2025": 17648,
      "action-period-fields": 70592,
    },
    "2025syn_synthetic-v4.2.0": {
      "missing-nan": 1345,
      "ratio-falsy-divbyzero-2025": 1,
      "counts-nonaction-buttons-2025": 1824,
      "cycle-start-key-2025": 4068,
      "action-period-fields": 16272,
    },
  };

  it.each(Object.keys(accepted2025))("%s matches the golden output entry by entry", (name) => {
    const c = comparisons.get(name)!;
    expect(c.entries).toHaveLength(46);
    expect(c.entries.filter((e) => e.status !== "match")).toEqual([]);
    expect(c.differenceCount).toBe(0);
    expect(c.accepted).toEqual(accepted2025[name as keyof typeof accepted2025]);
  });

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
