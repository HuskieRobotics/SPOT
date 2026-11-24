/**
 * SPOT data model v2 — TypeScript types for the stored documents.
 *
 * Mirrors the JSON Schemas in src/data/schema/. Design and the v5 mapping:
 * docs/spec/21-data-model-v2.md. Requirements: docs/spec/03 (DM-*), docs/spec/12 (SEC-*),
 * docs/spec/06 (RT-24 to RT-36).
 */

import type { TeamKey } from "./team";

/** 24-character hexadecimal MongoDB ObjectId, as it travels outside the driver. */
export type ObjectIdHex = string;

/**
 * Reserved from day one so a hosted multi-team instance never has to migrate live scouting
 * data (DM-7f, BL-197). v6 ships single-tenant; every document carries the same value.
 */
export type TenantId = string;

export const DEFAULT_TENANT: TenantId = "default";

/** How a performance reached the server. Replaces the v5 `scouterId: "qrcode"` sentinel. */
export type PerformanceSource = "app" | "qr" | "import";

/** Whether the record covers the whole match (RT-34). */
export type Coverage = "full" | "partial";

export interface Flag {
  flagged: boolean;
  /** Why, in words a person will read on the edit page. Null when not flagged. */
  reason: string | null;
  /** Who flagged it. "machine" is a rule such as RT-36; "human" is an admin. */
  source: "human" | "machine" | null;
  /** Epoch milliseconds. */
  at: number | null;
}

export const NOT_FLAGGED: Flag = { flagged: false, reason: null, source: null, at: null };

/**
 * One recorded button press.
 *
 * `id` is the button id with no period prefix; the period is carried in the placement fields,
 * so analysis filters on `phase` instead of matching a dozen composite id spellings
 * (docs/spec/20 §2.1). The v5 composite id stays derivable via `compositeActionId`.
 *
 * The placement is stored rather than derived at read time because the configuration that
 * produced it may be edited later, and the data has to stay self-describing.
 */
export interface Action {
  id: string;
  /** Milliseconds of match time REMAINING when the button was pressed (DM-3, counts down). */
  ts: number;
  phase: string | null;
  segment: string | null;
  segmentKind: string | null;
  segmentIndex: number | null;
  /** Free-form per action; the built-in producer is the position executable writing `pos`. */
  other?: Record<string, unknown>;
}

export interface TeamMatchPerformance {
  _id: ObjectIdHex;
  tenantId: TenantId;
  eventId: ObjectIdHex;
  matchNumber: number;
  /** Team key such as "3061" or "2338B"; always a string (DM-1a, BL-308). */
  team: TeamKey;
  /** Student ID (SEC-6). Null when the record did not come from a signed-in scouter. */
  scouterId: string | null;
  source: PerformanceSource;
  clientVersion: string;
  /** Epoch milliseconds at submission, from the client clock. */
  submittedAt: number;
  /** Client-side uniqueness key; the v5 `matchId`. */
  matchKey: string;
  /** Random component of `matchKey`; the v5 `matchId_rand`. */
  nonce: string;
  coverage: Coverage;
  /** Another record won for this robot and match (RT-35); kept, not deleted. */
  superseded: boolean;
  flag: Flag;
  /** Free-text scouter comment (BL-35). */
  notes: string | null;
  /** Qualitative tags chosen at match end (BL-193). */
  tags: string[];
  actions: Action[];
}

export interface SpotEvent {
  _id: ObjectIdHex;
  tenantId: TenantId;
  /** `<TBA event key>_<label>`, e.g. "2026mnwi_official" (DM-6). */
  code: string;
  /** Derived from `code`; stored so nothing has to re-split the string (DM-6). */
  tbaKey: string;
  label: string;
  /** Per-event code that gates writes (SEC-2, DM-7a). Never sent in a public response. */
  eventCode: string | null;
  eventCodeRotatedAt: number | null;
}

/**
 * A person who scouts. Keyed by student ID so a reconnect resumes one session rather than
 * creating a second registry entry (SEC-6, RT-24, F-20).
 */
export interface Scouter {
  /** Student ID. For migrated v5 records this is the legacy concatenated name. */
  _id: string;
  tenantId: TenantId;
  /** Full name. Shown to admins only; never in a public view (SEC-8). */
  displayName: string;
  /** Ids merged into this record by an admin. */
  aliases: string[];
  /** True for a record reconstructed from v5 data, which had no student ids. */
  legacy: boolean;
  createdAt: number;
}

/** Fields that must never appear in a public response (SEC-8). */
export const PRIVATE_PERFORMANCE_FIELDS = ["scouterId"] as const;

/** Fields of an event that must never appear in a public response (SEC-3). */
export const PRIVATE_EVENT_FIELDS = ["eventCode"] as const;

export type PublicPerformance = Omit<
  TeamMatchPerformance,
  (typeof PRIVATE_PERFORMANCE_FIELDS)[number]
>;
export type PublicEvent = Omit<SpotEvent, (typeof PRIVATE_EVENT_FIELDS)[number]>;

/** When waiting scouters enter a match without an admin starting it (RT-12a, ADR 0006). */
export interface StartRules {
  /** Connected waiting scouters on the current match that start it, 1 to 6. */
  quorum: number;
  /** One scouter starting pulls in everyone waiting (issue 34). Off by default. */
  startOnFirstScouter: boolean;
}

/**
 * What an admin changes at an event, one document per tenant (ADR 0003, DV-13). `_id` is the
 * tenant id. Secrets are environment variables and never stored here.
 */
export interface Settings {
  _id: TenantId;
  tenantId: TenantId;
  /** The event being scouted (DV-12a); chosen and shown by its code (DV-12b). */
  activeEventId: ObjectIdHex | null;
  startRules: StartRules;
  /** Field orientation (A-19, SC-28): swaps alliance-relative buttons and turns the map. */
  fieldFlipped: boolean;
  updatedAt: number;
}

/** One match of a schedule. A slot not filled in yet is null (a manual schedule being typed). */
export interface ScheduledMatch {
  number: number;
  /** TBA's match key (`2026mnwi_qm12`), or a made-up one for a manual match. */
  key: string;
  red: [TeamKey | null, TeamKey | null, TeamKey | null];
  blue: [TeamKey | null, TeamKey | null, TeamKey | null];
}

/** An event's matches and current match, one document per event; `_id` is the event id (DV-14). */
export interface Schedule {
  _id: ObjectIdHex;
  tenantId: TenantId;
  eventId: ObjectIdHex;
  /** The last schedule read from TBA (RT-22), or null. */
  tba: { matches: ScheduledMatch[]; fetchedAt: number } | null;
  /** Typed by an admin; when not empty it is used instead of TBA's (AD-8). */
  manual: ScheduledMatch[];
  currentMatchNumber: number | null;
  updatedAt: number;
}

export type SessionStatus = "waiting" | "scouting" | "complete";

/**
 * The saved copy of one registry entry (RT-24, DV-15). The registry is in memory and this is
 * written behind it, so a restart keeps who holds which robot. Connection state is never
 * stored: after a restart every scouter is disconnected until their device reconnects.
 */
export interface ScouterSession {
  /** `<event id>:<student id>` (`sessionId`). */
  _id: string;
  tenantId: TenantId;
  eventId: ObjectIdHex;
  scouterId: string;
  /** The device signed in on (docs/spec/15); the stream and actions must name it. */
  deviceId: string | null;
  status: SessionStatus;
  matchNumber: number | null;
  /** The robot held (RT-25). */
  team: TeamKey | null;
  /** The scouter has seen this assignment, so a reconnect does not show it again (RT-27). */
  accepted: boolean;
  /** The scouter was sent into the match screen for this assignment (RT-12a). */
  entered: boolean;
  /** When they signed in; waiting scouters are assigned in this order (RT-11). */
  signedInAt: number;
  updatedAt: number;
}

export function sessionId(eventId: ObjectIdHex, scouterId: string): string {
  return `${eventId}:${scouterId}`;
}

/** One scouter's time holding a robot (DV-16). */
export interface Holder {
  scouterId: string;
  from: number;
  /** When they stopped: released, taken back, or finished. Null while they hold it. */
  until: number | null;
  /**
   * Why they stopped: an admin released the robot (RT-31), or it was taken back before they
   * scouted it. Null while they hold it, and for whoever finished the match.
   */
  ended: "released" | "unassigned" | null;
  /** They got the robot after someone had started scouting the match (RT-34). */
  afterStart: boolean;
}

/** Who held one robot in one match, in order (DV-16), for RT-34 to RT-36. */
export interface Assignment {
  /** `<event id>:<match number>:<team>` (`assignmentId`). */
  _id: string;
  tenantId: TenantId;
  eventId: ObjectIdHex;
  matchNumber: number;
  team: TeamKey;
  holders: Holder[];
}

export function assignmentId(eventId: ObjectIdHex, matchNumber: number, team: TeamKey): string {
  return `${eventId}:${matchNumber}:${team}`;
}
