/**
 * An event's records for the edit page (#410; document 07 AD-10 to AD-12, SEC-5), behind the
 * admin session that `src/proxy.ts` checks.
 *
 * GET `?event=<id>` → `{ event: { _id, code }, rows }`: every record of the event, superseded
 * included, newest first, each with its scouter's name and alliance and without its actions
 * (`/api/admin/performances/<id>` has them). No `event` means the active event. 400 for an id that
 * is not one, 404 for an event this server does not have, 409 if none is active.
 */
import { NO_ACTIVE_EVENT } from "@/auth/active-event";
import { getDb } from "@/db/client";
import { getEvent } from "@/db/events";
import { adminPerformanceSummaries } from "@/db/performances";
import { effectiveMatches, getSchedule } from "@/db/schedules";
import { namesOf } from "@/db/scouters";
import { getSettings } from "@/db/settings";
import { editRows } from "@/edit/records";
import { Refusal, refusalResponse } from "@/lib/refusal";

export const dynamic = "force-dynamic";

const OBJECT_ID = /^[0-9a-f]{24}$/;

export async function GET(request: Request) {
  try {
    const asked = new URL(request.url).searchParams.get("event");
    if (asked !== null && !OBJECT_ID.test(asked))
      throw new Refusal(400, "event-id", "The event id is not valid.");
    const db = await getDb();
    const id = asked ?? (await getSettings(db)).activeEventId;
    if (id === null) throw NO_ACTIVE_EVENT;
    const event = await getEvent(db, id);
    if (!event) throw new Refusal(404, "no-such-event", "This server has no such event.");
    const records = await adminPerformanceSummaries(db, event._id);
    const ids = [...new Set(records.flatMap((r) => (r.scouterId === null ? [] : [r.scouterId])))];
    const [names, schedule] = await Promise.all([namesOf(db, ids), getSchedule(db, event._id)]);
    return Response.json({
      event: { _id: event._id, code: event.code },
      rows: editRows(records, names, effectiveMatches(schedule)),
    });
  } catch (error) {
    return refusalResponse(error);
  }
}
