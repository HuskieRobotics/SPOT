import mongoose from "mongoose";
import { route, json } from "@/lib/server/http";
import { connectDb, plain, TmpModel } from "@/lib/server/db";
import { getSchedule, getSettings, listEvents, tbaKeyForEvent } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** Every scouted match for an event (Data tab), plus the schedule for "not scouted" rows. */
export const GET = route(
  async (req) => {
    await connectDb();
    const settings = await getSettings();
    const eventId = new URL(req.url).searchParams.get("event") || settings.activeEventId;
    const filter = eventId && mongoose.isValidObjectId(eventId) ? { eventNumber: eventId } : {};
    const tmps = plain(await TmpModel.find(filter).sort({ timestamp: -1 }).lean());
    const events = await listEvents();
    const ev = events.find((e) => e._id === eventId);
    const schedule = await getSchedule(eventId === settings.activeEventId ? undefined : tbaKeyForEvent(ev, settings.tbaEventKey)).catch(() => []);
    return json({ tmps, schedule, eventId, events });
  },
  { admin: true },
);
