import { route, json, bad } from "@/lib/server/http";
import { kick } from "@/lib/server/registry";

export const dynamic = "force-dynamic";

export const POST = route(
  async (req) => {
    const { sessionId } = await req.json().catch(() => ({}));
    return kick(String(sessionId)) ? json({ ok: true }) : bad("Scouter not found", 404);
  },
  { admin: true },
);
