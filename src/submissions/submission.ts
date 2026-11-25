/**
 * A performance as a device sends it (#360): what the scouter recorded, without what the server
 * adds when it stores it (`_id`, `tenantId`, `eventId`, `source`, `matchKey`, `superseded`,
 * `flag`, `notes`, `tags`). Shared by the device and the submission route, so it imports nothing
 * from the server.
 */
import type { TeamKey } from "@/data/team";
import type { Action, Coverage, MatchLevel } from "@/data/types";

export interface Submission {
  level: MatchLevel;
  matchNumber: number;
  team: TeamKey;
  scouterId: string | null;
  /** Made on the device when the scouter entered the match (DV-18); the server stores one copy. */
  nonce: string;
  /** Epoch milliseconds on the device's clock. Decides which re-scout is newer (RT-14a). */
  submittedAt: number;
  clientVersion: string;
  /** `partial` when the match ended early on the device (released, signed out; RT-34). */
  coverage: Coverage;
  actions: Action[];
}

/** What the server did with one record. A device forgets a record only when it was stored. */
export type SubmissionStatus = "stored" | "duplicate" | "invalid";

export interface SubmissionResult {
  nonce: string | null;
  status: SubmissionStatus;
  /** Why an invalid record was refused, in words for whoever reads the pending list. */
  message?: string;
}

/** The most records one request carries; a device sends more in several requests. */
export const MAX_SUBMISSIONS = 50;

/** Whether the server has the record, so the device may forget it (OF-2). */
export function acknowledged(result: SubmissionResult): boolean {
  return result.status === "stored" || result.status === "duplicate";
}
