/**
 * The active event's match schedule for admins (#355), behind the admin session that
 * `src/proxy.ts` checks.
 *
 * GET  → `{ schedule }`: the schedule in use and where it came from, TBA's status, the manual
 *        schedule, the current match and every team; TBA is re-read when its copy is old
 * POST `{ action: "refresh" }` — read TBA's schedule now (RT-22)
 *      `{ action: "save-manual", matches: [{ number, red: [3], blue: [3], locked? }] }` — the
 *        typed schedule (AD-22 to AD-25a); an empty list goes back to TBA's (AD-8)
 * 400 with the match and slot for a typed team that is not a team number; 409 if no event is
 * active.
 */
import { getDb } from "@/db/client";
import { getSettings } from "@/db/settings";
import { ScheduleError } from "@/schedule/manual";
import { saveManualSchedule, scheduleView } from "@/schedule/service";
import { jsonBody } from "@/sessions/input";
import { getRuntime, Refusal, refusalResponse } from "@/sessions/runtime";

export const dynamic = "force-dynamic";

async function activeEventId() {
  const db = await getDb();
  const { activeEventId } = await getSettings(db);
  if (!activeEventId)
    throw new Refusal(409, "no-active-event", "No event is active. An admin must choose one.");
  return { db, eventId: activeEventId };
}

export async function GET() {
  try {
    const { db, eventId } = await activeEventId();
    const schedule = await scheduleView(db, eventId);
    // A first read of TBA may have given the current match its teams.
    await (await getRuntime()).scheduleChanged();
    return Response.json({ schedule });
  } catch (error) {
    return refusalResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const { db, eventId } = await activeEventId();
    if (body.action === "save-manual") {
      try {
        await saveManualSchedule(db, eventId, body.matches);
      } catch (error) {
        if (error instanceof ScheduleError) throw new Refusal(400, "schedule", error.message);
        throw error;
      }
    } else if (body.action !== "refresh")
      throw new Refusal(400, "action", "The action must be refresh or save-manual.");
    const schedule = await scheduleView(db, eventId, { refresh: body.action === "refresh" });
    await (await getRuntime()).scheduleChanged();
    return Response.json({ schedule });
  } catch (error) {
    return refusalResponse(error);
  }
}
