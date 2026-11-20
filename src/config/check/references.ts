/**
 * The ids an option names, found through the option's schema (#317): a value the schema checks
 * with `$defs/actionId` is a button id, and one checked with the period filters
 * (`$defs/periodFilter/properties/phases`, `…/segments`, `…/kinds`) is a period id. The schema
 * says which options hold ids, so a new built-in or an extension that reuses these definitions
 * (`pipelineDef("actionIdList")`) is checked without changing config:check.
 */
import analysisModulesSchema from "../schema/analysis-modules.schema.json";
import analysisPipelineSchema from "../schema/analysis-pipeline.schema.json";
import type { Key } from "./json";

export type ReferenceKind = "action" | "phase" | "segment" | "kind";

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

const PERIODS: Record<string, ReferenceKind> = {
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
      if (name === "actionId") {
        if (typeof v === "string") add({ kind: "action", id: v, keys: at });
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
      if (Array.isArray(branches)) for (const b of branches) walk(v, b, at, r, depth + 1);
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
