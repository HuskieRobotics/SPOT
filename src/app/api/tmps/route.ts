import mongoose from "mongoose";
import { route, json, bad } from "@/lib/server/http";
import { connectDb, TmpModel } from "@/lib/server/db";
import { getProject, getSchedule, getSettings } from "@/lib/server/store";
import { normalizePoints } from "@/lib/scoring";
import type { TeamMatchPerformance } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Upload one or more scouted matches (live sync, offline backlog, or a scanned QR code).
 * Idempotent: a match already stored (same matchId or matchId_rand) is acknowledged, not duplicated.
 */
export const POST = route(async (req) => {
  const body = await req.json().catch(() => null);
  const list: Partial<TeamMatchPerformance>[] = Array.isArray(body?.tmps) ? body.tmps : Array.isArray(body) ? body : body ? [body] : [];
  if (!list.length) return bad("No matches in request");
  if (list.length > 200) return bad("Too many matches in one request");
  await connectDb();
  const settings = await getSettings();
  const schedule = await getSchedule().catch(() => []);
  const projects = new Map<string, Awaited<ReturnType<typeof getProject>>>();

  const saved: string[] = [];
  const duplicates: string[] = [];
  const rejected: { matchId?: string; error: string }[] = [];
  for (const t of list) {
    const robotNumber = Number(t.robotNumber);
    const matchNumber = Number(t.matchNumber);
    if (!Number.isFinite(robotNumber) || !Number.isFinite(matchNumber) || !Array.isArray(t.actionQueue) || !t.matchId_rand) {
      rejected.push({ matchId: t.matchId, error: "Missing robot, match, actions or id" });
      continue;
    }
    const eventNumber = t.eventNumber && mongoose.isValidObjectId(t.eventNumber) ? t.eventNumber : settings.activeEventId;
    const exists = await TmpModel.exists({ $or: [{ matchId: t.matchId }, { matchId_rand: t.matchId_rand, robotNumber, matchNumber }] });
    if (exists) {
      duplicates.push(String(t.matchId));
      continue;
    }
    const projectId = t.projectId || settings.activeProjectId!;
    if (!projects.has(projectId)) projects.set(projectId, await getProject(projectId));
    const project = projects.get(projectId);
    await TmpModel.create({
      timestamp: Number(t.timestamp) || Date.now(),
      clientVersion: String(t.clientVersion ?? settings.clientVersion),
      scouterId: String(t.scouterId ?? "unknown").slice(0, 64),
      robotNumber,
      matchNumber,
      matchKey: t.matchKey || schedule.find((m) => m.number === matchNumber)?.match_string || null,
      eventNumber,
      projectId,
      projectRevision: t.projectRevision ?? project?.revision,
      matchId: t.matchId || `${matchNumber}-${robotNumber}-${t.scouterId}-${t.matchId_rand}`,
      matchId_rand: String(t.matchId_rand),
      // Snapshot the point map so accuracy stays reproducible if points change later.
      scoringVersion: project?.scoring.version ?? 1,
      scoringRules: normalizePoints(project?.scoring.points),
      flagged: false,
      notes: typeof t.notes === "string" ? t.notes.slice(0, 2000) : undefined,
      actionQueue: t.actionQueue.slice(0, 5000).map((a) => ({ id: String(a.id), ts: Number(a.ts) || 0, ...(a.other ? { other: a.other } : {}) })),
    });
    saved.push(String(t.matchId));
  }
  return json({ saved, duplicates, rejected }, saved.length ? 201 : 200);
});
