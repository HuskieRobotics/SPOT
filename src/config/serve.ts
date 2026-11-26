/**
 * Serving the active season's files to pages that work offline (docs/spec/20 CS-17, OF-8): the
 * scouting client's `match-scouting.json` (#359) and the analysis dashboard's two files (#382).
 * Node only.
 *
 * Each answer carries a version, a hash of the file's text, as its `ETag`, with
 * `Cache-Control: no-cache`, so the browser asks every time and gets 304 when nothing changed.
 *
 * The analysis files are refused only when they cannot be used at all: not JSON, or without their
 * list of entries. Otherwise the file is served with what `config:check` finds in it, without
 * running the pipeline on generated matches (CC-9 to CC-12, which `npm run config:check` does).
 * One bad pipeline entry or module must not take the whole dashboard down: the engine reports
 * and skips a bad entry (TR-10), and the dashboard can show the findings.
 */
import { checkConfiguration } from "./check";
import type { Finding } from "./check/report";
import { ACTIVE_SEASON, findSeason, readSeason, versionOf, type ConfigSources } from "./load";

/** `body` as JSON with `version` as its `ETag`, or 304 when the request already has it. */
export function withVersion(request: Request, version: string, body: unknown): Response {
  const etag = `"${version}"`;
  const headers = { etag, "cache-control": "no-cache" };
  const sent = request.headers.get("if-none-match");
  if (sent && sent.split(",").some((t) => t.trim().replace(/^W\//, "") === etag))
    return new Response(null, { status: 304, headers });
  return Response.json(body, { headers });
}

export type AnalysisFile = "analysis-pipeline" | "analysis-modules";

const LIST: Record<AnalysisFile, string> = {
  "analysis-pipeline": "pipeline",
  "analysis-modules": "modules",
};

export interface ServedFile {
  /** The file's own version: a hash of its text. */
  version: string;
  /** Changes when the file, or a file it is checked against, changes. */
  etag: string;
  /** The file as parsed, or null when it cannot be used (`problem` says why). */
  config: unknown;
  /** What config:check finds in this file, errors and warnings. */
  findings: Finding[];
  problem: string | null;
}

/** Changes when the file, or a file it is checked against, changes. */
function etagOf(kind: AnalysisFile, sources: ConfigSources): string {
  const parts = [kind, sources[kind], sources["match-scouting"], sources["analysis-pipeline"]];
  return versionOf(parts.map((p) => p ?? "").join("\0"));
}

/** A season's analysis file, checked against the season's other files. */
export function checkAnalysisFile(kind: AnalysisFile, sources: ConfigSources): ServedFile | null {
  const source = sources[kind];
  if (source === undefined) return null;
  const etag = etagOf(kind, sources);
  let config: unknown = null;
  let problem: string | null = null;
  try {
    config = JSON.parse(source);
  } catch {
    problem = `config/${kind}.json is not valid JSON.`;
  }
  const list = LIST[kind];
  if (!problem && !Array.isArray((config as Record<string, unknown> | null)?.[list])) {
    problem = `config/${kind}.json has no "${list}" list.`;
  }
  const findings = checkConfiguration(sources, { generated: false }).findings.filter(
    (f) => f.file === kind,
  );
  return { version: versionOf(source), etag, config: problem ? null : config, findings, problem };
}

const checked = new Map<AnalysisFile, ServedFile>();

/** The active season's analysis file, as checked; checked again only when a file changed. */
export function analysisFile(kind: AnalysisFile): ServedFile | null {
  const sources = readSeason(findSeason(ACTIVE_SEASON)!);
  if (sources[kind] === undefined) return null;
  const etag = etagOf(kind, sources);
  const kept = checked.get(kind);
  if (kept?.etag === etag) return kept;
  const served = checkAnalysisFile(kind, sources)!;
  checked.set(kind, served);
  return served;
}

/** The route's answer for an analysis file: `{ version, config, findings }`, or 503. */
export function analysisFileResponse(request: Request, kind: AnalysisFile): Response {
  const file = analysisFile(kind);
  if (!file)
    return Response.json(
      { error: "config", message: `This server has no config/${kind}.json.` },
      { status: 503 },
    );
  if (file.problem)
    return Response.json(
      {
        error: "config",
        message: `${file.problem} An admin must fix it (npm run config:check says where).`,
        findings: file.findings,
      },
      { status: 503 },
    );
  const { version, config, findings } = file;
  return withVersion(request, file.etag, { version, config, findings });
}
