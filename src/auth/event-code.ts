/**
 * The event code (SEC-2, SEC-3, ADR 0004): a short code per event that a device enters once
 * and attaches to every submission, so strangers cannot pollute the database. It protects the
 * data's integrity, not its secrecy: reads stay public (SEC-1).
 *
 * It is checked when data reaches the server, never as a condition of scouting (SEC-9): a
 * device with a wrong code keeps scouting and keeps its records until the code is fixed.
 */
import type { SpotEvent } from "@/data/types";

/** The header a submission carries the code in (#360). */
export const EVENT_CODE_HEADER = "x-spot-event-code";

/** No 0/O, 1/I/L or U/V, which look alike on a phone held up in a stand. */
const ALPHABET = "ABCDEFGHJKMNPQRSTWXYZ23456789";
export const EVENT_CODE_LENGTH = 6;

export function newEventCode(): string {
  // Rejection sampling, so every symbol is equally likely.
  const out: string[] = [];
  const limit = 256 - (256 % ALPHABET.length);
  while (out.length < EVENT_CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < limit && out.length < EVENT_CODE_LENGTH)
        out.push(ALPHABET[byte % ALPHABET.length]);
    }
  }
  return out.join("");
}

/** What a scouter typed, as the code is stored: capitals, no spaces or dashes. */
export function normalizeEventCode(typed: string): string {
  return typed.toUpperCase().replace(/[\s-]+/g, "");
}

export type EventCodeCheck =
  { ok: true } | { ok: false; reason: "missing" | "wrong" | "no-code"; message: string };

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Whether a submission's code opens this event. The messages are for a scouter to act on. */
export function checkEventCode(
  event: Pick<SpotEvent, "eventCode">,
  supplied: string | null | undefined,
): EventCodeCheck {
  if (event.eventCode === null)
    return {
      ok: false,
      reason: "no-code",
      message: "This event has no event code yet. Ask an admin to create one.",
    };
  if (!supplied || normalizeEventCode(supplied) === "")
    return {
      ok: false,
      reason: "missing",
      message: "Enter the event code in the settings menu. An admin can tell you what it is.",
    };
  if (!sameText(normalizeEventCode(supplied), event.eventCode))
    return {
      ok: false,
      reason: "wrong",
      message:
        "The event code is wrong, or an admin changed it. Ask an admin for the code. Your matches are kept on this device.",
    };
  return { ok: true };
}

/** The response for a refused submission: 403, with the reason and message (#360 sends it). */
export function eventCodeRefusal(check: Exclude<EventCodeCheck, { ok: true }>): Response {
  return Response.json(
    { error: "event-code", reason: check.reason, message: check.message },
    { status: 403 },
  );
}
