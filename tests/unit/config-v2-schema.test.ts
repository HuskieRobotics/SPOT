/**
 * T-3: JSON Schema v2 for the configuration files (docs/spec/20-config-schema-v2.md).
 * Checks that the schemas compile under Ajv strict mode, accept minimal valid documents,
 * and produce readable errors for the mistakes people make when editing JSON by hand.
 */
import { describe, expect, it } from "vitest";
import { getValidator, validateConfig, type ConfigKind } from "@/config/validate";
import type {
  AnalysisModulesConfig,
  AnalysisPipelineConfig,
  MatchScoutingConfig,
  QrConfig,
} from "@/config/types";

const kinds: ConfigKind[] = ["match-scouting", "analysis-pipeline", "analysis-modules", "qr"];

const minimalMatchScouting = (): MatchScoutingConfig => ({
  version: 2,
  timing: {
    totalMs: 160000,
    phases: [
      { id: "auto", label: "Auto", startMs: 159999, layer: "auto", prefix: "auto" },
      { id: "teleop", label: "Teleop", startMs: 130000, layer: "teleop", prefix: "teleop" },
    ],
  },
  idPrefixing: "phase",
  variables: {},
  rules: {
    undo: { minQueueLength: 2 },
    positionLockMs: 1000,
    locks: [],
    allianceRelativeButtons: [],
    fieldMap: { image: "/img/field.svg" },
  },
  layout: {
    rows: 4,
    columns: 4,
    initialLayer: "start",
    layers: [
      {
        id: "start",
        buttons: [
          {
            id: "startGame",
            label: "Start",
            type: "match-control",
            gridArea: [1, 1, 2, 2],
            executables: [{ type: "layer", to: "auto" }],
          },
        ],
      },
      {
        id: "auto",
        buttons: [
          {
            id: "Score",
            type: "action",
            gridArea: [1, 1, 2, 2],
            color: "#4caf50",
            executables: [{ type: "position" }],
          },
        ],
      },
      {
        id: "teleop",
        buttons: [{ id: "Score", type: "action", gridArea: [1, 1, 2, 2], executables: [] }],
      },
    ],
  },
  extraActionIds: [],
});

const minimalPipeline = (): AnalysisPipelineConfig => ({
  version: 2,
  enrichment: {
    tba: { scoreBreakdown: { enabled: true, prefixes: ["auto", "endGame"] }, componentOprs: [] },
  },
  pipeline: [
    { type: "tmp", name: "countActions", outputPath: "counts", options: { all: true } },
    { type: "team", name: "average", outputPath: "avgScore", options: { path: "counts.Score" } },
  ],
});

const minimalModules = (): AnalysisModulesConfig => ({
  version: 2,
  modules: [
    {
      view: "team",
      module: "Stats",
      position: "side",
      name: "Stats",
      options: { list: [{ name: "Avg", path: "avgScore" }] },
    },
  ],
  filterTeams: { ratingBands: [] },
});

const minimalQr = (): QrConfig => ({
  version: 2,
  actionSchema: [
    { key: "id", bits: 16 },
    { key: "ts", bits: 32 },
  ],
});

describe("v2 configuration schemas", () => {
  for (const kind of kinds) {
    it(`${kind} schema compiles under Ajv strict mode`, () => {
      expect(() => getValidator(kind)).not.toThrow();
    });
  }

  it("accepts minimal valid documents", () => {
    expect(validateConfig("match-scouting", minimalMatchScouting())).toEqual({
      ok: true,
      issues: [],
    });
    expect(validateConfig("analysis-pipeline", minimalPipeline())).toEqual({
      ok: true,
      issues: [],
    });
    expect(validateConfig("analysis-modules", minimalModules())).toEqual({ ok: true, issues: [] });
    expect(validateConfig("qr", minimalQr())).toEqual({ ok: true, issues: [] });
  });

  it("rejects v1 documents and wrong versions", () => {
    expect(validateConfig("match-scouting", { timing: { totalTime: 160000 }, layout: {} }).ok).toBe(
      false,
    );
    const r = validateConfig("qr", { ...minimalQr(), version: 1 });
    expect(r.ok).toBe(false);
    expect(r.issues).toContainEqual({ path: "version", message: "must be 2" });
  });

  it("rejects seconds where milliseconds are required", () => {
    const c = minimalMatchScouting();
    c.timing.totalMs = 160;
    const r = validateConfig("match-scouting", c);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.path === "timing.totalMs")).toBe(true);
  });

  it("names unknown properties with their path", () => {
    const c = minimalMatchScouting() as unknown as Record<string, unknown>;
    (c.rules as Record<string, unknown>).positionLock = 1000;
    const r = validateConfig("match-scouting", c);
    expect(r.issues).toContainEqual({ path: "rules", message: 'unknown property "positionLock"' });
  });

  it("validates built-in transformer options strictly", () => {
    const p = minimalPipeline();
    p.pipeline[0].options = { all: true, actionArrayPaths: "x" };
    const r = validateConfig("analysis-pipeline", p);
    expect(r.ok).toBe(false);
    expect(r.issues).toContainEqual({
      path: "pipeline.0.options",
      message: 'unknown property "actionArrayPaths"',
    });

    const missing = minimalPipeline();
    missing.pipeline[1].options = {};
    expect(validateConfig("analysis-pipeline", missing).issues).toContainEqual({
      path: "pipeline.1.options",
      message: 'missing required property "path"',
    });
  });

  it("accepts extension transformers and modules with any options", () => {
    const p = minimalPipeline();
    p.pipeline.push({
      type: "team",
      name: "myCustomThing",
      outputPath: "custom",
      options: { anything: [1, 2, 3] },
    });
    expect(validateConfig("analysis-pipeline", p).ok).toBe(true);
    const m = minimalModules();
    m.modules.push({ view: "match", module: "MyWidget", name: "Widget", options: { foo: "bar" } });
    expect(validateConfig("analysis-modules", m).ok).toBe(true);
  });

  it("accepts phase segments with repeats and kinds, and rejects malformed ones", () => {
    const c = minimalMatchScouting();
    c.timing.phases[1].segments = [
      { id: "transition", startMs: 130000, prefix: "teleopTransition" },
      {
        id: "shift",
        startMs: 120000,
        layer: "teleop",
        repeat: { intervalMs: 25000, count: 4 },
        kinds: [{ id: "active", prefix: "activeShift", toggleButton: "startGame" }],
      },
    ];
    expect(validateConfig("match-scouting", c)).toEqual({ ok: true, issues: [] });

    c.timing.phases[1].segments[1].repeat = { intervalMs: 25000, count: 0 };
    expect(validateConfig("match-scouting", c).ok).toBe(false);

    const bad = minimalMatchScouting() as unknown as Record<string, unknown>;
    const phases = (bad.timing as { phases: Record<string, unknown>[] }).phases;
    phases[1].segments = [{ id: "shift", startMs: 120000, maxIndex: 4 }];
    expect(validateConfig("match-scouting", bad).issues).toContainEqual({
      path: "timing.phases.1.segments.0",
      message: 'unknown property "maxIndex"',
    });
  });

  it("validates executables by type and accepts custom executables", () => {
    const c = minimalMatchScouting();
    c.layout.layers[1].buttons[0].executables = [
      { type: "layer", to: "teleop" },
      { type: "multiplier", count: 3 },
      { type: "sparkle", args: [1] },
    ];
    expect(validateConfig("match-scouting", c).ok).toBe(true);
    c.layout.layers[1].buttons[0].executables = [{ type: "multiplier", count: 1 }];
    expect(validateConfig("match-scouting", c).ok).toBe(false);
  });

  it("validates module options strictly for built-ins", () => {
    const m = minimalModules();
    m.modules[0].options = { list: [{ name: "Avg", path: "avgScore", decimal: 2 }] };
    const r = validateConfig("analysis-modules", m);
    expect(r.ok).toBe(false);
    expect(r.issues).toContainEqual({
      path: "modules.0.options.list.0",
      message: 'unknown property "decimal"',
    });
  });
});
