import { route, json, bad } from "@/lib/server/http";
import { getManualSchedule, setManualSchedule } from "@/lib/server/store";
import type { Match } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Manual schedule for events without TBA data. An empty list switches back to TBA. */
export const GET = route(async () => json({ matches: await getManualSchedule() }), { admin: true });

export const PUT = route(
  async (req) => {
    const body = await req.json().catch(() => null);
    if (!Array.isArray(body?.matches)) return bad("matches[] required");
    const matches: Match[] = body.matches.slice(0, 500).map((m: any, i: number) => ({
      number: Number(m.number) || i + 1,
      match_string: String(m.match_string || `manual_qm${Number(m.number) || i + 1}`),
      robots: {
        red: [0, 1, 2].map((k) => String(m.robots?.red?.[k] ?? "").trim()),
        blue: [0, 1, 2].map((k) => String(m.robots?.blue?.[k] ?? "").trim()),
      },
    }));
    await setManualSchedule(matches);
    return json({ matches });
  },
  { admin: true },
);
