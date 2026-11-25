/**
 * The active season's match-scouting.json for the scouting client (docs/spec/20 CS-17, #359):
 * `GET /api/config/match-scouting` → `{ version, config }`.
 *
 * Read from disk on each request, so a saved change reaches devices on their next online load
 * with no rebuild (OF-8). The version, a hash of the file's text, is the `ETag`, and
 * `Cache-Control: no-cache` makes the browser (and the service worker, #361) ask every time and
 * get 304 when nothing changed. A file with errors is refused with a message naming
 * `config:check`, so devices keep the copy they have rather than scout with a broken one.
 *
 * Not behind the join code: v5 served the same file to anyone, and it holds no secrets.
 */
import { ACTIVE_SEASON, findSeason, loadMatchScouting, readSeason, versionOf } from "@/config/load";
import type { MatchScoutingConfig } from "@/config/types";

export const dynamic = "force-dynamic";

let checked: { version: string; config: MatchScoutingConfig | null; errors: number } | null = null;

/** The file as checked, checking it again only when its text changed. */
function current(): { version: string | null; config: MatchScoutingConfig | null; errors: number } {
  const season = findSeason(ACTIVE_SEASON)!;
  const source = readSeason(season)["match-scouting"];
  if (source === undefined) return { version: null, config: null, errors: 0 };
  const version = versionOf(source);
  if (checked?.version !== version) {
    const loaded = loadMatchScouting(source);
    checked = { version, config: loaded.config, errors: loaded.errors.length };
  }
  return checked;
}

export function GET(request: Request) {
  const { version, config, errors } = current();
  if (version === null)
    return Response.json(
      { error: "config", message: "This server has no config/match-scouting.json." },
      { status: 503 },
    );
  if (!config)
    return Response.json(
      {
        error: "config",
        message: `The scouting configuration has ${errors} ${errors === 1 ? "error" : "errors"}. An admin must fix config/match-scouting.json (npm run config:check lists ${errors === 1 ? "it" : "them"}).`,
      },
      { status: 503 },
    );
  const etag = `"${version}"`;
  const headers = { etag, "cache-control": "no-cache" };
  const sent = request.headers.get("if-none-match");
  if (sent && sent.split(",").some((t) => t.trim().replace(/^W\//, "") === etag))
    return new Response(null, { status: 304, headers });
  return Response.json({ version, config }, { headers });
}
