/**
 * JSON Schema validation for SPOT v2 configuration files (docs/spec/20).
 * The Ajv plumbing and the error formatting are shared with the data model (src/lib).
 */
import { createSchemaSet, type ValidationIssue, type ValidationResult } from "@/lib/json-schema";
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
export type { ValidationIssue, ValidationResult };

export const schemas = {
  "match-scouting": matchScoutingSchema,
  "analysis-pipeline": analysisPipelineSchema,
  "analysis-modules": analysisModulesSchema,
  qr: qrSchema,
} as const;

const set = createSchemaSet<ConfigKind>(schemas);

export const getValidator = set.getValidator;

export function validateConfig(kind: ConfigKind, data: unknown): ValidationResult {
  return set.validate(kind, data);
}

export function assertValid(kind: ConfigKind, data: unknown): void {
  set.assertValid(kind, data, `${kind} configuration`);
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
