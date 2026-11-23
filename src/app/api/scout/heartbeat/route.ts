import { route, json, bad } from "@/lib/server/http";
import { configureRegistry, heartbeat } from "@/lib/server/registry";
import { getSettings } from "@/lib/server/store";
import { getServerConfig } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/** Scouter poll (every ~2 s): reports state, returns assignment and "enter match" signal. */
export const POST = route(async (req) => {
  const body = await req.json().catch(() => null);
  if (!body?.sessionId || typeof body.sessionId !== "string") return bad("sessionId required");
  const settings = await getSettings();
  configureRegistry({ startRule: settings.startRule, demo: getServerConfig().demo });
  return json(
    heartbeat({
      sessionId: body.sessionId.slice(0, 64),
      scouterId: typeof body.scouterId === "string" ? body.scouterId.slice(0, 64) : undefined,
      status: Number.isInteger(body.status) ? body.status : undefined,
      matchNumber: body.matchNumber ?? undefined,
      robotNumber: body.robotNumber != null ? String(body.robotNumber) : undefined,
    }),
  );
});
