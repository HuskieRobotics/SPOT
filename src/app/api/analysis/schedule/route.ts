/**
 * An event's matches, for Simulate Match (#389; docs/spec/08 AN-11, AN-23). Anyone may read it:
 * it says which teams play in which match, as TBA publishes, and the event's scouting data
 * already shows it for every match scouted.
 *
 * GET `?event=<code>` (the active event when absent) → `{ event, matches: [{ level, number, key,
 * red, blue }] }`: the matches assignment uses (AD-8), from TBA or typed by an admin, as last
 * stored. It never asks TBA itself. 404 with a message for an unknown code, or when none is named
 * and none is active.
 */
import { getDb } from "@/db/client";
import { effectiveMatches, getSchedule } from "@/db/schedules";
import { refusalResponse } from "@/lib/refusal";
import { requestedEvent } from "@/public-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const { event, summary } = await requestedEvent(db, request);
    const matches = effectiveMatches(await getSchedule(db, event._id)).map(
      ({ level, number, key, red, blue }) => ({ level, number, key, red, blue }),
    );
    return Response.json({ event: summary, matches }, { headers: { "cache-control": "no-cache" } });
  } catch (error) {
    return refusalResponse(error);
  }
}
