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
  | "tba-data"
  | "deleted-performance";

export const DOCUMENT_KINDS: readonly DocumentKind[] = [
  "team-match-performance",
  "event",
  "scouter",
  "settings",
  "schedule",
  "scouter-session",
  "assignment",
  "tba-data",
  "deleted-performance",
];

/**
 * A deleted record (DV-20, #410) is the record as it was, with when it was deleted: the
 * performance schema with one more field, so the two cannot drift apart.
 */
const deletedPerformanceSchema = {
  ...teamMatchPerformanceSchema,
  $id: "https://spot.team3061.org/schema/v2/deleted-performance.schema.json",
  title: "SPOT deleted team match performance (data model v2)",
  description:
    "A record an admin deleted, kept apart so its nonce still marks a copy sent again as a duplicate (DV-20).",
  required: [...teamMatchPerformanceSchema.required, "deletedAt"],
  properties: {
    ...teamMatchPerformanceSchema.properties,
    deletedAt: {
      type: "integer",
      minimum: 0,
      description: "When an admin deleted it, epoch milliseconds.",
    },
  },
};

export const dataSchemas = {
  "team-match-performance": teamMatchPerformanceSchema,
  event: eventSchema,
  scouter: scouterSchema,
  settings: settingsSchema,
  schedule: scheduleSchema,
  "scouter-session": scouterSessionSchema,
  assignment: assignmentSchema,
  "tba-data": tbaDataSchema,
  "deleted-performance": deletedPerformanceSchema,
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
  "deleted-performance": "deletedPerformances",
};

const set = createSchemaSet<DocumentKind>(dataSchemas);

export const getDocumentValidator = set.getValidator;

export function validateDocument(kind: DocumentKind, data: unknown): ValidationResult {
  return set.validate(kind, data);
}

export function assertValidDocument(kind: DocumentKind, data: unknown): void {
  set.assertValid(kind, data, `${kind} document`);
}
