/**
 * SPOT data model v2 — TypeScript types for the stored documents.
 *
 * Mirrors the JSON Schemas in src/data/schema/. Design and the v5 mapping:
 * docs/spec/21-data-model-v2.md. Requirements: docs/spec/03 (DM-*), docs/spec/12 (SEC-*),
 * docs/spec/06 (RT-24 to RT-36).
 */

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
  /** FRC team number, always a Number (DM-1a). */
  robotNumber: number;
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
