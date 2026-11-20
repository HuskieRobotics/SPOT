/**
 * Extension transformers (#316; ADR 0005; docs/spec/09 TR-9, TR-10, TR-14; CS-10; T-2): the
 * registration point, the example, and the rules every registered transformer must meet.
 * That analysis code fetches nothing and imports nothing from Node is checked for every file
 * under src/analysis, extensions included, in tba-enrichment.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDataset,
  checkPipeline,
  defineTransformer,
  runPipeline,
  TransformerRegistry,
  type AnalysisPerformance,
  type Dataset,
  type Transformer,
} from "@/analysis/engine";
import { median } from "@/analysis/extensions/examples/median";
import {
  builtInTransformers,
  createRegistry,
  extensionTransformers,
} from "@/analysis/transformers";
import { validateConfig } from "@/config/validate";
import { generate } from "@/generate/synthetic";
import type { AnalysisPipelineConfig, MatchScoutingConfig, PipelineEntry } from "@/config/types";
import type { TeamMatchPerformance } from "@/data/types";

const config = JSON.parse(
  readFileSync(join(process.cwd(), "config", "seasons", "2025", "match-scouting.json"), "utf8"),
) as MatchScoutingConfig;
const context = { config };

// The example is added to the registry here unless someone has registered it for real, as the
// guide describes; registering it twice would throw.
const registered = extensionTransformers.some((t) => t.type === "team" && t.name === "median");
const example: readonly Transformer[] = registered ? [] : [median];
const withExample = (...more: Transformer[]) => createRegistry([...more, ...example]);
const [base] = generate({ config, seed: "extensions", matches: 1, robotsPerMatch: 1 }).performances;

/** One team, one performance per entry of `values`. */
function teamDataset(values: Record<string, unknown>[]): Dataset {
  const performances: TeamMatchPerformance[] = values.map((_, i) => ({
    ...base,
    _id: String(i).padStart(24, "0"),
    matchNumber: i + 1,
    submittedAt: base.submittedAt + i,
  }));
  const dataset = buildDataset(performances);
  dataset.tmps.forEach((tmp, i) => Object.assign(tmp, values[i]));
  return dataset;
}

const medianEntry = (options: Record<string, unknown>): PipelineEntry => ({
  type: "team",
  name: "median",
  outputPath: "medians.r",
  options,
});

function runMedian(values: Record<string, unknown>[], options: Record<string, unknown>) {
  const { dataset, problems } = runPipeline(teamDataset(values), [medianEntry(options)], {
    registry: withExample(),
    context,
  });
  const out = Object.values(dataset.teams)[0].medians as { r: unknown } | undefined;
  return { problems, value: out?.r };
}

describe("ADR 0005: the example extension", () => {
  it("registers, runs, and writes the median, skipping No Data", () => {
    expect(runMedian([{ r: 5 }, { r: 1 }, { r: null }, {}, { r: 3 }], { path: "r" })).toEqual({
      problems: [],
      value: 3,
    });
    expect(runMedian([{ r: 4 }, { r: 1 }, { r: 10 }, { r: 2 }], { path: "r" }).value).toBe(3);
  });

  it("with no values: null, or ifNone when configured (TR-12)", () => {
    expect(runMedian([{ r: null }, {}], { path: "r" }).value).toBeNull();
    expect(runMedian([{}], { path: "r", ifNone: 0 }).value).toBe(0);
  });

  it("rejects bad options with a clear message, and only that entry is skipped (TR-10)", () => {
    const { problems, ran } = runPipeline(
      teamDataset([{ r: 1 }]),
      [
        medianEntry({ pth: "r" }),
        medianEntry({ path: "r", ifNone: "zero" }),
        medianEntry({ path: " r" }),
        medianEntry({ path: "r" }),
      ],
      { registry: withExample(), context },
    );
    expect(ran).toEqual([3]);
    expect(problems.map((p) => [p.index, p.message])).toEqual([
      [
        0,
        'Invalid options: options: missing required property "path"; options: unknown property "pth"',
      ],
      [1, "Invalid options: options.ifNone: must be number"],
      [2, 'Invalid options: options.path: must match pattern "^\\S(.*\\S)?$"'],
    ]);
  });

  it("reports a value that is not a number, naming the path and the team", () => {
    const { problems } = runMedian([{ r: "high" }], { path: "r" });
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toBe('"r" holds "high", which is not a number');
    expect(problems[0].failed?.first).toMatch(/^team /);
  });

  it.skipIf(registered)("is not registered: a configuration naming it is told so", () => {
    const { problems } = checkPipeline([medianEntry({ path: "r" })], createRegistry());
    expect(problems.map((p) => p.message)).toEqual([
      'There is no team transformer named "median".',
    ]);
  });

  it("the pipeline schema accepts any options for a name it does not know; the registry checks them", () => {
    const file: AnalysisPipelineConfig = {
      version: 2,
      enrichment: {
        tba: { scoreBreakdown: { enabled: false, prefixes: [] }, componentOprs: [] },
      },
      pipeline: [medianEntry({ path: "r", typo: 1 })],
    };
    expect(validateConfig("analysis-pipeline", file).issues).toEqual([]);
    expect(checkPipeline(file.pipeline, withExample()).problems[0].message).toBe(
      'Invalid options: options: unknown property "typo"',
    );
  });
});

describe("TR-14: rules for extension transformers", () => {
  const stub = (name: string, optionsSchema: object = {}, type: "tmp" | "team" = "tmp") =>
    defineTransformer({
      type,
      scope: "each",
      name,
      summary: "stub",
      optionsSchema,
      run: () => 1,
    } as Transformer);

  it("an extension cannot take a built-in transformer's name, even for the other entry type", () => {
    expect(() => createRegistry([stub("average")])).toThrow(
      'extension transformer tmp.average: "average" is the name of a built-in transformer; choose another name',
    );
    expect(() => createRegistry([stub("median", {}, "team"), stub("median", {}, "team")])).toThrow(
      /registered twice/,
    );
  });

  it("a name must be one a pipeline entry can use", () => {
    expect(() => new TransformerRegistry([stub("my-transformer")])).toThrow(
      /a name starts with a letter and has only letters, digits and _/,
    );
  });

  it("a schema that does not compile is reported as a code bug for its entries only", () => {
    const broken = stub("broken", { type: "object", propertiez: {} });
    const { problems, ran } = runPipeline(
      teamDataset([{ r: 1 }]),
      [
        { type: "tmp", name: "broken", outputPath: "b" },
        { type: "team", name: "median", outputPath: "m", options: { path: "r" } },
      ],
      { registry: withExample(broken), context },
    );
    expect(ran).toEqual([1]);
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toMatch(
      /^The options schema of transformer tmp\.broken does not compile \(strict mode: unknown keyword: "propertiez"\)\. This is a bug in the transformer's code, not in the configuration;/,
    );
  });

  // Every transformer the app registers, plus the example, meets the rules that make extension
  // options as strict as built-in ones (CS-10). A new extension is checked here automatically.
  const registry = withExample();
  const all: readonly Transformer[] = [
    ...builtInTransformers,
    ...extensionTransformers,
    ...example,
  ];
  it.each(all.map((t) => [`${t.type}.${t.name}`, t] as const))(
    "%s: schema compiles, rejects an unknown option, and has a summary",
    (_, t) => {
      const issues = registry.validateOptions(t, { notAnOption: 1 });
      expect(issues).toContainEqual({ path: "(root)", message: 'unknown property "notAnOption"' });
      expect(t.summary.trim().length).toBeGreaterThan(0);
    },
  );

  it("the extension index exports transformers only, one line each, alphabetical", () => {
    for (const t of extensionTransformers) {
      expect(typeof t.run).toBe("function");
      expect(["tmp", "team"]).toContain(t.type);
    }
    const source = readFileSync(
      join(process.cwd(), "src", "analysis", "extensions", "index.ts"),
      "utf8",
    );
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("//") && line !== "export {};");
    for (const line of code) expect(line).toMatch(/^export \{ \w+ \} from "\.\/[\w-]+";$/);
    expect(code).toEqual([...code].sort((a, b) => a.localeCompare(b)));
    expect(code).toHaveLength(extensionTransformers.length);
  });
});

describe("the example's own logic", () => {
  const run = (values: unknown[], ifNone?: number) =>
    (median as Extract<Transformer, { type: "team"; scope: "each" }>).run(
      {
        team: "3061",
        tmps: values.map((r) => ({ ...base, r }) as unknown as AnalysisPerformance),
        data: {},
      },
      { path: "r", ...(ifNone === undefined ? {} : { ifNone }) },
      context,
    );

  it("odd and even counts, and one value", () => {
    expect(run([3, 1, 2])).toBe(2);
    expect(run([1, 2, 3, 100])).toBe(2.5);
    expect(run([7])).toBe(7);
  });

  it("does not reorder anything it was given", () => {
    const tmps = [5, 1, 3].map((r) => ({ ...base, r }) as unknown as AnalysisPerformance);
    (median as Extract<Transformer, { type: "team"; scope: "each" }>).run(
      { team: "3061", tmps, data: {} },
      { path: "r" },
      context,
    );
    expect(tmps.map((t) => t.r)).toEqual([5, 1, 3]);
  });
});
