import mongoose from "mongoose";
import { route, json } from "@/lib/server/http";
import { connectDb, plain, TmpModel } from "@/lib/server/db";
import { getProject, getSchedule, getSettings, listEvents, listProjects, tbaKeyForEvent } from "@/lib/server/store";
import { tbaBundle } from "@/lib/server/tba";
import { getServerConfig } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/**
 * One request gives the analysis dashboard everything it needs (and the service worker caches
 * it for offline use): the project's pipeline + modules, the event's matches, and TBA data.
 * ?event=<id> browses another event; ?project=<id> analyses with another project.
 */
export const GET = route(async (req) => {
  await connectDb();
  const url = new URL(req.url);
  const settings = await getSettings();
  const eventId = url.searchParams.get("event") || settings.activeEventId;
  const projectId = url.searchParams.get("project") || settings.activeProjectId!;
  const [project, events, projects] = await Promise.all([getProject(projectId), listEvents(), listProjects()]);
  const ev = events.find((e) => e._id === eventId);
  const isActive = eventId === settings.activeEventId;
  const tbaKey = isActive ? settings.tbaEventKey : tbaKeyForEvent(ev, settings.tbaEventKey);
  const filter: Record<string, unknown> = eventId && mongoose.isValidObjectId(eventId) ? { eventNumber: eventId } : {};
  const [tmps, tba, schedule] = await Promise.all([
    TmpModel.find(filter, { __v: 0 }).lean(),
    tbaBundle(tbaKey),
    getSchedule(isActive ? undefined : tbaKey).catch(() => []),
  ]);
  return json({
    project,
    projects: projects.map((p) => ({ _id: p._id, name: p.name })),
    events,
    eventId,
    tbaEventKey: tbaKey,
    activeProjectId: settings.activeProjectId,
    demo: getServerConfig().demo,
    tmps: plain(tmps),
    tba,
    schedule,
  });
});
