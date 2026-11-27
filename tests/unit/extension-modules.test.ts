/**
 * Extension modules (ADR 0005, #391; docs/spec/09 MO-1, MO-2; docs/spec/20 CC-5, CC-10): a file
 * plus one export line, with a JSON Schema for its options. config:check checks the name and the
 * options, and the dashboard draws it. The worked example is
 * `src/components/analysis/extensions/examples/percentile.tsx`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Dataset } from "@/analysis/engine";
import { defineModule, type ExtensionModule } from "@/components/analysis/extension-api";
import {
  BUILT_IN_MODULE_NAMES,
  createModules,
  extensionModules,
  MODULE_NAME,
  type ModuleSet,
} from "@/components/analysis/extension-modules";
import { percentile } from "@/components/analysis/extensions/examples/percentile";
import { BUILT_IN_MODULES } from "@/components/analysis/modules";
import { checkConfiguration } from "@/config/check";
import { validateModuleOptions } from "@/config/check/extension-modules";
import { builtInModules } from "@/config/check/references";
import type { AnalysisModulesConfig, MatchScoutingConfig, ModuleEntry } from "@/config/types";

// The example is added here unless someone has registered it for real, as the guide describes;
// registering it twice would throw.
const registered = extensionModules.some((m) => m.name === "Percentile");
const example: readonly ExtensionModule[] = registered ? [] : [percentile];
const withExample = (...more: ExtensionModule[]) => createModules([...more, ...example]);

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("ADR 0005, #391: registering an extension module", () => {
  const all = [...extensionModules, ...example];

  it.each(all.map((m) => [m.name, m] as const))(
    "%s: a usable name, a summary, and a schema that compiles and rejects an unknown option",
    (_, m) => {
      expect(m.name).toMatch(MODULE_NAME);
      expect(m.summary.trim().length).toBeGreaterThan(0);
      expect(typeof m.component).toBe("function");
      expect(validateModuleOptions(m, { notAnOption: 1 })).toContainEqual(
        expect.objectContaining({ message: 'unknown property "notAnOption"' }),
      );
    },
  );

  it("refuses a name no entry could use, a built-in's name, and a name registered twice", () => {
    const named = (name: string) => defineModule({ ...percentile, name });
    expect(() => createModules([named("my_module")])).toThrow(
      'extension module "my_module": a name starts with a letter and has only letters and digits',
    );
    expect(() => createModules([named("Stats")])).toThrow(
      'extension module "Stats": "Stats" is a built-in module; choose another name',
    );
    expect(() => createModules([named("Twice"), named("Twice")])).toThrow(
      'extension module "Twice" is registered twice',
    );
  });

  it("the built-in names are the schema's and the dashboard's", () => {
    expect([...BUILT_IN_MODULE_NAMES].sort()).toEqual(builtInModules().sort());
    expect(Object.keys(BUILT_IN_MODULES).sort()).toEqual([...BUILT_IN_MODULE_NAMES].sort());
  });

  it('config:check reads them on the server: no "use client" and no hooks in the files it reads', () => {
    // Next.js builds the configuration routes as server components (CS-17), where a hook is a
    // build error and a "use client" file is an empty reference.
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(path) ? [path] : [];
      });
    const dir = join(process.cwd(), "src", "components", "analysis");
    const offending = [
      ...files(join(dir, "extensions")),
      join(dir, "extension-api.ts"),
      join(dir, "extension-modules.ts"),
    ].flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return [/^\s*["']use client["']/m, /import\s*\{[^}]*\buse[A-Z]\w*[^}]*\}\s*from\s*"react"/]
        .filter((pattern) => pattern.test(text))
        .map((pattern) => `${file}: ${pattern}`);
    });
    expect(offending).toEqual([]);
  });

  it("the extension index exports modules only, one line each, alphabetical", () => {
    const index = read("src", "components", "analysis", "extensions", "index.ts");
    const code = index
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("//") && line !== "export {};");
    for (const line of code) expect(line).toMatch(/^export \{ \w+ \} from "\.\/[\w-]+";$/);
    expect(code).toEqual([...code].sort((a, b) => a.localeCompare(b)));
    expect(code).toHaveLength(extensionModules.length);
  });
});

// ------------------------------------------------------------------------- config:check

const season = (kind: string) => read("config", "seasons", "2025", `${kind}.json`);

/** 2025's configuration with one more team module; what config:check finds about it. */
function check(entry: Partial<ModuleEntry>, modules: ModuleSet = withExample(), generated = false) {
  const config = JSON.parse(season("analysis-modules")) as AnalysisModulesConfig;
  config.modules.push({ view: "team", name: "Mine", options: {}, ...entry } as ModuleEntry);
  const at = config.modules.length;
  const report = checkConfiguration(
    {
      "match-scouting": season("match-scouting"),
      "analysis-pipeline": season("analysis-pipeline"),
      "analysis-modules": JSON.stringify(config),
    },
    { generated, modules },
  );
  return report.findings
    .filter((f) => f.where.startsWith(`module ${at} `))
    .map((f) => [f.severity, f.where, f.message, f.hint]);
}

describe("CC-5, #391: config:check checks an extension module's name and options", () => {
  const at = 'module 20 (team Percentile "Mine")';
  const hint = "Percentile: Where one team stands among the event's teams on a value.";

  it("an extension's options that pass are not reported", () => {
    expect(check({ module: "Percentile", options: { path: "averageScores.auto" } })).toEqual([]);
  });

  it("an unknown name is an error, with the name it is closest to", () => {
    expect(check({ module: "Percentil", options: {} })).toEqual([
      [
        "error",
        'module 20 (team Percentil "Mine") › module',
        'There is no module "Percentil".',
        'Did you mean "Percentile"?',
      ],
    ]);
    // Not registered, the example is unknown too.
    expect(check({ module: "Percentile", options: {} }, createModules())[0]?.[2]).toBe(
      registered ? 'missing required property "path"' : 'There is no module "Percentile".',
    );
  });

  it("options are checked against the extension's own schema", () => {
    expect(check({ module: "Percentile", options: { pth: "averageScores.auto" } })).toEqual([
      ["error", `${at} › options`, 'missing required property "path"', hint],
      ["error", `${at} › options.pth`, 'unknown property "pth"; did you mean "path"?', hint],
    ]);
    expect(
      check({ module: "Percentile", options: { path: "averageScores.auto", lowerIsBetter: "no" } }),
    ).toEqual([["error", `${at} › options.lowerIsBetter`, "must be boolean", hint]]);
  });

  it("CC-10: a path the pipeline never writes is an error, as for a built-in module", () => {
    expect(
      check({ module: "Percentile", options: { path: "averageScores.autoo" } }, undefined, true),
    ).toEqual([
      [
        "error",
        `${at} › options.path`,
        'analysis-pipeline.json never writes the team value "averageScores.autoo", so this module would always show No Data.',
        expect.stringContaining('"averageScores.auto"'),
      ],
    ]);
  });

  it("a schema that does not compile is reported as a bug in the extension", () => {
    const broken = defineModule({
      ...percentile,
      name: "Broken",
      optionsSchema: { type: "object", propertiez: {} },
    });
    const [finding] = check({ module: "Broken" }, createModules([broken]));
    expect(finding[0]).toBe("error");
    expect(finding[2]).toMatch(/^The options schema of module "Broken" does not compile/);
    expect(finding[3]).toBe(
      "This is a bug in the module's code, not in the configuration. Ask whoever wrote the extension to fix it.",
    );
  });
});

// ------------------------------------------------------------------------- drawn

describe("MO-1, F-27: the example draws from its options and the dataset", () => {
  const dataset = {
    tmps: [],
    teams: {
      "111": { averageScores: { auto: 10 } },
      "254": { averageScores: { auto: 30 } },
      "3061": { averageScores: { auto: 20 } },
      "9999": {},
    },
  } as unknown as Dataset;
  const draw = (team: string, options: Record<string, unknown>) =>
    // No hooks, so the drawing is a plain function of its props.
    renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        percentile.component({
          module: { view: "team", module: "Percentile", name: "Auto", options } as ModuleEntry,
          teams: [team],
          dataset,
          matchScouting: {} as MatchScoutingConfig,
          options,
        }),
      ),
    );

  it("better than the other teams with a value; a team without one is not compared", () => {
    expect(draw("3061", { path: "averageScores.auto" })).toContain(
      "Better than 50 % of the 2 other teams with a value.",
    );
    expect(draw("3061", { path: "averageScores.auto", lowerIsBetter: true })).toContain(
      'data-percent="50"',
    );
    expect(draw("254", { path: "averageScores.auto" })).toContain('data-percent="100"');
    expect(draw("9999", { path: "averageScores.auto" })).toContain("No Data");
  });
});
