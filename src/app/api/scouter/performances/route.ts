/**
 * Submissions from a scouting device (#360; SC-39, OF-2, SEC-2, SEC-9). Sends
 * `{ eventId, records }` with the join code in the `X-SPOT-Join-Code` header, and gets
 * `{ results }`, one per record in order: `stored`, `duplicate` (the server already has it), or
 * `invalid` with a message. The device forgets a record only once it is stored or a duplicate.
 *
 * `eventId` is the event the matches were scouted at, so a device that syncs late still files
 * them there; null means the active event. Refusals, each kept on the device: 400 for a malformed
 * request, 403 if the join code does not open that event, 404 for an event this server does not
 * have, 409 if `eventId` is null and no event is active.
 */
import { checkJoinCode, JOIN_CODE_HEADER, joinCodeRefusal } from "@/auth/join-code";
import { NO_ACTIVE_EVENT } from "@/auth/active-event";
import { getDb } from "@/db/client";
import { getEvent } from "@/db/events";
import { getSettings } from "@/db/settings";
import { Refusal, refusalResponse } from "@/lib/refusal";
import { jsonBody } from "@/sessions/input";
import { getRuntime } from "@/sessions/runtime";
import { submitPerformances } from "@/submissions/service";
import { MAX_SUBMISSIONS } from "@/submissions/submission";

const OBJECT_ID = /^[0-9a-f]{24}$/;

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const records = body.records;
    if (!Array.isArray(records))
      throw new Refusal(400, "body", "The request must carry a list of records.");
    if (records.length > MAX_SUBMISSIONS)
      throw new Refusal(413, "too-many", `Send at most ${MAX_SUBMISSIONS} records at a time.`);
    const eventId = body.eventId ?? null;
    if (eventId !== null && (typeof eventId !== "string" || !OBJECT_ID.test(eventId)))
      throw new Refusal(400, "event-id", "The event id is not valid.");

    const db = await getDb();
    const id = eventId ?? (await getSettings(db)).activeEventId;
    if (id === null) throw NO_ACTIVE_EVENT;
    const event = await getEvent(db, id);
    if (!event)
      throw new Refusal(
        404,
        "no-such-event",
        "These matches were scouted at an event this server does not have. Show their QR codes to an admin.",
      );
    const check = checkJoinCode(event, request.headers.get(JOIN_CODE_HEADER));
    // SEC-3a: 403 with the reason (missing, wrong, no-code) and a message to act on.
    if (!check.ok) return joinCodeRefusal(check);

    const runtime = await getRuntime();
    const results = await submitPerformances(db, event, records, {
      source: "app",
      assignmentOf: (level, matchNumber, team) =>
        runtime.assignmentOf(event._id, level, matchNumber, team),
    });
    return Response.json({ results });
  } catch (error) {
    return refusalResponse(error);
  }
}
