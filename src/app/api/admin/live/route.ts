import { route, json } from "@/lib/server/http";
import { configureRegistry, getCurrentMatch, listScouters } from "@/lib/server/registry";
import { getSchedule, getSettings } from "@/lib/server/store";
import { getServerConfig } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/** Admin live view poll: scouters, current match and schedule. */
export const GET = route(
  async () => {
    const settings = await getSettings();
    configureRegistry({ startRule: settings.startRule, demo: getServerConfig().demo });
    const schedule = await getSchedule().catch(() => []);
    return json({ scouters: listScouters(), match: getCurrentMatch(), schedule, startRule: settings.startRule });
  },
  { admin: true },
);
