/**
 * v5 → v6 data migration (docs/spec/21-data-model-v2.md, Phase 0 step 5).
 *
 * Pure transforms over documents. Reading and writing MongoDB is the caller's job, so the
 * migration can be run on a `mongoexport` dump and verified before anything is imported, and
 * so it is testable against the real event exports in tools/oracle/fixtures.
 *
 * What it has to do, beyond renaming fields:
 *  - split each action's composite id into a button id plus where it happened (docs/spec/20 §2.1);
 *  - turn `robotNumber` into a string team key (DM-1a, BL-308);
 *  - turn free-text scouter names into `scouters` records (SEC-6), merging spelling variants;
 *  - add `tenantId` everywhere (DM-7f) and the v6 hook fields (notes, tags, flag metadata);
 *  - drop per-action `_id`s (BL-31).
 */
import type { MatchScoutingConfig, Segment } from "@/config/types";
import { placeAt, repeatIndexAt, splitActionId, type Placement } from "@/data/phase";
import { toTeamKey, type TeamKey } from "@/data/team";
import {
  DEFAULT_TENANT,
  NOT_FLAGGED,
  type Action,
  type Scouter,
  type SpotEvent,
  type TeamMatchPerformance,
} from "@/data/types";

// ---------------------------------------------------------------- v5 shapes (extended JSON)

type Ext = { $oid?: string; $numberLong?: string; $numberInt?: string; $date?: unknown };
type V5Value = string | number | Ext;

export interface V5Action {
  id: string;
  ts: V5Value;
  _id?: Ext;
  other?: Record<string, unknown>;
}

export interface V5Performance {
  _id: Ext | string;
  timestamp: V5Value;
  clientVersion?: string;
  scouterId: string;
  robotNumber: V5Value;
  matchNumber: V5Value;
  eventNumber: Ext | string;
  matchId: string;
  matchId_rand: string;
  flagged?: boolean;
  actionQueue: V5Action[];
}

export interface V5Event {
  _id: Ext | string;
  code: string;
}

/** mongoexport writes ObjectIds as `{"$oid": "..."}` and large integers as `{"$numberLong": "..."}`. */
export function hex(value: Ext | string): string {
  return typeof value === "string" ? value : (value.$oid ?? "");
}

export function num(value: V5Value): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value.$numberLong !== undefined) return Number(value.$numberLong);
  if (value.$numberInt !== undefined) return Number(value.$numberInt);
  return Number.NaN;
}

/**
 * v5 stored `robotNumber` as a Number, so every legacy value is a plain team number. A value
 * that is not a team key is kept as text so validation reports it instead of hiding it.
 */
export function teamKeyFromV5(value: V5Value): TeamKey {
  const raw = typeof value === "object" ? (value.$numberLong ?? value.$numberInt) : value;
  const n = typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw) : raw;
  return toTeamKey(n) ?? String(raw);
}

// ---------------------------------------------------------------- scouters

/** v5 stored "firstNameLastName", sometimes with spaces or stray case. */
export function scouterKey(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toLowerCase();
}

export const QR_SCOUTER = "qrcode";

// ---------------------------------------------------------------- report

export interface CountedId {
  id: string;
  count: number;
}

export interface PlacementMismatch {
  id: string;
  fromId: string | null;
  fromClock: string | null;
  count: number;
}

/**
 * How v5 numbered shifts (#326, SC-22). v5's `activeShift2` was the second *active* shift, counted
 * from the scouter's toggle press; v6 records the field clock's slot (1-4) instead. Under strict
 * alternation of K kinds, shift n of a kind falls in slots (n-1)K+1 to nK; an action outside that
 * window was recorded after a late or repeated toggle press.
 */
export interface ShiftNumbering {
  /** Actions in an alternating segment whose v5 id carried a per-kind shift number. */
  actions: number;
  /** Of those, the actions whose number does not fit their clock slot. */
  disagree: number;
  /** The performances with at least one such action. */
  performances: string[];
}

export interface MergedScouter {
  id: string;
  displayName: string;
  spellings: string[];
}

export interface MigrationReport {
  performances: number;
  actions: number;
  events: number;
  scouters: number;
  /** Ids no prefix + known-button combination explained; migrated with a clock placement. */
  unknownActionIds: CountedId[];
  /** The composite id and the clock disagreed about the phase. */
  placementMismatches: PlacementMismatch[];
  /** v5's per-kind shift numbers against the clock slots v6 records (#326). */
  shiftNumbering: ShiftNumbering;
  /** Records whose (event, match, robot) already had one; the latest submission wins. */
  supersededPerformances: number;
  /** Scouter records built from more than one spelling of the same name. */
  mergedScouters: MergedScouter[];
  /** Performances whose source was a scanned QR code, so they carry no scouter. */
  qrPerformances: number;
}

export interface MigrationResult {
  performances: TeamMatchPerformance[];
  events: SpotEvent[];
  scouters: Scouter[];
  report: MigrationReport;
}

export interface MigrateOptions {
  /** The season's match-scouting configuration, used to place each action. */
  config: MatchScoutingConfig;
  tenantId?: string;
  /** Injected for deterministic tests. */
  now?: number;
}

// ---------------------------------------------------------------- events

export function migrateEvent(v5: V5Event, tenantId = DEFAULT_TENANT): SpotEvent {
  const code = v5.code;
  const underscore = code.indexOf("_");
  return {
    _id: hex(v5._id),
    tenantId,
    code,
    tbaKey: underscore === -1 ? code : code.slice(0, underscore),
    label: underscore === -1 ? "" : code.slice(underscore + 1),
    // Existing events have no write-gating code yet; an admin sets one when the event is next used.
    eventCode: null,
    eventCodeRotatedAt: null,
  };
}

// ---------------------------------------------------------------- performances

interface ActionOutcome {
  action: Action;
  unknownId: string | null;
  mismatch: { fromId: string | null; fromClock: string | null } | null;
  /** For an action in an alternating segment: whether v5's shift number fits the clock slot. */
  shift: { fits: boolean } | null;
}

function segmentOf(config: MatchScoutingConfig, placement: Placement): Segment | undefined {
  const phase = config.timing.phases.find((p) => p.id === placement.phase);
  return phase?.segments?.find((s) => s.id === placement.segment);
}

function migrateAction(config: MatchScoutingConfig, v5: V5Action): ActionOutcome {
  const ts = num(v5.ts);
  const split = splitActionId(config, v5.id);
  const clock = placeAt(config, ts);

  // The id wins when it carried a period, because that is what the scouter's client recorded;
  // the clock fills in for configurations with no prefixes (every season before 2026).
  let placement: Placement = split.phase === null ? clock : split;

  // A repeating segment's index is the field clock's slot (#326): v5 numbered a kind's shifts
  // per kind, from the toggle press, so its "activeShift2" could be slot 3 or slot 4. The kind
  // still comes from the id, because that is what the scouter selected.
  let shift: ActionOutcome["shift"] = null;
  const segment = split.segmentIndex !== null ? segmentOf(config, split) : undefined;
  if (segment?.repeat && split.segmentIndex !== null) {
    const slot = repeatIndexAt(segment, ts) ?? 1;
    placement = { ...placement, segmentIndex: slot };
    const kinds = segment.kinds?.length ?? 0;
    if (segment.alternate && kinds > 0 && split.segmentKind !== null) {
      const n = split.segmentIndex;
      shift = { fits: slot > (n - 1) * kinds && slot <= n * kinds };
    }
  }

  const action: Action = {
    id: split.baseId,
    ts,
    phase: placement.phase,
    segment: placement.segment,
    segmentKind: placement.segmentKind,
    segmentIndex: placement.segmentIndex,
  };
  if (v5.other && Object.keys(v5.other).length > 0) action.other = v5.other;

  const disagrees = split.phase !== null && clock.phase !== null && split.phase !== clock.phase;
  return {
    action,
    unknownId: split.known ? null : v5.id,
    mismatch: disagrees ? { fromId: split.phase, fromClock: clock.phase } : null,
    shift,
  };
}

export function migrate(
  input: { performances: V5Performance[]; events: V5Event[] },
  options: MigrateOptions,
): MigrationResult {
  const tenantId = options.tenantId ?? DEFAULT_TENANT;
  const now = options.now ?? Date.now();
  const { config } = options;

  const events = input.events.map((e) => migrateEvent(e, tenantId));

  const unknown = new Map<string, number>();
  const mismatches = new Map<string, PlacementMismatch>();
  const shiftNumbering: ShiftNumbering = { actions: 0, disagree: 0, performances: [] };
  const spellings = new Map<string, Map<string, number>>();
  let actionCount = 0;
  let qrPerformances = 0;

  const performances: TeamMatchPerformance[] = input.performances.map((p) => {
    const isQr = scouterKey(p.scouterId ?? "") === QR_SCOUTER;
    if (isQr) qrPerformances++;
    let scouterId: string | null = null;
    if (!isQr && p.scouterId && p.scouterId.trim() !== "") {
      scouterId = scouterKey(p.scouterId);
      const bySpelling = spellings.get(scouterId) ?? new Map<string, number>();
      const display = p.scouterId.trim();
      bySpelling.set(display, (bySpelling.get(display) ?? 0) + 1);
      spellings.set(scouterId, bySpelling);
    }

    const actions: Action[] = [];
    let renumbered = false;
    for (const raw of p.actionQueue ?? []) {
      const outcome = migrateAction(config, raw);
      actions.push(outcome.action);
      actionCount++;
      if (outcome.shift) {
        shiftNumbering.actions++;
        if (!outcome.shift.fits) {
          shiftNumbering.disagree++;
          renumbered = true;
        }
      }
      if (outcome.unknownId)
        unknown.set(outcome.unknownId, (unknown.get(outcome.unknownId) ?? 0) + 1);
      if (outcome.mismatch) {
        const key = `${raw.id}::${outcome.mismatch.fromId}::${outcome.mismatch.fromClock}`;
        const existing = mismatches.get(key);
        if (existing) existing.count++;
        else mismatches.set(key, { id: raw.id, ...outcome.mismatch, count: 1 });
      }
    }

    if (renumbered) shiftNumbering.performances.push(hex(p._id));
    return {
      _id: hex(p._id),
      tenantId,
      eventId: hex(p.eventNumber),
      matchNumber: num(p.matchNumber),
      team: teamKeyFromV5(p.robotNumber),
      scouterId,
      source: isQr ? "qr" : "app",
      clientVersion: p.clientVersion ?? "",
      submittedAt: num(p.timestamp),
      // Kept verbatim: it is the historical de-duplication key and embeds the original
      // scouter spelling, which QR twin detection relies on (DM-2).
      matchKey: p.matchId,
      nonce: p.matchId_rand,
      coverage: "full",
      superseded: false,
      flag: p.flagged
        ? { flagged: true, reason: "Flagged in SPOT v5", source: "human", at: null }
        : { ...NOT_FLAGGED },
      notes: null,
      tags: [],
      actions,
    };
  });

  // Historic duplicates: v5 let the same robot and match be scouted more than once and the
  // pipeline kept the latest submission. Preserve that outcome here rather than inventing one,
  // because who "finished the match" (RT-35) is not knowable from old data.
  const byRobotMatch = new Map<string, TeamMatchPerformance[]>();
  for (const p of performances) {
    const key = `${p.eventId}:${p.matchNumber}:${p.team}`;
    const list = byRobotMatch.get(key) ?? [];
    list.push(p);
    byRobotMatch.set(key, list);
  }
  let supersededPerformances = 0;
  for (const list of byRobotMatch.values()) {
    if (list.length < 2) continue;
    // Strictly later wins, so on a tie the first in export order is kept, as v5's did (a record
    // synced twice with identical content, 2026).
    const winner = list.reduce((a, b) => (b.submittedAt > a.submittedAt ? b : a));
    for (const p of list) {
      if (p !== winner) {
        p.superseded = true;
        supersededPerformances++;
      }
    }
  }

  const scouters: Scouter[] = [];
  const mergedScouters: MergedScouter[] = [];
  for (const [id, bySpelling] of [...spellings.entries()].sort()) {
    const ranked = [...bySpelling.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    const displayName = ranked[0][0];
    scouters.push({ _id: id, tenantId, displayName, aliases: [], legacy: true, createdAt: now });
    if (ranked.length > 1)
      mergedScouters.push({ id, displayName, spellings: ranked.map((r) => r[0]) });
  }

  const byCount = (a: CountedId, b: CountedId) => b.count - a.count || a.id.localeCompare(b.id);
  return {
    performances,
    events,
    scouters,
    report: {
      performances: performances.length,
      actions: actionCount,
      events: events.length,
      scouters: scouters.length,
      unknownActionIds: [...unknown.entries()].map(([id, count]) => ({ id, count })).sort(byCount),
      placementMismatches: [...mismatches.values()].sort((a, b) => b.count - a.count),
      shiftNumbering,
      supersededPerformances,
      mergedScouters,
      qrPerformances,
    },
  };
}
