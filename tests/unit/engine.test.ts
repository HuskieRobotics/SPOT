/**
 * Analysis engine core (#310): paths (TR-3), the dataset (TR-4, SEC-8, DM-1a, BL-31), the
 * registry (ADR 0005, CS-10) and the runner (AN-10, DM-1b). Transformers come in #311 to #315;
 * these tests use small stand-ins.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generate } from "@/generate/synthetic";
import type { MatchScoutingConfig, PipelineEntry } from "@/config/types";
import {
  buildDataset,
  builtInOptions,
  checkPipeline,
  defineTransformer,
  describeProblem,
  getPath,
  hasPath,
  normalizeMissing,
  observePathReads,
  PathError,
  runPipeline,
  setPath,
  suggest,
  TransformerRegistry,
  type AnalysisPerformance,
} from "@/analysis/engine";
import { builtInTransformers, createRegistry } from "@/analysis/transformers";

const config = JSON.parse(
  readFileSync(join(process.cwd(), "config", "seasons", "2025", "match-scouting.json"), "utf8"),
) as MatchScoutingConfig;
const generated = generate({ config, seed: "engine", matches: 6, bTeams: 2 });
const context = { config };

describe("TR-3: getPath and setPath", () => {
  const obj = { a: { b: { c: 1, n: null, zero: 0 }, list: [{ id: "x" }] } };

  it("reads nested values, array indexes, and the object itself for an empty path", () => {
    expect(getPath(obj, "a.b.c")).toBe(1);
    expect(getPath(obj, "a.list.0.id")).toBe("x");
    expect(getPath(obj, "")).toBe(obj);
  });

  it("throws without a default and returns the default when missing", () => {
    expect(() => getPath(obj, "a.b.missing")).toThrow(PathError);
    expect(getPath(obj, "a.b.missing", 0)).toBe(0);
    expect(getPath(obj, "a.b.c.deeper", "none")).toBe("none");
  });

  it("returns a null leaf as null: no data is a value (DM-1b)", () => {
    expect(getPath(obj, "a.b.n", 0)).toBeNull();
    expect(hasPath(obj, "a.b.n")).toBe(true);
  });

  it("treats a null part-way along the path as missing (v5 threw even with a default)", () => {
    expect(getPath(obj, "a.b.n.x", 7)).toBe(7);
    expect(hasPath(obj, "a.b.n.x")).toBe(false);
  });

  it("creates intermediate objects", () => {
    const target: Record<string, unknown> = {};
    setPath(target, "x.y.z", 3);
    expect(target).toEqual({ x: { y: { z: 3 } } });
  });

  it("refuses to write through a value that is not an object (v5 replaced or ignored it)", () => {
    const target: Record<string, unknown> = { counts: 0, name: "a" };
    expect(() => setPath(target, "counts.l4", 1)).toThrow(/"counts" already holds 0/);
    expect(() => setPath(target, "name.first", 1)).toThrow(PathError);
    expect(() => setPath(target, "", 1)).toThrow(PathError);
  });
});

describe("TR-4 / SEC-8: the dataset", () => {
  const dataset = buildDataset(generated.performances);

  it("has one performance per input and one team per team key, B robots included (DM-1a)", () => {
    expect(dataset.tmps).toHaveLength(generated.performances.length);
    const teams = Object.keys(dataset.teams);
    expect(new Set(teams)).toEqual(new Set(generated.performances.map((p) => p.team)));
    expect(teams.some((t) => t.endsWith("B"))).toBe(true);
  });

  it("SEC-8: carries no scouter information", () => {
    for (const tmp of dataset.tmps) {
      for (const field of ["scouterId", "matchKey", "nonce", "tenantId"]) {
        expect(tmp).not.toHaveProperty(field);
      }
      expect(JSON.stringify(tmp)).not.toMatch(/9000\d\d/); // the generator's scouter ids
    }
  });

  it("BL-31: actions carry no per-action _id", () => {
    for (const tmp of dataset.tmps)
      for (const a of tmp.actions) expect(a).not.toHaveProperty("_id");
  });

  it("TR-6: orders performances by match, then submission time, then id", () => {
    const keys = dataset.tmps.map((t) => [t.matchNumber, t.submittedAt, t._id] as const);
    const sorted = [...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]));
    expect(keys).toEqual(sorted);
    const shuffled = buildDataset([...generated.performances].reverse());
    expect(shuffled.tmps.map((t) => t._id)).toEqual(dataset.tmps.map((t) => t._id));
  });

  it("does not modify its input", () => {
    const before = JSON.stringify(generated.performances);
    buildDataset(generated.performances);
    expect(JSON.stringify(generated.performances)).toBe(before);
  });

  it("freezes stored fields, so an entry cannot corrupt later ones (F-3)", () => {
    const tmp = dataset.tmps[0];
    expect(() => (tmp.actions as unknown as unknown[]).reverse()).toThrow(TypeError);
    expect(() => ((tmp as Record<string, unknown>).team = "254")).toThrow(TypeError);
    expect(() => delete (tmp as Record<string, unknown>).actions).toThrow(TypeError);
    (tmp as Record<string, unknown>).counts = { ok: 1 }; // outputs are still writable
    expect(tmp.counts).toEqual({ ok: 1 });
  });
});

// ---------------------------------------------------------------- stand-in transformers

const actionCount = defineTransformer<{ scale?: number }>({
  type: "tmp",
  scope: "each",
  name: "actionCount",
  summary: "number of actions",
  optionsSchema: {
    type: "object",
    additionalProperties: false,
    properties: { scale: { type: "number" } },
  },
  run: (tmp, options) => tmp.actions.length * (options.scale ?? 1),
});

const teamTotal = defineTransformer<{ path: string }>({
  type: "team",
  scope: "each",
  name: "teamTotal",
  summary: "sum of a performance path",
  optionsSchema: builtInOptions("pathOnly"),
  run: ({ tmps }, options) =>
    tmps.reduce((sum, t) => sum + (getPath(t, options.path, 0) as number), 0),
});

const firstOnly = defineTransformer<Record<string, never>>({
  type: "tmp",
  scope: "dataset",
  name: "firstOnly",
  summary: "keep the first performance",
  optionsSchema: { type: "object", additionalProperties: false },
  run: (dataset) => ({ ...dataset, tmps: dataset.tmps.slice(0, 1) }),
});

const broken = defineTransformer<Record<string, never>>({
  type: "tmp",
  scope: "each",
  name: "broken",
  summary: "fails on matches after the first",
  optionsSchema: {},
  run: (tmp) => {
    if (tmp.matchNumber > 1) throw new Error("cannot handle this one");
    return 1;
  },
});

const missing = defineTransformer<Record<string, never>>({
  type: "team",
  scope: "each",
  name: "missing",
  summary: "produces values v5 would have left as NaN",
  optionsSchema: {},
  run: () => ({ nan: Number.NaN, inf: Infinity, undef: undefined, list: [Number.NaN, 2] }),
});

const registry = new TransformerRegistry([actionCount, teamTotal, firstOnly, broken, missing]);

const entry = (
  e: Partial<PipelineEntry> & Pick<PipelineEntry, "type" | "name">,
): PipelineEntry => ({
  outputPath: "out",
  ...e,
});

describe("ADR 0005 / CS-10: the registry", () => {
  it("refuses to register the same transformer twice", () => {
    expect(() => new TransformerRegistry([actionCount, actionCount])).toThrow(/twice/);
  });

  it("validates options against the declared schema, including built-in $refs", () => {
    expect(registry.validateOptions(actionCount, { scale: 2 })).toEqual([]);
    expect(registry.validateOptions(actionCount, { scal: 2 })).toMatchObject([
      { path: "(root)", message: 'unknown property "scal"; did you mean "scale"?' },
    ]);
    expect(registry.validateOptions(teamTotal, {})).toMatchObject([
      { path: "(root)", message: 'missing required property "path"' },
    ]);
  });

  it("built-in transformers use the pipeline schema for their options (ADR 0005)", () => {
    for (const t of builtInTransformers) {
      const schema = t.optionsSchema as { $ref?: string };
      expect(schema.$ref).toMatch(/analysis-pipeline\.schema\.json#\/\$defs\/options\/\w+$/);
    }
    expect(createRegistry().names("tmp")).toContain("countActions");
  });
});

describe("AN-10: running a pipeline", () => {
  it("runs tmp, team and dataset entries in order", () => {
    const dataset = buildDataset(generated.performances);
    const {
      dataset: out,
      problems,
      ran,
    } = runPipeline(
      dataset,
      [
        entry({ type: "tmp", name: "actionCount", outputPath: "counts.all" }),
        entry({
          type: "tmp",
          name: "actionCount",
          outputPath: "counts.double",
          options: { scale: 2 },
        }),
        entry({
          type: "team",
          name: "teamTotal",
          outputPath: "totals.all",
          options: { path: "counts.all" },
        }),
      ],
      { registry, context },
    );
    expect(problems).toEqual([]);
    expect(ran).toEqual([0, 1, 2]);
    const tmp = out.tmps[0] as AnalysisPerformance & { counts: { all: number; double: number } };
    expect(tmp.counts.double).toBe(tmp.counts.all * 2);
    const team = tmp.team;
    const expected = out.tmps
      .filter((t) => t.team === team)
      .reduce((s, t) => s + t.actions.length, 0);
    expect(getPath(out.teams[team], "totals.all")).toBe(expected);

    const cut = runPipeline(
      buildDataset(generated.performances),
      [entry({ type: "tmp", name: "firstOnly" })],
      {
        registry,
        context,
      },
    );
    expect(cut.dataset.tmps).toHaveLength(1);
  });

  it("checks every entry first, suggests names, and skips only the bad ones", () => {
    const { problems, ran } = runPipeline(
      buildDataset(generated.performances),
      [
        entry({ type: "tmp", name: "actionCont" }),
        entry({ type: "team", name: "actionCount" }),
        entry({ type: "tmp", name: "actionCount", options: { scale: "big" } }),
        entry({ type: "tmp", name: "actionCount", outputPath: "fine" }),
      ],
      { registry, context },
    );
    expect(ran).toEqual([3]);
    expect(problems.map((p) => [p.index, p.stage, p.message])).toEqual([
      [0, "check", 'There is no tmp transformer named "actionCont". Did you mean "actionCount"?'],
      [
        1,
        "check",
        'There is no team transformer named "actionCount". There is a tmp transformer with that name; check "type".',
      ],
      [2, "check", "Invalid options: options.scale: must be number"],
    ]);
  });

  it("reports a failure per entry with the first performance, and keeps going", () => {
    const { dataset, problems, ran } = runPipeline(
      buildDataset(generated.performances),
      [
        entry({ type: "tmp", name: "broken", outputPath: "b" }),
        entry({ type: "tmp", name: "actionCount", outputPath: "after" }),
      ],
      { registry, context },
    );
    expect(ran).toEqual([0, 1]);
    expect(problems).toHaveLength(1);
    const [p] = problems;
    expect(p.stage).toBe("run");
    expect(p.message).toBe("cannot handle this one");
    expect(p.failed?.of).toBe(dataset.tmps.length);
    expect(p.failed?.count).toBe(dataset.tmps.filter((t) => t.matchNumber > 1).length);
    expect(p.failed?.first).toMatch(/^performance [0-9a-f]{24} \(match \d+, team \w+\)$/);
    expect(dataset.tmps.every((t) => typeof t.after === "number")).toBe(true);
    expect(describeProblem(p)).toMatch(
      /^pipeline entry 1 \(tmp broken → b\): cannot handle this one \[failed for \d+ of \d+; first: performance /,
    );
  });

  it("DM-1b: writes null where a transformer produced NaN, Infinity or undefined", () => {
    const { dataset } = runPipeline(
      buildDataset(generated.performances),
      [entry({ type: "team", name: "missing" })],
      {
        registry,
        context,
      },
    );
    for (const data of Object.values(dataset.teams)) {
      expect(data.out).toEqual({ nan: null, inf: null, undef: null, list: [null, 2] });
    }
    expect(normalizeMissing(Object.freeze({ keep: Number.NaN }))).toEqual({ keep: Number.NaN });
  });

  it("checkPipeline alone runs nothing", () => {
    const { runnable, problems } = checkPipeline(
      [entry({ type: "tmp", name: "actionCount" })],
      registry,
    );
    expect(runnable).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  it("suggest finds near misses only", () => {
    expect(suggest("countAction", ["countActions", "sum"])).toBe("countActions");
    expect(suggest("zzz", ["countActions", "sum"])).toBeNull();
  });

  it("calls beforeEntry and afterEntry around each entry that runs (config:check, #317)", () => {
    const calls: string[] = [];
    runPipeline(
      buildDataset(generated.performances),
      [
        entry({ type: "tmp", name: "actionCount", outputPath: "a" }),
        entry({ type: "tmp", name: "actionCuont", outputPath: "b" }),
        entry({ type: "team", name: "teamTotal", outputPath: "c", options: { path: "a" } }),
      ],
      {
        registry,
        context,
        beforeEntry: (i, d) => calls.push(`before ${i} ${hasPath(d.tmps[0], "a")}`),
        afterEntry: (i, d) => calls.push(`after ${i} ${hasPath(d.tmps[0], "a")}`),
      },
    );
    expect(calls).toEqual(["before 0 false", "after 0 true", "before 2 true", "after 2 true"]);
  });
});

describe("#317: watching what the pipeline reads", () => {
  it("reports each getPath and hasPath with the value found, only while observing", () => {
    const seen: [unknown, string, unknown][] = [];
    const obj = { a: { b: 1, n: null } };
    const result = observePathReads(
      (target, path, value) => seen.push([target, path, value]),
      () => {
        getPath(obj, "a.b");
        getPath(obj, "a.n");
        getPath(obj, "a.missing", 0);
        hasPath(obj, "x");
        return "done";
      },
    );
    getPath(obj, "a.b");
    expect(result).toBe("done");
    expect(seen).toEqual([
      [obj, "a.b", 1],
      [obj, "a.n", null],
      [obj, "a.missing", undefined],
      [obj, "x", undefined],
    ]);
  });

  it("stops observing when the work throws, and restores an outer observer", () => {
    const outer: string[] = [];
    const inner: string[] = [];
    observePathReads(
      (_, path) => outer.push(path),
      () => {
        expect(() =>
          observePathReads(
            (_, path) => inner.push(path),
            () => getPath({}, "missing"),
          ),
        ).toThrow(PathError);
        getPath({ x: 1 }, "x");
      },
    );
    expect(inner).toEqual(["missing"]);
    expect(outer).toEqual(["x"]);
  });
});
