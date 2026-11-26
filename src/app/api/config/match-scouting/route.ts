/**
 * The active season's match-scouting.json for the scouting client (docs/spec/20 CS-17, #359):
 * `GET /api/config/match-scouting` → `{ version, config }`.
 *
 * Read from disk on each request, so a saved change reaches devices on their next online load
 * with no rebuild (OF-8). The version, a hash of the file's text, is the `ETag`, and
 * `Cache-Control: no-cache` makes the browser ask every time and get 304 when nothing changed.
 * The service worker leaves this route to the network; the device keeps its own copy for
 * offline use (#361). A file with errors is refused with a message naming
 * `config:check`, so devices keep the copy they have rather than scout with a broken one.
 *
 * Not behind the join code: v5 served the same file to anyone, and it holds no secrets.
 */
import { loadMatchScouting, readSeason, versionOf, type Season } from "@/config/load";
import { noSeason, requestedSeason, withVersion } from "@/config/serve";
import type { MatchScoutingConfig } from "@/config/types";

export const dynamic = "force-dynamic";

interface Checked {
  version: string | null;
  config: MatchScoutingConfig | null;
  errors: number;
}

const checked = new Map<string, Checked>();

/** The season's file as checked, checking it again only when its text changed. */
function current(season: Season): Checked {
  const source = readSeason(season)["match-scouting"];
  if (source === undefined) return { version: null, config: null, errors: 0 };
  const version = versionOf(source);
  const kept = checked.get(season.name);
  if (kept?.version === version) return kept;
  const loaded = loadMatchScouting(source);
  const result = { version, config: loaded.config, errors: loaded.errors.length };
  checked.set(season.name, result);
  return result;
}

/** `?season=<name>` reads another season's file, for the analysis dashboard (#383). */
export function GET(request: Request) {
  const season = requestedSeason(request);
  if (!season) return noSeason(request);
  const { version, config, errors } = current(season);
  if (version === null)
    return Response.json(
      { error: "config", message: `This server has no ${season.folder}/match-scouting.json.` },
      { status: 503 },
    );
  if (!config)
    return Response.json(
      {
        error: "config",
        message: `The scouting configuration has ${errors} ${errors === 1 ? "error" : "errors"}. An admin must fix ${season.folder}/match-scouting.json (npm run config:check lists ${errors === 1 ? "it" : "them"}).`,
      },
      { status: 503 },
    );
  return withVersion(request, version, { version, config });
}
