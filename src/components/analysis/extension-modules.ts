/**
 * The modules an entry can name (ADR 0005, #391): the built-in modules the dashboard draws itself,
 * and the extension modules exported from `src/components/analysis/extensions/index.ts`.
 *
 * This file and the extensions are read on the server too, by config:check, so neither says
 * `"use client"` (see `extension-api.ts`). It holds no schema checker: config:check checks
 * extension options (`src/config/check/extension-modules.ts`), keeping Ajv out of the browser.
 */
import type { ExtensionModule } from "./extension-api";
import * as extensions from "./extensions";

/** The modules the dashboard draws itself, as analysis-modules.schema.json lists them (a test checks). */
export const BUILT_IN_MODULE_NAMES: readonly string[] = [
  "Bar",
  "ColumnDisplay",
  "Divider",
  "Grid",
  "HeatmapScatterPlot",
  "PerformanceTimePlot",
  "Pie",
  "RadarChart",
  "SingleDisplay",
  "Stats",
];

/** The names a module can have (the schema's `module` pattern). */
export const MODULE_NAME = /^[A-Za-z][A-Za-z0-9]*$/;

/** Extension modules by name. */
export type ModuleSet = ReadonlyMap<string, ExtensionModule>;

/** Every module exported from src/components/analysis/extensions/index.ts. */
export const extensionModules: readonly ExtensionModule[] = Object.values(
  extensions satisfies Record<string, ExtensionModule>,
);

/**
 * The app's extension modules, plus `extra` (tests). Refuses a name no entry could use, a built-in
 * module's name, and a name registered twice, naming the module.
 */
export function createModules(extra: readonly ExtensionModule[] = []): ModuleSet {
  const set = new Map<string, ExtensionModule>();
  for (const m of [...extensionModules, ...extra]) {
    if (!MODULE_NAME.test(m.name)) {
      throw new Error(
        `extension module "${m.name}": a name starts with a letter and has only letters and digits`,
      );
    }
    if (BUILT_IN_MODULE_NAMES.includes(m.name)) {
      throw new Error(
        `extension module "${m.name}": "${m.name}" is a built-in module; choose another name`,
      );
    }
    if (set.has(m.name)) throw new Error(`extension module "${m.name}" is registered twice`);
    set.set(m.name, m);
  }
  return set;
}

let app: ModuleSet | null = null;

/** The app's extension modules. */
export function appModules(): ModuleSet {
  return (app ??= createModules());
}
