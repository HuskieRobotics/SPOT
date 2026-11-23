import mongoose from "mongoose";
import { route, json } from "@/lib/server/http";
import { connectDb, TmpModel } from "@/lib/server/db";
import { getProject, getSettings, listEvents, tbaKeyForEvent } from "@/lib/server/store";
import { tbaMatches, toSpotMatches } from "@/lib/server/tba";
import { calculateScouterAccuracy } from "@/lib/scoring";

export const dynamic = "force-dynamic";

/** Scouter accuracy: scouted points per alliance vs. official TBA alliance scores. */
export const GET = route(
  async (req) => {
    await connectDb();
    const url = new URL(req.url);
    const settings = await getSettings();
    const eventId = url.searchParams.get("event") || settings.activeEventId;
    const project = await getProject(url.searchParams.get("project") || settings.activeProjectId!);
    const events = await listEvents();
    const tbaKey = eventId === settings.activeEventId ? settings.tbaEventKey : tbaKeyForEvent(events.find((e) => e._id === eventId), settings.tbaEventKey);
    const filter = eventId && mongoose.isValidObjectId(eventId) ? { eventNumber: eventId } : {};
    const records: any[] = await TmpModel.find(filter).sort({ timestamp: 1 }).lean();
    const official = await tbaMatches(tbaKey);
    const byNumber = new Map(toSpotMatches(official).map((m) => [m.number, m.match_string]));
    // "current" ignores the per-match snapshot and re-scores everything with today's point map.
    const useCurrent = url.searchParams.get("points") === "current";
    const enriched = records.map((r) => ({
      scouterId: r.scouterId,
      robotNumber: r.robotNumber,
      matchKey: r.matchKey || byNumber.get(Number(r.matchNumber)) || null,
      actionQueue: r.actionQueue,
      scoringRules: useCurrent ? undefined : r.scoringRules,
    }));
    const result = calculateScouterAccuracy(enriched, official as any, project!.scoring);
    return json({
      ...result,
      diagnostics: {
        recordsConsidered: records.length,
        recordsMatchedToTba: enriched.filter((r) => r.matchKey).length,
        officialMatches: official.length,
        tbaEventKey: tbaKey,
        pointMapSize: Object.keys(project!.scoring.points).length,
      },
    });
  },
  { admin: true },
);
