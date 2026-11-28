/**
 * Reading a scanned QR code (#411; document 07 AD-19, DM-15a). Pure, so it is tested without a
 * camera.
 *
 * A code carries its event's id and the fingerprint of the layout it was made with, but not its
 * season. The scanner keeps every season's match-scouting.json the server has events for, and
 * reads a code with the one whose fingerprint matches, so a phone that scouted last week's event
 * is read right after the season changed.
 */
import type { MatchScoutingConfig } from "@/config/types";
import { decodePerformance, QrError, type QrPerformance } from "@/qr/codec";
import { qrLayout, type QrLayout } from "@/qr/layout";
import {
  NOT_FLAGGED,
  performanceKey,
  type MatchLevel,
  type ObjectIdHex,
  type PublicPerformance,
} from "@/data/types";
import type { TeamKey } from "@/data/team";
import { matchLabel } from "@/schedule/labels";
import type { Submission } from "@/submissions/submission";

/** An event as the scanner knows it: from `/api/admin/scanner`. */
export interface ScannerEvent {
  id: ObjectIdHex;
  code: string;
  season: string;
}

/** What the scanner needs to read codes, kept on the device for a scan with no connection. */
export interface ScannerInputs {
  events: ScannerEvent[];
  /** Each season's match-scouting.json, by season name. */
  seasons: Record<string, MatchScoutingConfig>;
  /** When the server answered, epoch milliseconds. */
  savedAt: number;
}

/** A scanned record, as the scanner keeps it until the server has it. */
export interface ScannedRecord {
  eventId: ObjectIdHex;
  eventCode: string;
  record: Submission;
  /** When it was scanned, epoch milliseconds. */
  scannedAt: number;
  /** Why the server last refused it, if it did. */
  problem: string | null;
}

export type ReadResult = { ok: true; scanned: ScannedRecord } | { ok: false; message: string };

const layouts = new WeakMap<MatchScoutingConfig, QrLayout>();
const layoutOf = (config: MatchScoutingConfig) => {
  let layout = layouts.get(config);
  if (!layout) layouts.set(config, (layout = qrLayout(config)));
  return layout;
};

/** A decoded performance as the record a scouting device would have sent (DV-5: no scouter). */
function submissionOf(p: QrPerformance): Submission {
  return {
    level: p.level,
    matchNumber: p.matchNumber,
    team: p.team,
    scouterId: null,
    nonce: p.nonce,
    submittedAt: p.submittedAt,
    clientVersion: p.clientVersion,
    coverage: p.coverage,
    actions: p.actions,
  };
}

/** AD-19: a code's text as a record, or why it can't be read, in words an admin acts on. */
export function readCode(text: string, inputs: ScannerInputs, now: number): ReadResult {
  const configs = Object.values(inputs.seasons);
  if (configs.length === 0)
    return {
      ok: false,
      message: "The scanner has no scouting configuration yet. Open this page once online.",
    };
  let decoded: QrPerformance | null = null;
  let refusal: string | null = null;
  for (const config of configs) {
    try {
      decoded = decodePerformance(text, layoutOf(config));
      break;
    } catch (error) {
      if (!(error instanceof QrError)) throw error;
      // A code made with another season's layout is tried with the next season; any other
      // refusal (damaged, another format) is the same with every layout.
      refusal ??= error.message;
      if (!/different scouting configuration/.test(error.message)) refusal = error.message;
    }
  }
  if (!decoded) return { ok: false, message: refusal! };
  const event = inputs.events.find((e) => e.id === decoded.eventId);
  if (!event)
    return {
      ok: false,
      message:
        "This code is from an event this server does not have. Was it scouted with another server, or before this page last went online?",
    };
  return {
    ok: true,
    scanned: {
      eventId: event.id,
      eventCode: event.code,
      record: submissionOf(decoded),
      scannedAt: now,
      problem: null,
    },
  };
}

/** "Qual 3, team 3061", as the scanner names a record. */
export function describe(record: { level: MatchLevel; matchNumber: number; team: TeamKey }) {
  return `${matchLabel(record.level, record.matchNumber)}, team ${record.team}`;
}

/**
 * AN-8 (#411): an event's performances with the records this device scanned and has not sent
 * yet, as the server would store them. One already on the server (by nonce) is left out. When the
 * server has a current record for the same robot and match, the later submitted one counts
 * (RT-14a); the device cannot apply RT-35, which needs the registry.
 */
export function withUnsent(
  performances: readonly PublicPerformance[],
  unsent: readonly ScannedRecord[],
): { performances: PublicPerformance[]; added: number } {
  const out = performances.map((p) => ({ ...p }));
  const nonces = new Set(out.map((p) => p.nonce));
  let added = 0;
  for (const s of unsent) {
    const r = s.record;
    if (nonces.has(r.nonce)) continue;
    const same = out.filter(
      (p) =>
        !p.superseded &&
        p.level === r.level &&
        p.matchNumber === r.matchNumber &&
        p.team === r.team,
    );
    const later = same.some((p) => p.submittedAt >= r.submittedAt);
    if (!later) for (const p of same) p.superseded = true;
    out.push({
      _id: `unsent-${r.nonce}`,
      tenantId: "default",
      eventId: s.eventId,
      level: r.level,
      matchNumber: r.matchNumber,
      team: r.team,
      source: "qr",
      clientVersion: r.clientVersion,
      submittedAt: r.submittedAt,
      matchKey: performanceKey(r.level, r.matchNumber, r.team, r.nonce),
      nonce: r.nonce,
      coverage: r.coverage,
      superseded: later,
      flag: { ...NOT_FLAGGED },
      notes: null,
      tags: [],
      actions: r.actions,
    });
    nonces.add(r.nonce);
    if (!later) added++;
  }
  return { performances: out, added };
}
