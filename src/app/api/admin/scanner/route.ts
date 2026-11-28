/**
 * What the QR scanner needs to read codes (#411; AD-19, OF-4), behind the admin session that
 * `src/proxy.ts` checks: every event, with its id and the season that reads it, and each of those
 * seasons' match-scouting.json. The scanner keeps it on the device, so it reads codes offline.
 *
 * GET → `{ events: [{ id, code, season }], seasons: { <season>: config } }`. A season whose file
 * has errors is left out, so its codes are refused rather than read wrongly; `config:check` says
 * what to fix.
 */
import { findSeason, loadMatchScouting, readSeason, versionOf } from "@/config/load";
import type { MatchScoutingConfig } from "@/config/types";
import { getDb } from "@/db/client";
import { adminEvents } from "@/db/events";
import { seasonFor } from "@/public-data";
import { refusalResponse } from "@/lib/refusal";

export const dynamic = "force-dynamic";

const checked = new Map<string, { version: string; config: MatchScoutingConfig | null }>();

/** A season's file as checked, checking it again only when its text changed. */
function configOf(name: string): MatchScoutingConfig | null {
  const season = findSeason(name);
  const source = season && readSeason(season)["match-scouting"];
  if (!source) return null;
  const version = versionOf(source);
  const kept = checked.get(name);
  if (kept?.version === version) return kept.config;
  const config = loadMatchScouting(source).config;
  checked.set(name, { version, config });
  return config;
}

export async function GET() {
  try {
    const events = (await adminEvents(await getDb())).map((e) => ({
      id: e._id,
      code: e.code,
      season: seasonFor(e.tbaKey),
    }));
    const seasons: Record<string, MatchScoutingConfig> = {};
    for (const name of new Set(events.map((e) => e.season))) {
      const config = configOf(name);
      if (config) seasons[name] = config;
    }
    return Response.json({ events, seasons });
  } catch (error) {
    return refusalResponse(error);
  }
}
