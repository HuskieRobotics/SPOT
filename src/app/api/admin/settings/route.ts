/**
 * Settings for admins (DV-13, #357), behind the admin session that `src/proxy.ts` checks. A change
 * takes effect at once, without a restart (ADR 0003).
 *
 * GET  → `{ settings, event }`: the settings and the active event with its join code, or null
 * POST any of, together or apart:
 *      `{ activeEvent: "<event code>" }` (or null for none) — DV-12a, DV-12b: chosen by code;
 *        every device signs in again, to the new event
 *      `{ startRules: { quorum?: 1 to 6, startOnFirstScouter?: boolean } }` — RT-12a
 *      `{ fieldFlipped: boolean }` — A-19, SC-28: sent to every device
 *      → `{ settings, event }`; 400 for a value out of range; 404 for an unknown event code
 */
import type { Db } from "mongodb";
import { getDb } from "@/db/client";
import { findEventByCode, getEvent } from "@/db/events";
import { getSettings, updateSettings, type SettingsChange } from "@/db/settings";
import type { Settings } from "@/data/types";
import { Refusal, refusalResponse } from "@/lib/refusal";
import { jsonBody } from "@/sessions/input";
import { getRuntime } from "@/sessions/runtime";

export const dynamic = "force-dynamic";

async function view(db: Db, settings: Settings) {
  const event = settings.activeEventId ? await getEvent(db, settings.activeEventId) : null;
  return { settings, event };
}

export async function GET() {
  try {
    const db = await getDb();
    return Response.json(await view(db, await getSettings(db)));
  } catch (error) {
    return refusalResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const db = await getDb();
    const change: SettingsChange = {};
    if ("activeEvent" in body) {
      if (body.activeEvent === null) change.activeEventId = null;
      else {
        const code = typeof body.activeEvent === "string" ? body.activeEvent.trim() : "";
        const event = code ? await findEventByCode(db, code) : null;
        if (!event)
          throw new Refusal(404, "event", `There is no event ${code || "with that code"}.`);
        change.activeEventId = event._id;
      }
    }
    if ("startRules" in body) {
      const rules = body.startRules as Record<string, unknown> | null;
      if (!rules || typeof rules !== "object")
        throw new Refusal(
          400,
          "start-rules",
          "The start rules are { quorum, startOnFirstScouter }.",
        );
      change.startRules = {};
      if ("quorum" in rules) {
        const q = rules.quorum;
        if (typeof q !== "number" || !Number.isInteger(q) || q < 1 || q > 6)
          throw new Refusal(400, "quorum", "The quorum is a whole number from 1 to 6.");
        change.startRules.quorum = q;
      }
      if ("startOnFirstScouter" in rules) {
        if (typeof rules.startOnFirstScouter !== "boolean")
          throw new Refusal(400, "start-on-first-scouter", "Start on first scouter is on or off.");
        change.startRules.startOnFirstScouter = rules.startOnFirstScouter;
      }
    }
    if ("fieldFlipped" in body) {
      if (typeof body.fieldFlipped !== "boolean")
        throw new Refusal(400, "field-flipped", "The field orientation is flipped or not.");
      change.fieldFlipped = body.fieldFlipped;
    }
    const settings = await updateSettings(db, change);
    await (await getRuntime()).settingsChanged();
    return Response.json(await view(db, settings));
  } catch (error) {
    return refusalResponse(error);
  }
}
