import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Server configuration from environment variables and/or config/config.json.
 * Environment variables win. The legacy config.json shape ({ secrets: {...}, TBA_EVENT_KEY, ... })
 * is accepted unchanged, so existing SPOT installs keep working.
 */
export interface ServerConfig {
  databaseUrl: string;
  accessCode: string;
  tbaApiKey: string;
  tbaEventKey: string;
  eventCode: string;
  /** Legacy: ObjectId of the active event (config.json EVENT_NUMBER). */
  eventNumber: string;
  swapZones: boolean;
  oprStrings: string[];
  demo: boolean;
  clientVersion: string;
  sessionSecret: string;
  source: { env: string[]; file: string | null };
}

const truthy = (v: unknown) => v === true || v === "true" || v === "on" || v === "1";

function readConfigFile(): { data: Record<string, any>; file: string | null } {
  const candidates = [process.env.CONFIG_PATH, path.join(process.cwd(), "config", "config.json")].filter(Boolean) as string[];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return { data: JSON.parse(fs.readFileSync(file, "utf8")), file };
    } catch (e) {
      console.error(`SPOT: could not parse ${file}:`, e);
    }
  }
  return { data: {}, file: null };
}

function parseOpr(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).map(String).filter((s) => s && s !== "None");
  const s = String(v).trim();
  if (s.startsWith("[") || s.startsWith("{")) {
    try {
      return parseOpr(JSON.parse(s));
    } catch {
      /* fall through */
    }
  }
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

let cached: ServerConfig | null = null;

export function getServerConfig(): ServerConfig {
  if (cached) return cached;
  const { data, file } = readConfigFile();
  const secrets = data.secrets ?? {};
  const usedEnv: string[] = [];
  const pick = (envNames: string[], fileValue: unknown, fallback = ""): string => {
    for (const n of envNames) {
      const v = process.env[n];
      if (v !== undefined && v !== "") {
        usedEnv.push(n);
        return v;
      }
    }
    return fileValue === undefined || fileValue === null ? fallback : String(fileValue);
  };

  const tbaEventKey = pick(["TBA_EVENT_KEY"], data.TBA_EVENT_KEY);
  const accessCode = pick(["ACCESS_CODE"], secrets.ACCESS_CODE);
  cached = {
    databaseUrl: pick(["DATABASE_URL", "MONGODB_URI"], secrets.DATABASE_URL ?? data.DATABASE_URL),
    accessCode,
    tbaApiKey: pick(["TBA_API_KEY"], secrets.TBA_API_KEY),
    tbaEventKey,
    eventCode: pick(["EVENT_CODE"], data.EVENT_CODE, tbaEventKey ? `${tbaEventKey}_official` : ""),
    eventNumber: pick(["EVENT_NUMBER"], data.EVENT_NUMBER),
    swapZones: truthy(pick(["SWAP_ZONE_BUTTON_LOCATIONS"], data.SWAP_ZONE_BUTTON_LOCATIONS, "false")),
    oprStrings: parseOpr(process.env.TBA_OPR_STRINGS ?? data.TBA_OPR_STRINGS),
    demo: truthy(pick(["DEMO"], data.DEMO, "false")),
    clientVersion: pick(["CLIENT_VERSION"], data.VERSION, "6.0"),
    sessionSecret: pick(["SESSION_SECRET"], secrets.SESSION_SECRET, "") || crypto.createHash("sha256").update(`spot-session:${accessCode}:${file ?? ""}`).digest("hex"),
    source: { env: usedEnv, file },
  };
  if (!cached.databaseUrl) console.warn("SPOT: DATABASE_URL is not set (env or config/config.json). The app cannot store data.");
  if (!cached.tbaApiKey) console.warn("SPOT: TBA_API_KEY is not set; schedules, team names and OPRs will be unavailable.");
  return cached;
}
