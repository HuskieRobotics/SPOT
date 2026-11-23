import "server-only";
import mongoose from "mongoose";
import type { EventDoc, Match, Project, ProjectInput, Settings } from "../types";
import { connectDb, EventModel, plain, ProjectModel, SettingsModel } from "./db";
import { getServerConfig } from "./env";
import { loadPreset } from "./presets";
import { tbaMatches, toSpotMatches } from "./tba";
import { normalizeProject } from "../project/normalize";

export async function ensureEvent(code: string): Promise<EventDoc> {
  await connectDb();
  // Upsert so concurrent requests can't create the same event twice.
  const ev = await EventModel.findOneAndUpdate({ code }, { $setOnInsert: { code } }, { upsert: true, new: true }).lean();
  return plain<EventDoc>(ev);
}

export async function listEvents(): Promise<EventDoc[]> {
  await connectDb();
  return plain<EventDoc[]>(await EventModel.find().sort({ _id: -1 }).lean());
}

/** Settings stored in Mongo, seeded from env/config.json on first run. */
export async function getSettings(): Promise<Settings> {
  await connectDb();
  const env = getServerConfig();
  let doc: any = await SettingsModel.findById("global").lean();
  if (!doc) {
    let activeEventId: string | null = null;
    if (env.eventNumber && mongoose.isValidObjectId(env.eventNumber) && (await EventModel.exists({ _id: env.eventNumber }))) activeEventId = env.eventNumber;
    else if (env.eventCode) activeEventId = (await ensureEvent(env.eventCode))._id;
    try {
      doc = (
        await SettingsModel.create({
          _id: "global",
          activeProjectId: null,
          activeEventId,
          tbaEventKey: env.tbaEventKey,
          swapZones: env.swapZones,
          startRule: "auto",
          clientVersion: env.clientVersion,
        })
      ).toObject();
    } catch (e) {
      // Another request created it first.
      doc = await SettingsModel.findById("global").lean();
      if (!doc) throw e;
    }
  }
  const settings: Settings = {
    activeProjectId: doc.activeProjectId ?? null,
    activeEventId: doc.activeEventId ?? null,
    tbaEventKey: doc.tbaEventKey ?? env.tbaEventKey,
    swapZones: !!doc.swapZones,
    startRule: doc.startRule === "admin" ? "admin" : "auto",
    clientVersion: doc.clientVersion || env.clientVersion,
  };
  if (!settings.activeProjectId || !(await ProjectModel.exists({ _id: settings.activeProjectId }))) {
    settings.activeProjectId = await seedProjects(settings.tbaEventKey);
    await SettingsModel.updateOne({ _id: "global" }, { activeProjectId: settings.activeProjectId });
  }
  return settings;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  await connectDb();
  await getSettings();
  const allowed: (keyof Settings)[] = ["activeProjectId", "activeEventId", "tbaEventKey", "swapZones", "startRule", "clientVersion"];
  const $set: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) $set[k] = patch[k];
  await SettingsModel.updateOne({ _id: "global" }, { $set });
  return getSettings();
}

/** First run: import the built-in season presets; activate the one matching the event year. */
const seedLock = globalThis as unknown as { __spotSeed?: Promise<string> };
function seedProjects(tbaEventKey: string): Promise<string> {
  // Concurrent first requests share one seeding run.
  seedLock.__spotSeed ??= doSeed(tbaEventKey).finally(() => setTimeout(() => (seedLock.__spotSeed = undefined), 5000));
  return seedLock.__spotSeed;
}
async function doSeed(tbaEventKey: string): Promise<string> {
  const existing: any = await ProjectModel.findOne().sort({ updatedAt: -1 }).lean();
  if (existing) return String(existing._id);
  const ids: Record<string, string> = {};
  for (const id of ["2026", "2025"]) ids[id] = (await createProject(loadPreset(id)))._id;
  const year = tbaEventKey?.slice(0, 4);
  return ids[year] ?? ids["2026"];
}

export async function listProjects(): Promise<Pick<Project, "_id" | "name" | "season" | "description" | "revision" | "updatedAt">[]> {
  await connectDb();
  return plain(await ProjectModel.find({}, { name: 1, season: 1, description: 1, revision: 1, updatedAt: 1 }).sort({ updatedAt: -1 }).lean());
}

export async function getProject(id: string): Promise<Project | null> {
  await connectDb();
  if (!mongoose.isValidObjectId(id)) return null;
  const doc = await ProjectModel.findById(id).lean();
  return doc ? normalizeProject(plain<Project>(doc)) : null;
}

export async function createProject(input: ProjectInput): Promise<Project> {
  await connectDb();
  const p = normalizeProject(input as Project);
  const { _id, createdAt, updatedAt, revision, ...rest } = p as Project;
  const doc = await ProjectModel.create({ ...rest, revision: 1 });
  return normalizeProject(plain<Project>(doc.toObject()));
}

export async function saveProject(id: string, input: ProjectInput): Promise<Project | null> {
  await connectDb();
  const p = normalizeProject(input as Project);
  const { _id, createdAt, updatedAt, revision, ...rest } = p as Project;
  const doc = await ProjectModel.findByIdAndUpdate(id, { $set: rest, $inc: { revision: 1 } }, { new: true }).lean();
  return doc ? normalizeProject(plain<Project>(doc)) : null;
}

export async function deleteProject(id: string) {
  await connectDb();
  await ProjectModel.deleteOne({ _id: id });
}

export async function getActiveProject(): Promise<Project> {
  const s = await getSettings();
  return (await getProject(s.activeProjectId!))!;
}

/** Current schedule: manual schedule if one was entered, else TBA. */
export async function getSchedule(tbaEventKey?: string): Promise<Match[]> {
  await connectDb();
  const doc: any = await SettingsModel.findById("global", { manualSchedule: 1, tbaEventKey: 1 }).lean();
  if (!tbaEventKey && Array.isArray(doc?.manualSchedule) && doc.manualSchedule.length) return doc.manualSchedule;
  return toSpotMatches(await tbaMatches(tbaEventKey ?? doc?.tbaEventKey ?? getServerConfig().tbaEventKey));
}

export async function setManualSchedule(matches: Match[]) {
  await connectDb();
  await SettingsModel.updateOne({ _id: "global" }, { $set: { manualSchedule: matches } });
}

export async function getManualSchedule(): Promise<Match[]> {
  await connectDb();
  const doc: any = await SettingsModel.findById("global", { manualSchedule: 1 }).lean();
  return doc?.manualSchedule ?? [];
}

/** TBA key for an event doc: code is "<tbaKey>_<label>". */
export const tbaKeyForEvent = (ev: EventDoc | null | undefined, fallback: string) => (ev?.code ? ev.code.split("_")[0] : fallback);
