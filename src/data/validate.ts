/**
 * JSON Schema validation for the stored documents (docs/spec/21-data-model-v2.md).
 * The same schemas are the source for a MongoDB `$jsonSchema` collection validator
 * (`src/db/collections.ts`), so the database refuses a malformed document even if something
 * writes around the application.
 */
import { createSchemaSet, type ValidationResult } from "@/lib/json-schema";
import teamMatchPerformanceSchema from "./schema/team-match-performance.schema.json";
import eventSchema from "./schema/event.schema.json";
import scouterSchema from "./schema/scouter.schema.json";
import settingsSchema from "./schema/settings.schema.json";
import scheduleSchema from "./schema/schedule.schema.json";
import scouterSessionSchema from "./schema/scouter-session.schema.json";
import assignmentSchema from "./schema/assignment.schema.json";
import tbaDataSchema from "./schema/tba-data.schema.json";

export type DocumentKind =
  | "team-match-performance"
  | "event"
  | "scouter"
  | "settings"
  | "schedule"
  | "scouter-session"
  | "assignment"
  | "tba-data";

export const DOCUMENT_KINDS: readonly DocumentKind[] = [
  "team-match-performance",
  "event",
  "scouter",
  "settings",
  "schedule",
  "scouter-session",
  "assignment",
  "tba-data",
];

export const dataSchemas = {
  "team-match-performance": teamMatchPerformanceSchema,
  event: eventSchema,
  scouter: scouterSchema,
  settings: settingsSchema,
  schedule: scheduleSchema,
  "scouter-session": scouterSessionSchema,
  assignment: assignmentSchema,
  "tba-data": tbaDataSchema,
} as const;

/** Collection each document kind lives in. */
export const COLLECTIONS: Record<DocumentKind, string> = {
  "team-match-performance": "teamMatchPerformances",
  event: "events",
  scouter: "scouters",
  settings: "settings",
  schedule: "schedules",
  "scouter-session": "scouterSessions",
  assignment: "assignments",
  "tba-data": "tbaData",
};

const set = createSchemaSet<DocumentKind>(dataSchemas);

export const getDocumentValidator = set.getValidator;

export function validateDocument(kind: DocumentKind, data: unknown): ValidationResult {
  return set.validate(kind, data);
}

export function assertValidDocument(kind: DocumentKind, data: unknown): void {
  set.assertValid(kind, data, `${kind} document`);
}
