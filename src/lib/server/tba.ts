import "server-only";
import type { Match } from "../types";
import type { TbaData, TbaMatch } from "../analysis/pipeline";
import { getServerConfig } from "./env";

/** The Blue Alliance client with a 5-minute cache keyed by request (fixes legacy cross-event cache). */
const TTL = 5 * 60 * 1000;
const g = globalThis as unknown as { __spotTba?: Map<string, { at: number; data: unknown }> };
const cache = (g.__spotTba ??= new Map());

async function tbaGet<T>(path: string, fallback: T): Promise<T> {
  const key = getServerConfig().tbaApiKey;
  if (!key) return fallback;
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  try {
    const res = await fetch(`https://www.thebluealliance.com/api/v3${path}`, { headers: { "X-TBA-Auth-Key": key }, cache: "no-store" });
    if (!res.ok) throw new Error(`TBA ${res.status}`);
    const data = (await res.json()) as T;
    cache.set(path, { at: Date.now(), data });
    return data ?? fallback;
  } catch (e) {
    console.warn(`SPOT: TBA request ${path} failed:`, (e as Error).message);
    return (hit?.data as T) ?? fallback;
  }
}

export const tbaMatches = (eventKey: string) => (eventKey ? tbaGet<TbaMatch[]>(`/event/${eventKey}/matches`, []) : Promise.resolve([]));
export const tbaTeams = (eventKey: string) =>
  eventKey ? tbaGet<{ team_number: number; nickname: string }[]>(`/event/${eventKey}/teams/simple`, []) : Promise.resolve([]);
export const tbaCoprs = (eventKey: string) => (eventKey ? tbaGet<Record<string, Record<string, number>>>(`/event/${eventKey}/coprs`, {}) : Promise.resolve({}));

export async function tbaBundle(eventKey: string): Promise<TbaData> {
  const [matches, teams, coprs] = await Promise.all([tbaMatches(eventKey), tbaTeams(eventKey), tbaCoprs(eventKey)]);
  return { matches, teams, coprs };
}

const LEVELS = ["qm", "ef", "qf", "sf", "f"];

/** TBA matches → SPOT linear match numbers (quals keep their number; playoffs follow). */
export function toSpotMatches(matches: TbaMatch[]): Match[] {
  const counts = Object.fromEntries(LEVELS.map((l) => [l, matches.filter((m) => m.comp_level === l).length]));
  const offset: Record<string, number> = {};
  LEVELS.forEach((l, i) => (offset[l] = LEVELS.slice(0, i).reduce((a, p) => a + counts[p], 0)));
  const levelIndex = (m: TbaMatch) => LEVELS.indexOf(m.comp_level);
  const sorted = [...matches].sort((a, b) => levelIndex(a) - levelIndex(b) || (a as any).set_number - (b as any).set_number || a.match_number - b.match_number);
  // Playoff match_numbers repeat per set, so number playoffs sequentially within each level.
  const seq: Record<string, number> = {};
  return sorted
    .map((m) => {
      const n = m.comp_level === "qm" ? m.match_number : offset[m.comp_level] + (seq[m.comp_level] = (seq[m.comp_level] ?? 0) + 1);
      return {
        number: n,
        match_string: m.key,
        robots: {
          red: m.alliances.red.team_keys.map((k) => k.replace(/^frc/, "")),
          blue: m.alliances.blue.team_keys.map((k) => k.replace(/^frc/, "")),
        },
      };
    })
    .sort((a, b) => a.number - b.number);
}
