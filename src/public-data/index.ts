/**
 * What the analysis dashboard reads from the server (#382; docs/spec/08 AN-6; SEC-1). Anyone may
 * read it: no admin session and no join code. Scouter ids and join codes are removed on the read
 * path (SEC-8, SEC-3), and any event can be read, not only the active one (AN-11a).
 *
 * The server only reads MongoDB and TBA. The browser runs the pipeline (TR-9), so nothing here
 * calls the server's own routes (D-5, #90).
 */
import type { Db } from "mongodb";
import { getEvent, findEventByCode, publicEvents } from "@/db/events";
import { performanceCollection } from "@/db/performances";
import { getSettings } from "@/db/settings";
import {
  DEFAULT_TENANT,
  PRIVATE_PERFORMANCE_FIELDS,
  type PublicPerformance,
  type SpotEvent,
} from "@/data/types";
import { Refusal } from "@/lib/refusal";

/** An event as anyone may see it: by its code (DV-12b), never with its join code (SEC-3). */
export interface EventSummary {
  code: string;
  tbaKey: string;
  label: string;
  /** The event scouters are writing to now (AN-11a). */
  active: boolean;
}

/** Every event, newest code first, saying which is active. */
export async function eventList(db: Db): Promise<EventSummary[]> {
  const { activeEventId } = await getSettings(db);
  return (await publicEvents(db)).map((e) => ({
    code: e.code,
    tbaKey: e.tbaKey,
    label: e.label,
    active: e._id === activeEventId,
  }));
}

export function summaryOf(event: SpotEvent, activeEventId: string | null): EventSummary {
  return {
    code: event.code,
    tbaKey: event.tbaKey,
    label: event.label,
    active: event._id === activeEventId,
  };
}

/**
 * The event a request names by `?event=<code>`, or the active event when it names none. Refuses
 * with 404 and a message for a code no event has, and when none is named and none is active.
 */
export async function requestedEvent(
  db: Db,
  request: Request,
): Promise<{ event: SpotEvent; summary: EventSummary }> {
  const code = new URL(request.url).searchParams.get("event");
  const { activeEventId } = await getSettings(db);
  const event = code
    ? await findEventByCode(db, code)
    : activeEventId
      ? await getEvent(db, activeEventId)
      : null;
  if (!event) {
    throw code
      ? new Refusal(404, "no-event", `There is no event ${code}.`)
      : new Refusal(404, "no-event", "No event is active. Choose an event.");
  }
  return { event, summary: summaryOf(event, activeEventId) };
}

const HIDE_PRIVATE = Object.fromEntries(PRIVATE_PERFORMANCE_FIELDS.map((f) => [f, 0]));

/**
 * An event's current performances for anyone (SEC-1, SEC-8): no scouter ids, and none a later
 * record replaced (RT-14a, TR-5). Flagged and partial records stay in, with their flag and
 * coverage, so the dashboard can say so (AN-18a, RT-34).
 */
export async function currentPerformances(db: Db, event: SpotEvent): Promise<PublicPerformance[]> {
  return performanceCollection(db)
    .find(
      { tenantId: event.tenantId ?? DEFAULT_TENANT, eventId: event._id, superseded: false },
      { projection: HIDE_PRIVATE, sort: { level: -1, matchNumber: 1, team: 1 } },
    )
    .toArray() as Promise<PublicPerformance[]>;
}
