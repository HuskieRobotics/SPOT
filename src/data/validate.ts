/**
 * JSON Schema validation for the stored documents (docs/spec/21-data-model-v2.md).
 * The same schemas are the source for a MongoDB `$jsonSchema` collection validator, so the
 * database refuses a malformed document even if something writes around the application.
 */
import { createSchemaSet, type ValidationResult } from "@/lib/json-schema";
import teamMatchPerformanceSchema from "./schema/team-match-performance.schema.json";
import eventSchema from "./schema/event.schema.json";
import scouterSchema from "./schema/scouter.schema.json";

export type DocumentKind = "team-match-performance" | "event" | "scouter";

export const dataSchemas = {
  "team-match-performance": teamMatchPerformanceSchema,
  event: eventSchema,
  scouter: scouterSchema,
} as const;

/** Collection each document kind lives in. */
export const COLLECTIONS: Record<DocumentKind, string> = {
  "team-match-performance": "teamMatchPerformances",
  event: "events",
  scouter: "scouters",
};

const set = createSchemaSet<DocumentKind>(dataSchemas);

export const getDocumentValidator = set.getValidator;

export function validateDocument(kind: DocumentKind, data: unknown): ValidationResult {
  return set.validate(kind, data);
}

export function assertValidDocument(kind: DocumentKind, data: unknown): void {
  set.assertValid(kind, data, `${kind} document`);
}
