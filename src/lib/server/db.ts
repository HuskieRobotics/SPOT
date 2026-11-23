import "server-only";
import mongoose, { Schema } from "mongoose";
import { getServerConfig } from "./env";

/** One cached connection per process (survives Next.js dev hot reloads). */
const g = globalThis as unknown as { __spotMongo?: Promise<typeof mongoose> };

export async function connectDb() {
  if (!g.__spotMongo) {
    const url = getServerConfig().databaseUrl;
    if (!url) throw new Error("DATABASE_URL is not configured. Set it in .env.local or config/config.json.");
    g.__spotMongo = mongoose.connect(url, { serverSelectionTimeoutMS: 8000 }).catch((e) => {
      g.__spotMongo = undefined;
      throw e;
    });
  }
  return g.__spotMongo;
}

const actionSchema = new Schema({ id: String, ts: Number, other: Schema.Types.Mixed }, { _id: false });

const tmpSchema = new Schema(
  {
    timestamp: Number,
    clientVersion: String,
    scouterId: String,
    robotNumber: Number,
    matchNumber: Number,
    matchKey: String,
    eventNumber: Schema.Types.ObjectId,
    projectId: String,
    projectRevision: Number,
    matchId: { type: String, index: true },
    matchId_rand: { type: String, index: true },
    scoringVersion: Number,
    scoringRules: Schema.Types.Mixed,
    flagged: { type: Boolean, default: false },
    flagReason: String,
    notes: String,
    actionQueue: [actionSchema],
  },
  { collection: "teamMatchPerformances" },
);
tmpSchema.index({ eventNumber: 1, matchNumber: 1, robotNumber: 1 });

const eventSchema = new Schema({ code: String }, { collection: "events" });

const projectSchema = new Schema(
  {
    name: String,
    description: String,
    season: String,
    revision: { type: Number, default: 1 },
    scouting: Schema.Types.Mixed,
    scoring: Schema.Types.Mixed,
    pipeline: Schema.Types.Mixed,
    modules: Schema.Types.Mixed,
    analysis: Schema.Types.Mixed,
  },
  { collection: "projects", timestamps: true, minimize: false },
);

const fieldMapSchema = new Schema(
  {
    name: String,
    kind: String,
    ref: String,
    contentType: String,
    data: Buffer,
  },
  { collection: "fieldMaps", timestamps: true },
);

const settingsSchema = new Schema(
  {
    _id: { type: String, default: "global" },
    activeProjectId: String,
    activeEventId: String,
    tbaEventKey: String,
    swapZones: Boolean,
    startRule: String,
    clientVersion: String,
    manualSchedule: Schema.Types.Mixed,
    fieldMapsSeeded: Boolean,
  },
  { collection: "settings", minimize: false },
);

const model = <T>(name: string, schema: Schema) => (mongoose.models[name] as mongoose.Model<T>) || mongoose.model<T>(name, schema);

export const TmpModel = model<any>("TeamMatchPerformance", tmpSchema);
export const EventModel = model<any>("Event", eventSchema);
export const ProjectModel = model<any>("Project", projectSchema);
export const FieldMapModel = model<any>("FieldMap", fieldMapSchema);
export const SettingsModel = model<any>("Settings", settingsSchema);

/** Convert lean Mongo docs to plain JSON (ObjectIds → strings, dates → ISO). */
export function plain<T>(doc: unknown): T {
  return JSON.parse(JSON.stringify(doc));
}
