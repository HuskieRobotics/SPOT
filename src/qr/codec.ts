/**
 * A performance as a QR code, for a match scouted with no network (#358; docs/spec/03 "QR-code
 * payload"). Pure TypeScript: the scouting client encodes, the scanner page decodes (Phase 4).
 *
 * The payload is bits, most significant first, padded to whole bytes, then written as Base45 so
 * the code uses the QR alphanumeric mode (error correction M). Header, in order:
 *
 *   format 8 · layout fingerprint 16 (DM-15a) · client version major, minor, patch 8 each ·
 *   event id 96 · level 1 (qual 0, playoff 1; DV-17) · match number 10 · team number 16 and
 *   suffix letter 8 (its ASCII code, 0 for none; DM-15c) · nonce length 4 and value 63 (base 36)
 *   · submitted at 42 (epoch ms) · coverage 1 (full 0, partial 1; RT-34) · action count 10
 *
 * Then each action: button number, period number and time, at the widths the layout derives
 * (`layout.ts`), and a position flag followed, when set, by x and y in 7 bits each (SC-32).
 *
 * The encoder refuses what it cannot carry exactly, with a message, rather than make a wrong
 * code. The decoder refuses a code from another format or configuration.
 */
import { TEAM_KEY_PATTERN, type TeamKey } from "@/data/team";
import { NOT_FLAGGED, performanceKey, type Action, type TeamMatchPerformance } from "@/data/types";
import { BitReader, BitWriter } from "./bits";
import { fromBase45, toBase45 } from "./base45";
import { placementKey, POSITION_BITS, type QrLayout } from "./layout";

/** The payload format. A code with another value was made by another version of SPOT. */
export const QR_FORMAT = 1;

/** The most bytes one QR code holds at error correction M as Base45 (version 40: 3391 chars). */
export const MAX_QR_BYTES = 2260;

const MAX_MATCH = 1023;
const MAX_ACTIONS = 1023;
const MAX_NONCE = 12;
const SUBMITTED_BITS = 42;
const HEADER_BITS = 8 + 16 + 24 + 96 + 1 + 10 + 24 + 4 + 63 + SUBMITTED_BITS + 1 + 10;

/** What a QR code carries of a performance. */
export type QrInput = Pick<
  TeamMatchPerformance,
  | "eventId"
  | "level"
  | "matchNumber"
  | "team"
  | "clientVersion"
  | "submittedAt"
  | "nonce"
  | "coverage"
  | "actions"
>;

/** A decoded performance: everything but the ids the server gives it when it is stored. */
export type QrPerformance = Omit<TeamMatchPerformance, "_id" | "tenantId">;

/** Why a performance cannot be encoded, or a code cannot be read, in words a person acts on. */
export class QrError extends Error {}

/** A nonce as a QR code carries it: 1 to 12 lowercase base-36 characters. */
export const NONCE_PATTERN = /^[0-9a-z]{1,12}$/;

function versionParts(version: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version);
  const parts = m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : [];
  if (parts.length !== 3 || parts.some((p) => p > 255))
    throw new QrError(`The client version "${version}" is not major.minor.patch, each up to 255.`);
  return parts as [number, number, number];
}

function teamParts(team: TeamKey): [number, number] {
  if (!TEAM_KEY_PATTERN.test(team)) throw new QrError(`"${team}" is not a team.`);
  const suffix = /[A-Z]$/.test(team) ? team.charCodeAt(team.length - 1) : 0;
  const number = Number(suffix ? team.slice(0, -1) : team);
  if (number > 0xffff)
    throw new QrError(`Team ${team} cannot go in a QR code: team numbers stop at 65535.`);
  return [number, suffix];
}

function nonceValue(nonce: string): bigint {
  if (!NONCE_PATTERN.test(nonce))
    throw new QrError(`The record's nonce "${nonce}" is not 1 to 12 letters and digits.`);
  return [...nonce].reduce((v, c) => v * BigInt(36) + BigInt(parseInt(c, 36)), BigInt(0));
}

function nonceText(value: bigint, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++, value /= BigInt(36))
    out = (value % BigInt(36)).toString(36) + out;
  return out;
}

/** The position an action carries, or null; anything else in `other` cannot be carried. */
function positionOf(action: Action, n: number): { x: number; y: number } | null {
  const other = action.other;
  if (!other || Object.keys(other).length === 0) return null;
  const pos = other.pos as { x?: unknown; y?: unknown } | undefined;
  const extra = Object.keys(other).filter((k) => k !== "pos");
  if (extra.length > 0)
    throw new QrError(
      `Action ${n} (${action.id}) has ${extra.join(", ")}, which a QR code cannot carry; only positions go in one.`,
    );
  const ok = (v: unknown): v is number =>
    Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100;
  if (!pos || !ok(pos.x) || !ok(pos.y))
    throw new QrError(`Action ${n} (${action.id}) has a position that is not whole percentages.`);
  return { x: pos.x, y: pos.y };
}

/** The code's text for a performance, or a `QrError` saying why it cannot be made. */
export function encodePerformance(p: QrInput, layout: QrLayout): string {
  const w = new BitWriter();
  w.write(QR_FORMAT, 8);
  w.write(layout.fingerprint, 16);
  for (const part of versionParts(p.clientVersion)) w.write(part, 8);
  if (!/^[0-9a-f]{24}$/.test(p.eventId)) throw new QrError("The record has no valid event.");
  w.write(BigInt(`0x${p.eventId}`), 96);
  w.write(p.level === "playoff" ? 1 : 0, 1);
  if (!Number.isInteger(p.matchNumber) || p.matchNumber < 1 || p.matchNumber > MAX_MATCH)
    throw new QrError(
      `Match ${p.matchNumber} cannot go in a QR code: matches stop at ${MAX_MATCH}.`,
    );
  w.write(p.matchNumber, 10);
  const [number, suffix] = teamParts(p.team);
  w.write(number, 16);
  w.write(suffix, 8);
  w.write(p.nonce.length, 4);
  w.write(nonceValue(p.nonce), 63);
  if (!Number.isInteger(p.submittedAt) || p.submittedAt < 0 || p.submittedAt >= 2 ** SUBMITTED_BITS)
    throw new QrError("The record's submission time is not a time.");
  w.write(p.submittedAt, SUBMITTED_BITS);
  w.write(p.coverage === "partial" ? 1 : 0, 1);
  if (p.actions.length > MAX_ACTIONS)
    throw new QrError(
      `${p.actions.length} actions cannot go in a QR code; the most is ${MAX_ACTIONS}.`,
    );
  w.write(p.actions.length, 10);

  const buttons = new Map(layout.buttons.map((id, i) => [id, i]));
  const placements = new Map(layout.placements.map((pl, i) => [placementKey(pl), i]));
  p.actions.forEach((a, i) => {
    const n = i + 1;
    const button = buttons.get(a.id);
    if (button === undefined)
      throw new QrError(
        `Action ${n} is "${a.id}", which is not a button in this scouting configuration.`,
      );
    const placement = placements.get(placementKey(a));
    if (placement === undefined)
      throw new QrError(
        `Action ${n} (${a.id}) was recorded in a period this scouting configuration does not have.`,
      );
    if (!Number.isInteger(a.ts) || a.ts < 0 || a.ts > layout.maxTs)
      throw new QrError(`Action ${n} (${a.id}) has a time outside the match.`);
    w.write(button, layout.bits.button);
    w.write(placement, layout.bits.placement);
    w.write(a.ts, layout.bits.ts);
    const pos = positionOf(a, n);
    w.write(pos ? 1 : 0, 1);
    if (pos) {
      w.write(pos.x, POSITION_BITS);
      w.write(pos.y, POSITION_BITS);
    }
  });

  const bytes = w.bytes();
  if (bytes.length > MAX_QR_BYTES)
    throw new QrError(
      `This match is too large for one QR code (${bytes.length} bytes; one code holds ${MAX_QR_BYTES}). Keep it on this device and sync it when there is a connection.`,
    );
  return toBase45(bytes);
}

/** The most actions one code holds under a layout, with none or all of them positioned. */
export function actionsPerCode(layout: QrLayout, positioned = false): number {
  const per = positioned ? layout.actionBits.positioned : layout.actionBits.plain;
  return Math.min(MAX_ACTIONS, Math.floor((MAX_QR_BYTES * 8 - HEADER_BITS) / per));
}

/** Read a code's text back into a performance, or a `QrError` saying why it cannot be. */
export function decodePerformance(text: string, layout: QrLayout): QrPerformance {
  const bytes = fromBase45(text.trim());
  if (!bytes || bytes.length < Math.ceil(HEADER_BITS / 8))
    throw new QrError(
      "This is not a SPOT match code. A code from SPOT v5 must be scanned by SPOT v5.",
    );
  const r = new BitReader(bytes);
  try {
    const format = r.read(8);
    if (format !== QR_FORMAT)
      throw new QrError(
        `This code was made by another version of SPOT (format ${format}); this one reads format ${QR_FORMAT}.`,
      );
    const fingerprint = r.read(16);
    if (fingerprint !== layout.fingerprint)
      throw new QrError(
        `This code was made with a different scouting configuration (${hex4(fingerprint)}; this server has ${hex4(layout.fingerprint)}). Its buttons would be read wrongly, so it is refused. Scan it where the configuration the scouter used is active.`,
      );
    const clientVersion = [r.read(8), r.read(8), r.read(8)].join(".");
    const eventId = r.readBig(96).toString(16).padStart(24, "0");
    const level = r.read(1) === 1 ? "playoff" : "qual";
    const matchNumber = r.read(10);
    const number = r.read(16);
    const suffix = r.read(8);
    const length = r.read(4);
    const nonceBits = r.readBig(63);
    const submittedAt = r.read(SUBMITTED_BITS);
    const coverage = r.read(1) === 1 ? "partial" : "full";
    const count = r.read(10);
    const bad = (what: string) => new QrError(`This code is damaged: ${what}. Scan it again.`);
    if (matchNumber < 1) throw bad("it has no match number");
    if (number < 1 || (suffix !== 0 && (suffix < 65 || suffix > 90))) throw bad("it has no team");
    if (length < 1 || length > MAX_NONCE || nonceBits >= BigInt(36) ** BigInt(length))
      throw bad("its record key is wrong");

    const actions: Action[] = [];
    for (let i = 0; i < count; i++) {
      const button = r.read(layout.bits.button);
      const placement = r.read(layout.bits.placement);
      const ts = r.read(layout.bits.ts);
      const positioned = r.read(1) === 1;
      if (
        button >= layout.buttons.length ||
        placement >= layout.placements.length ||
        ts > layout.maxTs
      )
        throw bad(`action ${i + 1} is not one this configuration has`);
      const action: Action = { id: layout.buttons[button], ts, ...layout.placements[placement] };
      if (positioned) {
        const x = r.read(POSITION_BITS);
        const y = r.read(POSITION_BITS);
        if (x > 100 || y > 100) throw bad(`action ${i + 1} has a position off the field`);
        action.other = { pos: { x, y } };
      }
      actions.push(action);
    }
    if (r.remaining >= 8 || r.read(r.remaining) !== 0)
      throw bad("it has data after the last action");

    const team = `${number}${suffix ? String.fromCharCode(suffix) : ""}`;
    const nonce = nonceText(nonceBits, length);
    return {
      eventId,
      level,
      matchNumber,
      team,
      // DV-5: a scanned record names no scouter.
      scouterId: null,
      source: "qr",
      clientVersion,
      submittedAt,
      matchKey: performanceKey(level, matchNumber, team, nonce),
      nonce,
      coverage,
      superseded: false,
      flag: { ...NOT_FLAGGED },
      notes: null,
      tags: [],
      actions,
    };
  } catch (error) {
    if (error instanceof RangeError)
      throw new QrError("This code is incomplete. Scan it again, holding the camera steady.");
    throw error;
  }
}

function hex4(n: number): string {
  return n.toString(16).padStart(4, "0");
}
