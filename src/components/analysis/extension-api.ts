/**
 * What an extension module is (ADR 0005, #391; docs/spec/09 MO-1, MO-2). A guide for programmers
 * is in docs/extension-modules.md.
 *
 * A module entry in analysis-modules.json names its module by `module`. The built-in modules are
 * drawn by the dashboard's own code (`modules/index.tsx`). Any other name is an extension: a file
 * in `src/components/analysis/extensions/` plus one export line in the index there, built into the
 * app.
 *
 * - **Options.** The entry's `options`, described by a JSON Schema the extension declares.
 *   `npm run config:check` checks them, as the server does before it sends the file (CS-17), and
 *   the dashboard draws a module whose options have errors as a note saying so, so `component`
 *   only ever sees options that passed.
 * - **Where it runs.** config:check reads each extension's name and schema, also inside the
 *   server's routes, which Next.js builds as server components. So an extension's file must not
 *   say `"use client"` (the server would see none of it) and must not call React hooks itself.
 *   It draws with plain elements and the dashboard's own components (`ModuleFrame`'s parts,
 *   `Plot`), which may. A module that needs state of its own puts it in a second file that says
 *   `"use client"`, and imports that.
 * - **What it may change.** Nothing it is given: the dataset and the teams are shared by every
 *   module (F-18).
 */
import type { ReactNode } from "react";
import analysisModulesSchema from "@/config/schema/analysis-modules.schema.json";
import type { ModuleProps } from "./modules/types";

/** What the module is drawn from: the entry, the teams shown, the data, and its options. */
export interface ExtensionModuleProps<O> extends ModuleProps {
  /** The entry's `options`, checked against the schema. */
  options: O;
}

export interface ExtensionModule<O = Record<string, unknown>> {
  /**
   * The `module` an entry gives. It starts with a letter and has only letters and digits, and
   * cannot be a built-in module's name.
   */
  name: string;
  /** One line for the configuration guide and error messages. */
  summary: string;
  /**
   * JSON Schema (draft 2020-12) for the entry's `options`. It must have
   * `"additionalProperties": false`, so a misspelled option is an error. Use `modulesDef("path")`
   * for a team value, so config:check checks the path as it does a built-in module's.
   */
  optionsSchema: object;
  /**
   * Draws what goes under the module's name. The dashboard draws the card and the name around
   * it, and a note in its place if it throws. No hooks here (see above).
   */
  component: (props: ExtensionModuleProps<O>) => ReactNode;
}

/** Identity helper so a module's options are typed where it is written. */
export function defineModule<O>(module: ExtensionModule<O>): ExtensionModule {
  return module as unknown as ExtensionModule;
}

/**
 * A definition from the modules schema, for an extension's options schema: `"path"` (a team
 * value), `"performancePath"` (a value of each match), `"itemPath"` or `"actionId"`. config:check
 * then checks the value as it checks a built-in module's (CC-5, CC-10).
 */
export function modulesDef(name: "path" | "performancePath" | "itemPath" | "actionId"): {
  $ref: string;
} {
  return { $ref: `${analysisModulesSchema.$id}#/$defs/${name}` };
}
