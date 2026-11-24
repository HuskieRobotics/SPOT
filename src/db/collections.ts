/**
 * The collections, their validators and their indexes (docs/spec/21 §6).
 *
 * `ensureCollections` runs once when the application connects and is safe to run again: it
 * creates what is missing, updates a validator only when its schema changed, and creates
 * indexes that do not exist yet.
 */
import { isDeepStrictEqual } from "node:util";
import type { Db, IndexDescription } from "mongodb";
import { COLLECTIONS, dataSchemas, DOCUMENT_KINDS, type DocumentKind } from "@/data/validate";
import { toMongoJsonSchema } from "./mongo-schema";

/**
 * Every index leads with `tenantId` (DV-8), so a hosted instance with several tenants does not
 * need them rebuilt. A document whose `_id` already scopes it (settings, schedules) needs none.
 */
export const INDEXES: Record<DocumentKind, IndexDescription[]> = {
  "team-match-performance": [
    { name: "event_match_team", key: { tenantId: 1, eventId: 1, matchNumber: 1, team: 1 } },
    // A record synced twice is stored once. Only current records are unique: the migration
    // keeps v5's duplicates as superseded copies (docs/spec/21 §3), so code that de-duplicates
    // must look a nonce up across all records, not rely on this index alone.
    {
      name: "event_nonce_current",
      key: { tenantId: 1, eventId: 1, nonce: 1 },
      unique: true,
      partialFilterExpression: { superseded: false },
    },
  ],
  event: [{ name: "code", key: { tenantId: 1, code: 1 }, unique: true }],
  scouter: [{ name: "roster", key: { tenantId: 1, displayName: 1 } }],
  settings: [],
  schedule: [],
  "scouter-session": [{ name: "event", key: { tenantId: 1, eventId: 1 } }],
  assignment: [{ name: "event_match", key: { tenantId: 1, eventId: 1, matchNumber: 1 } }],
};

export function validatorFor(kind: DocumentKind) {
  return { $jsonSchema: toMongoJsonSchema(dataSchemas[kind]) };
}

export async function ensureCollections(
  db: Db,
  warn: (message: string) => void = console.warn,
): Promise<void> {
  const existing = new Map(
    (await db.listCollections({}, { nameOnly: false }).toArray()).map((c) => [
      c.name,
      (c as { options?: { validator?: unknown } }).options?.validator,
    ]),
  );
  for (const kind of DOCUMENT_KINDS) {
    const name = COLLECTIONS[kind];
    const validator = validatorFor(kind);
    if (!existing.has(name)) {
      await db.createCollection(name, {
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
    } else if (!isDeepStrictEqual(existing.get(name), validator)) {
      try {
        await db.command({
          collMod: name,
          validator,
          validationLevel: "strict",
          validationAction: "error",
        });
      } catch (error) {
        // Updating a validator needs the dbAdmin role; reading and writing do not. Keep running
        // with the old validator rather than refusing to start at an event.
        warn(
          `Could not update the validator of "${name}" (${(error as Error).message}). ` +
            `Give the database user the dbAdmin role so schema changes reach the database.`,
        );
      }
    }
    if (INDEXES[kind].length > 0) await db.collection(name).createIndexes(INDEXES[kind]);
  }
}
