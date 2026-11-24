/**
 * Turn a stored-document JSON Schema (draft 2020-12) into a MongoDB `$jsonSchema` validator, so
 * the database enforces the same shape as `src/data/validate.ts` (docs/spec/21 §6, DV-13).
 *
 * MongoDB implements draft 4 without `$ref`, `format`, `const` or the `integer` type. So:
 *  - `$ref` to `#/$defs/...` is inlined;
 *  - `integer` becomes `number`. The driver stores a whole number past 2^31 (every epoch
 *    millisecond) as a double, so the database cannot tell an integer from a fraction; the
 *    application's validator still does, and every write goes through it first;
 *  - any other keyword MongoDB lacks is an error here, so a schema edit cannot quietly weaken
 *    the database's check.
 */

type Schema = Record<string, unknown>;

/** Annotations and the 2020-12 plumbing that the conversion consumes. */
const DROPPED = new Set(["$schema", "$id", "$defs", "$comment"]);

/** Keywords MongoDB's `$jsonSchema` accepts with the same meaning as draft 2020-12. */
const KEPT = new Set([
  "title",
  "description",
  "enum",
  "required",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
  "multipleOf",
]);

/** Keywords whose value is a schema, or a map or list of schemas. */
const SUBSCHEMA = new Set(["items", "not", "additionalProperties"]);
const SUBSCHEMA_MAP = new Set(["properties", "patternProperties"]);
const SUBSCHEMA_LIST = new Set(["allOf", "anyOf", "oneOf"]);

function mongoType(type: unknown): unknown {
  const map = (t: unknown) => (t === "integer" ? "number" : t);
  if (!Array.isArray(type)) return map(type);
  return [...new Set(type.map(map))];
}

function resolve(ref: string, root: Schema): Schema {
  const match = /^#\/\$defs\/([^/]+)$/.exec(ref);
  const target = match ? (root.$defs as Record<string, Schema> | undefined)?.[match[1]] : undefined;
  if (!target) throw new Error(`cannot inline $ref "${ref}": only #/$defs/<name> is supported`);
  return target;
}

function convert(node: Schema, root: Schema, at: string, seen: string[]): Schema {
  if (typeof node.$ref === "string") {
    const others = Object.keys(node).filter((k) => k !== "$ref" && k !== "description");
    if (others.length > 0)
      throw new Error(`${at}: $ref beside ${others.join(", ")} cannot be inlined`);
    if (seen.includes(node.$ref)) throw new Error(`${at}: $ref "${node.$ref}" is recursive`);
    const inlined = convert(resolve(node.$ref, root), root, at, [...seen, node.$ref]);
    return node.description === undefined ? inlined : { ...inlined, description: node.description };
  }
  const out: Schema = {};
  for (const [key, value] of Object.entries(node)) {
    const here = `${at}/${key}`;
    if (DROPPED.has(key)) continue;
    if (key === "type") out.type = mongoType(value);
    else if (KEPT.has(key)) out[key] = value;
    else if (SUBSCHEMA.has(key))
      out[key] = typeof value === "boolean" ? value : convert(value as Schema, root, here, seen);
    else if (SUBSCHEMA_MAP.has(key))
      out[key] = Object.fromEntries(
        Object.entries(value as Record<string, Schema>).map(([k, v]) => [
          k,
          convert(v, root, `${here}/${k}`, seen),
        ]),
      );
    else if (SUBSCHEMA_LIST.has(key))
      out[key] = (value as Schema[]).map((v, i) => convert(v, root, `${here}/${i}`, seen));
    else throw new Error(`${here}: MongoDB's $jsonSchema has no "${key}" keyword`);
  }
  return out;
}

export function toMongoJsonSchema(schema: object): Schema {
  return convert(schema as Schema, schema as Schema, "#", []);
}
