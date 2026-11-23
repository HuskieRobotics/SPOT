import { route, json } from "@/lib/server/http";
import { getActiveProject, getSchedule, getSettings } from "@/lib/server/store";
import { getServerConfig } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/** Everything the scouting client needs (cached by the service worker for offline use). */
export const GET = route(async () => {
  const [settings, project] = await Promise.all([getSettings(), getActiveProject()]);
  const schedule = await getSchedule().catch(() => []);
  return json({
    project: { _id: project._id, name: project.name, revision: project.revision, scouting: project.scouting },
    settings: { activeEventId: settings.activeEventId, swapZones: settings.swapZones, clientVersion: settings.clientVersion, tbaEventKey: settings.tbaEventKey },
    demo: getServerConfig().demo,
    schedule,
  });
});
