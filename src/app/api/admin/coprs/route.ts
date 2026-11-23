import { route, json } from "@/lib/server/http";
import { getSettings } from "@/lib/server/store";
import { tbaCoprs } from "@/lib/server/tba";

export const dynamic = "force-dynamic";

/** Component-OPR names TBA offers for an event (so admins pick OPRs instead of typing them). */
export const GET = route(
  async (req) => {
    const key = new URL(req.url).searchParams.get("event") || (await getSettings()).tbaEventKey;
    return json({ eventKey: key, keys: Object.keys(await tbaCoprs(key)).sort() });
  },
  { admin: true },
);
