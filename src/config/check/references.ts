/**
 * The ids an option names, found through the option's schema (#317): a value the schema checks
 * with `$defs/actionId` is a button id, and one checked with the period filters
 * (`$defs/periodFilter/properties/phases`, `…/segments`, `…/kinds`) is a period id. The schema
 * says which options hold ids, so a new built-in or an extension that reuses these definitions
 * (`pipelineDef("actionIdList")`) is checked without changing config:check.
 *
 * Module options also name paths: `$defs/path` is a team value, `$defs/performancePath` a value
 * of each match, and `$defs/itemPath` a path inside each item of a list (analysis-modules schema).
 * Pipeline paths are found by watching what the pipeline reads instead (`observePathReads`).
 */
import analysisModulesSchema from "../schema/analysis-modules.schema.json";
import analysisPipelineSchema from "../schema/analysis-pipeline.schema.json";
import type { Key } from "./json";

export type PeriodKind = "phase" | "segment" | "kind";
export type PathKind = "path" | "performancePath" | "itemPath";
export type ReferenceKind = "action" | PeriodKind | PathKind;

export const isPeriod = (kind: ReferenceKind): kind is PeriodKind =>
  kind === "phase" || kind === "segment" || kind === "kind";

export interface Reference {
  kind: ReferenceKind;
  id: string;
  /** Keys of the value (or, for an id used as a property name, of that property). */
  keys: Key[];
}

type Schema = Record<string, unknown>;

const ROOTS: Record<string, Schema> = {
  [analysisPipelineSchema.$id]: analysisPipelineSchema as Schema,
  [analysisModulesSchema.$id]: analysisModulesSchema as Schema,
};

const PATHS: readonly string[] = ["path", "performancePath", "itemPath"];

const PERIODS: Record<string, PeriodKind> = {
  "periodFilter/properties/phases": "phase",
  "periodFilter/properties/segments": "segment",
  "periodFilter/properties/kinds": "kind",
};

function resolve(ref: string, root: Schema): { schema: Schema; root: Schema } | null {
  const [base, fragment = ""] = ref.split("#");
  const target = base ? ROOTS[base] : root;
  if (!target) return null;
  let node: unknown = target;
  for (const raw of fragment.split("/").filter(Boolean)) {
    const part = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    node = node !== null && typeof node === "object" ? (node as Schema)[part] : undefined;
  }
  return node !== null && typeof node === "object"
    ? { schema: node as Schema, root: target }
    : null;
}

const definition = (ref: string): string => ref.split("#/$defs/")[1] ?? "";

/**
 * Every id `value` names, walking it alongside `schema`. `root` resolves local `$ref`s; an
 * extension's schema is its own root and reaches the shared definitions by their `$id`.
 */
export function findReferences(
  value: unknown,
  schema: unknown,
  keys: Key[] = [],
  root: Schema = (schema ?? {}) as Schema,
): Reference[] {
  const found = new Map<string, Reference>();
  const add = (r: Reference) => found.set(`${r.kind} ${JSON.stringify(r.keys)}`, r);

  const walk = (v: unknown, s: unknown, at: Key[], r: Schema, depth: number): void => {
    if (s === null || typeof s !== "object" || depth > 50) return;
    const node = s as Schema;
    if (typeof node.$ref === "string") {
      const name = definition(node.$ref);
      const modules = node.$ref.startsWith("#")
        ? r === modulesRoot
        : node.$ref.startsWith(analysisModulesSchema.$id);
      if (name === "actionId") {
        if (typeof v === "string") add({ kind: "action", id: v, keys: at });
      } else if (modules && PATHS.includes(name)) {
        if (typeof v === "string") add({ kind: name as PathKind, id: v, keys: at });
      } else if (PERIODS[name]) {
        if (Array.isArray(v)) {
          v.forEach((id, i) => {
            if (typeof id === "string") add({ kind: PERIODS[name], id, keys: [...at, i] });
          });
        }
      } else {
        const target = resolve(node.$ref, r);
        if (target) walk(v, target.schema, at, target.root, depth + 1);
      }
    }
    for (const combinator of ["allOf", "anyOf", "oneOf"]) {
      const branches = node[combinator];
      if (!Array.isArray(branches)) continue;
      // A value that is one alternative's constant ("none" for a RadarChart path) took that one.
      if (combinator !== "allOf" && branches.some((b) => (b as Schema)?.const === v)) continue;
      for (const b of branches) walk(v, b, at, r, depth + 1);
    }
    if (Array.isArray(v)) {
      if (node.items) v.forEach((item, i) => walk(item, node.items, [...at, i], r, depth + 1));
      return;
    }
    if (v === null || typeof v !== "object") return;
    const object = v as Record<string, unknown>;
    const properties = (node.properties ?? {}) as Schema;
    const names = node.propertyNames as Schema | undefined;
    for (const [key, child] of Object.entries(object)) {
      if (names?.$ref && definition(names.$ref as string) === "actionId") {
        add({ kind: "action", id: key, keys: [...at, key] });
      }
      const childSchema = Object.hasOwn(properties, key)
        ? properties[key]
        : typeof node.additionalProperties === "object"
          ? node.additionalProperties
          : null;
      if (childSchema) walk(child, childSchema, [...at, key], r, depth + 1);
    }
  };

  walk(value, schema, keys, root, 0);
  return [...found.values()];
}

/** The modules schema, which a module's options schema resolves its `$ref`s against. */
export const modulesRoot = analysisModulesSchema as Schema;

/** The options schema of a built-in module, from the modules schema's `if`/`then` list. */
export function moduleOptionsSchema(module: string): Schema | null {
  const branches = (analysisModulesSchema.$defs.module as { allOf?: unknown[] }).allOf ?? [];
  for (const b of branches as Schema[]) {
    const name = ((b.if as Schema)?.properties as Schema)?.module as Schema | undefined;
    if (name?.const === module) {
      return ((b.then as Schema).properties as Schema).options as Schema;
    }
  }
  return null;
}

/** Names of the built-in modules, for "did you mean". */
export function builtInModules(): string[] {
  const branches = (analysisModulesSchema.$defs.module as { allOf?: unknown[] }).allOf ?? [];
  return (branches as Schema[])
    .map((b) => (((b.if as Schema)?.properties as Schema)?.module as Schema | undefined)?.const)
    .filter((n): n is string => typeof n === "string");
}

/** The executable types the schema defines; anything else is a custom (extension) executable. */
export function builtInExecutables(executableSchema: unknown): string[] {
  const anyOf = ((executableSchema as Schema)?.anyOf ?? []) as Schema[];
  return anyOf
    .map((b) => ((b.properties as Schema)?.type as Schema | undefined)?.const)
    .filter((t): t is string => typeof t === "string");
}

/**
 * The option names a transformer's options schema accepts, following `$ref` and `allOf`; used to
 * tell whether it takes `ifNone`, `divByZero` or `default` (#317).
 */
export function optionNames(schema: unknown, root: Schema = (schema ?? {}) as Schema): string[] {
  const names = new Set<string>();
  const walk = (s: unknown, r: Schema, depth: number): void => {
    if (s === null || typeof s !== "object" || depth > 20) return;
    const node = s as Schema;
    if (typeof node.$ref === "string") {
      const target = resolve(node.$ref, r);
      if (target) walk(target.schema, target.root, depth + 1);
    }
    for (const name of Object.keys((node.properties ?? {}) as Schema)) names.add(name);
    if (Array.isArray(node.allOf)) for (const b of node.allOf) walk(b, r, depth + 1);
  };
  walk(schema, root, 0);
  return [...names];
}
