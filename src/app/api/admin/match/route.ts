import { route, json, bad } from "@/lib/server/http";
import { setCurrentMatch } from "@/lib/server/registry";
import { getSchedule } from "@/lib/server/store";
import type { Match } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Select the match being scouted: { number } from the schedule, or a full custom match object. */
export const POST = route(
  async (req) => {
    const body = await req.json().catch(() => ({}));
    if (body.clear) {
      setCurrentMatch(null);
      return json({ match: null });
    }
    let match: Match | undefined;
    if (body.robots) match = { number: Number(body.number), match_string: String(body.match_string ?? `custom_${body.number}`), robots: { red: body.robots.red.map(String), blue: body.robots.blue.map(String) } };
    else match = (await getSchedule()).find((m) => m.number === Number(body.number));
    if (!match) return bad("Match not found in schedule");
    setCurrentMatch(match);
    return json({ match });
  },
  { admin: true },
);
