/**
 * Storing performances that devices send (#360; RT-14a, RT-34 to RT-36, OF-2, DV-18).
 *
 * Each record is validated against the data model, stored once per nonce (a record sent twice,
 * or scanned from a QR code and synced later, is a duplicate), and then the robot's records for
 * that match are settled: which one is current, and which a replacement produced (`rules.ts`).
 *
 * Records are handled one at a time in arrival order, so two arrivals for the same robot never
 * settle it at once. One instance owns this, as it owns the registry (CLAUDE.md).
 */
import { ObjectId, type Db } from "mongodb";
import { NONCE_PATTERN } from "@/qr/codec";
import {
  insertPerformance,
  performanceByNonce,
  robotPerformances,
  updatePerformance,
  wasDeleted,
} from "@/db/performances";
import { validateDocument } from "@/data/validate";
import {
  DEFAULT_TENANT,
  NOT_FLAGGED,
  performanceKey,
  type Assignment,
  type Coverage,
  type MatchLevel,
  type PerformanceSource,
  type SpotEvent,
  type TeamMatchPerformance,
  type TenantId,
} from "@/data/types";
import type { TeamKey } from "@/data/team";
import { coverageOf, resolve } from "./rules";
import type { SubmissionResult } from "./submission";

export interface SubmitOptions {
  source: PerformanceSource;
  /** Who held the robot in that match (DV-16): from the registry, or saved for an older event. */
  assignmentOf(level: MatchLevel, matchNumber: number, team: TeamKey): Promise<Assignment | null>;
  tenantId?: TenantId;
  now?: () => number;
}

const store = globalThis as typeof globalThis & { __spotSubmissions?: Promise<unknown> };

/** Run after every earlier submission, and every admin edit (#410), in this process. */
export function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = (store.__spotSubmissions ?? Promise.resolve()).then(task, task);
  store.__spotSubmissions = run.catch(() => undefined);
  return run;
}

const pick = (value: unknown, key: string) =>
  value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;

/** The stored document for a record as sent, before the server settles it. */
function documentFor(
  sent: unknown,
  event: SpotEvent,
  source: PerformanceSource,
  tenantId: TenantId,
): TeamMatchPerformance {
  const f = (key: string) => pick(sent, key);
  return {
    _id: new ObjectId().toHexString(),
    tenantId,
    eventId: event._id,
    level: f("level") as MatchLevel,
    matchNumber: f("matchNumber") as number,
    team: f("team") as TeamKey,
    scouterId: (f("scouterId") ?? null) as string | null,
    source,
    clientVersion: f("clientVersion") as string,
    submittedAt: f("submittedAt") as number,
    matchKey: performanceKey(
      f("level") as MatchLevel,
      f("matchNumber") as number,
      f("team") as TeamKey,
      f("nonce") as string,
    ),
    nonce: f("nonce") as string,
    coverage: f("coverage") as Coverage,
    superseded: false,
    flag: NOT_FLAGGED,
    notes: null,
    tags: [],
    actions: f("actions") as TeamMatchPerformance["actions"],
  };
}

async function submitOne(
  db: Db,
  event: SpotEvent,
  sent: unknown,
  options: SubmitOptions,
): Promise<SubmissionResult> {
  const tenantId = options.tenantId ?? DEFAULT_TENANT;
  const now = options.now ?? Date.now;
  const nonce = pick(sent, "nonce");
  const result = (status: SubmissionResult["status"], message?: string): SubmissionResult => ({
    nonce: typeof nonce === "string" ? nonce : null,
    status,
    ...(message ? { message } : {}),
  });
  if (typeof nonce !== "string" || !NONCE_PATTERN.test(nonce))
    return result("invalid", "The record has no valid nonce. Show its QR code to an admin.");

  const doc = documentFor(sent, event, options.source, tenantId);
  const check = validateDocument("team-match-performance", doc);
  if (!check.ok)
    return result(
      "invalid",
      `The server cannot store this record: ${check.issues
        .slice(0, 3)
        .map((i) => `${i.path} ${i.message}`)
        .join("; ")}.`,
    );

  return serial(async () => {
    // A record already stored, or one an admin deleted (DV-20), is not stored again.
    if (
      (await performanceByNonce(db, event._id, nonce, tenantId)) ||
      (await wasDeleted(db, event._id, nonce, tenantId))
    )
      return result("duplicate");
    const assignment = await options.assignmentOf(doc.level, doc.matchNumber, doc.team);
    doc.coverage = coverageOf(doc.coverage, doc.scouterId, assignment);
    try {
      await insertPerformance(db, doc);
    } catch (error) {
      // Another process stored it between the check and the insert.
      if ((error as { code?: number }).code === 11000) return result("duplicate");
      throw error;
    }
    const all = await robotPerformances(
      db,
      event._id,
      doc.level,
      doc.matchNumber,
      doc.team,
      tenantId,
    );
    for (const [id, change] of resolve(all, assignment, now()))
      await updatePerformance(db, id, change, tenantId);
    return { ...result("stored"), id: doc._id };
  });
}

/** Store what a device sent for one event, one result per record, in order. */
export async function submitPerformances(
  db: Db,
  event: SpotEvent,
  records: readonly unknown[],
  options: SubmitOptions,
): Promise<SubmissionResult[]> {
  const results: SubmissionResult[] = [];
  for (const sent of records) results.push(await submitOne(db, event, sent, options));
  return results;
}
