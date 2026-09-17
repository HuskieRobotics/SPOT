/**
 * JSON Schema (draft 2020-12) validation for SPOT v2 configuration files.
 * Errors are formatted for people editing JSON by hand (path + plain message).
 */
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import matchScoutingSchema from "./schema/match-scouting.schema.json";
import analysisPipelineSchema from "./schema/analysis-pipeline.schema.json";
import analysisModulesSchema from "./schema/analysis-modules.schema.json";
import qrSchema from "./schema/qr.schema.json";
import type {
  AnalysisModulesConfig,
  AnalysisPipelineConfig,
  MatchScoutingConfig,
  QrConfig,
} from "./types";

export type ConfigKind = "match-scouting" | "analysis-pipeline" | "analysis-modules" | "qr";

export const schemas = {
  "match-scouting": matchScoutingSchema,
  "analysis-pipeline": analysisPipelineSchema,
  "analysis-modules": analysisModulesSchema,
  qr: qrSchema,
} as const;

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

let ajv: Ajv2020 | null = null;
const compiled = new Map<ConfigKind, ValidateFunction>();

function getAjv(): Ajv2020 {
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
}

export function getValidator(kind: ConfigKind): ValidateFunction {
  let fn = compiled.get(kind);
  if (!fn) {
    fn = getAjv().compile(schemas[kind]);
    compiled.set(kind, fn);
  }
  return fn;
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

export function validateConfig(kind: ConfigKind, data: unknown): ValidationResult {
  const fn = getValidator(kind);
  const ok = fn(data) as boolean;
  if (ok) return { ok: true, issues: [] };
  // Deduplicate noisy anyOf/if-then error fan-out; keep the most specific messages.
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
  if (issues.length === 0) issues.push({ path: "(root)", message: getAjv().errorsText(fn.errors) });
  return { ok: false, issues };
}

export function assertValid(kind: ConfigKind, data: unknown): void {
  const r = validateConfig(kind, data);
  if (!r.ok) {
    throw new Error(
      `${kind} configuration is invalid:\n` +
        r.issues.map((i) => `  ${i.path}: ${i.message}`).join("\n"),
    );
  }
}

export function isMatchScoutingConfig(data: unknown): data is MatchScoutingConfig {
  return validateConfig("match-scouting", data).ok;
}
export function isAnalysisPipelineConfig(data: unknown): data is AnalysisPipelineConfig {
  return validateConfig("analysis-pipeline", data).ok;
}
export function isAnalysisModulesConfig(data: unknown): data is AnalysisModulesConfig {
  return validateConfig("analysis-modules", data).ok;
}
export function isQrConfig(data: unknown): data is QrConfig {
  return validateConfig("qr", data).ok;
}
