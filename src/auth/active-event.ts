/**
 * The active event, for a device that presents its join code (SEC-2, SEC-3a). What a device
 * may read or write beyond public data (the roster, sign-in, submissions) needs the code.
 */
import type { Db } from "mongodb";
import { getEvent } from "@/db/events";
import { getSettings } from "@/db/settings";
import type { SpotEvent } from "@/data/types";
import { Refusal } from "@/lib/refusal";
import { checkJoinCode } from "./join-code";

export const NO_ACTIVE_EVENT = new Refusal(
  409,
  "no-active-event",
  "No event is active. An admin must choose one.",
);

export async function activeEventFor(db: Db, joinCode: string | null): Promise<SpotEvent> {
  const { activeEventId } = await getSettings(db);
  const event = activeEventId ? await getEvent(db, activeEventId) : null;
  if (!event) throw NO_ACTIVE_EVENT;
  const check = checkJoinCode(event, joinCode);
  if (!check.ok) throw new Refusal(403, "join-code", check.message);
  return event;
}
