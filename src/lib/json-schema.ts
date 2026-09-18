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

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

function describe(e: ErrorObject): ValidationIssue {
  const path =
    e.instancePath === "" ? "(root)" : e.instancePath.replace(/^\//, "").replace(/\//g, ".");
  let message = e.message ?? "invalid";
  if (e.keyword === "additionalProperties") {
    message = `unknown property "${(e.params as { additionalProperty: string }).additionalProperty}"`;
  } else if (e.keyword === "required") {
    message = `missing required property "${(e.params as { missingProperty: string }).missingProperty}"`;
  } else if (e.keyword === "enum") {
    message = `must be one of: ${((e.params as { allowedValues: unknown[] }).allowedValues ?? []).join(", ")}`;
  } else if (e.keyword === "const") {
    message = `must be ${JSON.stringify((e.params as { allowedValue: unknown }).allowedValue)}`;
  }
  return { path, message };
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
    if (!ajv) {
      ajv = new Ajv2020({
        allErrors: true,
        strict: true,
        strictRequired: false,
        allowUnionTypes: true,
      });
      addFormats(ajv);
    }
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
    // Deduplicate the anyOf/if-then fan-out; keep the specific messages.
    const seen = new Set<string>();
    const issues: ValidationIssue[] = [];
    for (const e of fn.errors ?? []) {
      if (e.keyword === "if" || e.keyword === "anyOf" || e.keyword === "not") continue;
      const issue = describe(e);
      const key = `${issue.path}::${issue.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.push(issue);
      }
    }
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
