import mongoose from "mongoose";
import { route, json, bad } from "@/lib/server/http";
import { getProject, getSettings, listEvents, updateSettings } from "@/lib/server/store";
import { getServerConfig } from "@/lib/server/env";
import { EventModel, connectDb } from "@/lib/server/db";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route(
  async () => {
    const env = getServerConfig();
    return json({
      settings: await getSettings(),
      events: await listEvents(),
      server: {
        demo: env.demo,
        hasTbaKey: !!env.tbaApiKey,
        authRequired: !!env.accessCode,
        configFile: env.source.file ? "config/config.json" : null,
        envVars: env.source.env,
      },
    });
  },
  { admin: true },
);

export const PUT = route(
  async (req) => {
    const body = (await req.json().catch(() => ({}))) as Partial<Settings>;
    const patch: Partial<Settings> = {};
    if (body.activeProjectId !== undefined) {
      if (!(await getProject(String(body.activeProjectId)))) return bad("Project not found");
      patch.activeProjectId = String(body.activeProjectId);
    }
    if (body.activeEventId !== undefined) {
      await connectDb();
      if (!mongoose.isValidObjectId(body.activeEventId) || !(await EventModel.exists({ _id: body.activeEventId }))) return bad("Event not found");
      patch.activeEventId = String(body.activeEventId);
    }
    if (typeof body.tbaEventKey === "string") patch.tbaEventKey = body.tbaEventKey.trim().toLowerCase();
    if (typeof body.swapZones === "boolean") patch.swapZones = body.swapZones;
    if (body.startRule === "auto" || body.startRule === "admin") patch.startRule = body.startRule;
    if (typeof body.clientVersion === "string") patch.clientVersion = body.clientVersion.slice(0, 20);
    return json({ settings: await updateSettings(patch) });
  },
  { admin: true },
);
