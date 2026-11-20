/**
 * Shared JSON Schema (draft 2020-12) validation.
 *
 * Both the configuration files and the stored documents are validated the same way, and the
 * error messages matter: a configuration is edited by hand by students, and a migration report
 * is read by whoever has to fix the data. So errors come back as `path: message` in plain
 * words rather than as Ajv's raw output.
 */
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { suggest } from "./suggest";

export interface ValidationIssue {
  /** Dotted location, `(root)` for the document itself. */
  path: string;
  message: string;
  /** The JSON pointer Ajv reported (`/pipeline/5/options`), for tools that locate the value. */
  pointer?: string;
  /** For an unknown or missing property: its name. */
  property?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/** Plain words for the patterns the SPOT schemas use; anything else keeps Ajv's message. */
const PATTERNS: Record<string, string> = {
  "^\\S(.*\\S)?$": "must not be empty or start or end with a space",
  "^[A-Za-z][A-Za-z0-9_]*$": "must start with a letter and use only letters, digits and _",
  "^[A-Za-z][A-Za-z0-9]*$": "must start with a letter and use only letters and digits",
  "^[A-Za-z0-9_-]+$": "must not be empty and use only letters, digits, _ and -",
  "^[A-Za-z0-9_]*$": "must use only letters, digits and _",
};

function describe(e: ErrorObject): ValidationIssue {
  const path =
    e.instancePath === "" ? "(root)" : e.instancePath.replace(/^\//, "").replace(/\//g, ".");
  const issue: ValidationIssue = { path, message: e.message ?? "invalid", pointer: e.instancePath };
  if (e.keyword === "additionalProperties") {
    const property = (e.params as { additionalProperty: string }).additionalProperty;
    // A property the value already has is not what the student meant to type.
    const has = (k: string) =>
      typeof e.data === "object" && e.data !== null && Object.hasOwn(e.data, k);
    const known = Object.keys(
      (e.parentSchema as { properties?: object } | undefined)?.properties ?? {},
    ).filter((k) => !has(k));
    const near = suggest(property, known);
    issue.property = property;
    issue.message = `unknown property "${property}"${near ? `; did you mean "${near}"?` : ""}`;
  } else if (e.keyword === "required") {
    issue.property = (e.params as { missingProperty: string }).missingProperty;
    issue.message = `missing required property "${issue.property}"`;
  } else if (e.keyword === "enum") {
    issue.message = `must be one of: ${((e.params as { allowedValues: unknown[] }).allowedValues ?? []).join(", ")}`;
  } else if (e.keyword === "const") {
    issue.message = `must be ${JSON.stringify((e.params as { allowedValue: unknown }).allowedValue)}`;
  } else if (e.keyword === "pattern") {
    issue.message = PATTERNS[(e.params as { pattern: string }).pattern] ?? issue.message;
  }
  return issue;
}

/** Errors that say "this alternative is for a different kind of value", not "fix this field". */
function rejectsKind(e: ErrorObject, at: string): boolean {
  if (e.keyword === "type") return e.instancePath === at;
  return (
    (e.keyword === "const" || e.keyword === "enum" || e.keyword === "not") && e.instancePath !== at
  );
}

/**
 * Replace the errors of a failed `anyOf` with the errors of the alternative the value was meant
 * to match. An executable `{ "type": "layer", "too": "x" }` fails every alternative, but only the
 * `layer` one has the right `type`, so the student reads "unknown property "too"" instead of a
 * message for each of the ten executable types.
 */
function resolveAnyOf(errors: ErrorObject[]): ErrorObject[] {
  let kept = errors.filter((e) => e.keyword !== "anyOf");
  const anyOfs = errors
    .filter((e) => e.keyword === "anyOf")
    .sort((a, b) => b.schemaPath.length - a.schemaPath.length);
  for (const a of anyOfs) {
    const prefix = `${a.schemaPath}/`;
    const branches = new Map<string, ErrorObject[]>();
    for (const e of kept) {
      if (!e.schemaPath.startsWith(prefix)) continue;
      const i = e.schemaPath.slice(prefix.length).split("/")[0];
      branches.set(i, [...(branches.get(i) ?? []), e]);
    }
    if (branches.size === 0) continue;
    const inGroup = new Set([...branches.values()].flat());
    const rest = kept.filter((e) => !inGroup.has(e));
    const meant = [...branches.values()].filter(
      (b) => !b.some((e) => rejectsKind(e, a.instancePath)),
    );
    let chosen: ErrorObject[];
    if (meant.length > 0) {
      const requiredOnly = meant.every((b) =>
        b.every((e) => e.keyword === "required" && e.instancePath === a.instancePath),
      );
      if (meant.length > 1 && requiredOnly) {
        const names = [
          ...new Set(
            meant.flat().map((e) => (e.params as { missingProperty: string }).missingProperty),
          ),
        ];
        chosen = [
          {
            ...meant[0][0],
            keyword: "requiredOneOf",
            message: `needs one of these properties: ${names.map((n) => `"${n}"`).join(", ")}`,
          },
        ];
      } else {
        chosen = meant.reduce((best, b) => (b.length < best.length ? b : best));
      }
    } else {
      // No alternative fits the kind of value: say which kinds would.
      const all = [...branches.values()].flat();
      const values = all
        .filter((e) => e.keyword === "const" || e.keyword === "enum")
        .flatMap((e) =>
          e.keyword === "const"
            ? [(e.params as { allowedValue: unknown }).allowedValue]
            : (e.params as { allowedValues: unknown[] }).allowedValues,
        );
      const types = all
        .filter((e) => e.keyword === "type" && e.instancePath === a.instancePath)
        .map((e) => String((e.params as { type: unknown }).type));
      const where = all.find((e) => e.keyword === "const" || e.keyword === "enum");
      chosen =
        values.length > 0 && where
          ? [
              {
                ...where,
                keyword: "oneOfValues",
                message: `must be one of: ${[...new Set(values)].join(", ")}`,
              },
            ]
          : types.length > 0
            ? [
                {
                  ...a,
                  keyword: "oneOfTypes",
                  message: `must be ${[...new Set(types)].join(" or ")}`,
                },
              ]
            : [...branches.values()].reduce((best, b) => (b.length < best.length ? b : best));
    }
    kept = [...rest, ...chosen];
  }
  return kept;
}

/**
 * Turn Ajv's errors into plain-words issues: a failed anyOf is reduced to the alternative the
 * value was meant to match, if/then and not fan-out is dropped, duplicates are removed, and an
 * unknown property gets a "did you mean" when a known one is close.
 */
export function toIssues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const e of resolveAnyOf(errors ?? [])) {
    if (e.keyword === "if" || e.keyword === "not") continue;
    const issue = describe(e);
    const key = `${issue.path}::${issue.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      issues.push(issue);
    }
  }
  return issues;
}

/** The Ajv settings every SPOT schema is compiled with. */
export function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true,
    // Errors carry their schema, so an unknown property can be matched against the known ones.
    verbose: true,
  });
  addFormats(ajv);
  return ajv;
}

export interface SchemaSet<K extends string> {
  getValidator(kind: K): ValidateFunction;
  validate(kind: K, data: unknown): ValidationResult;
  assertValid(kind: K, data: unknown, label?: string): void;
}

export function createSchemaSet<K extends string>(schemas: Record<K, unknown>): SchemaSet<K> {
  let ajv: Ajv2020 | null = null;
  const compiled = new Map<K, ValidateFunction>();

  const getAjv = () => {
    if (!ajv) ajv = createAjv();
    return ajv;
  };

  const getValidator = (kind: K): ValidateFunction => {
    let fn = compiled.get(kind);
    if (!fn) {
      fn = getAjv().compile(schemas[kind] as object);
      compiled.set(kind, fn);
    }
    return fn;
  };

  const validate = (kind: K, data: unknown): ValidationResult => {
    const fn = getValidator(kind);
    if (fn(data) as boolean) return { ok: true, issues: [] };
    const issues = toIssues(fn.errors);
    if (issues.length === 0)
      issues.push({ path: "(root)", message: getAjv().errorsText(fn.errors) });
    return { ok: false, issues };
  };

  const assertValid = (kind: K, data: unknown, label = kind): void => {
    const r = validate(kind, data);
    if (!r.ok) {
      throw new Error(
        `${label} is invalid:\n` + r.issues.map((i) => `  ${i.path}: ${i.message}`).join("\n"),
      );
    }
  };

  return { getValidator, validate, assertValid };
}
