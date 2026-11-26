/**
 * The active event's schedule for a scouting device (#361, OF-1, SC-28): which alliance each team
 * is on in each match, kept on the device so a scouter who types the match and team with no
 * connection starts on the right alliance. Needs the join code, like the roster.
 *
 * GET → `{ eventId, matches: [{ level, number, red, blue }] }`, the matches assignment uses
 * (AD-8), as last read from TBA or typed by an admin. It never asks TBA itself.
 */
import { activeEventFor } from "@/auth/active-event";
import { JOIN_CODE_HEADER } from "@/auth/join-code";
import { getDb } from "@/db/client";
import { effectiveMatches, getSchedule } from "@/db/schedules";
import { refusalResponse } from "@/lib/refusal";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const event = await activeEventFor(db, request.headers.get(JOIN_CODE_HEADER));
    const matches = effectiveMatches(await getSchedule(db, event._id)).map(
      ({ level, number, red, blue }) => ({ level, number, red, blue }),
    );
    return Response.json({ eventId: event._id, matches });
  } catch (error) {
    return refusalResponse(error);
  }
}
