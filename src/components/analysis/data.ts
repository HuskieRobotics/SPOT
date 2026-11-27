/**
 * What the analysis dashboard fetches (#383): the events, and for one event its performances, its
 * TBA data and its season's three configuration files (#382), turned into the analysis by
 * `runAnalysis` in the browser (TR-9). Every request has a timeout (OF-7).
 */
import { runAnalysis, type Analysis } from "@/analysis/dashboard";
import type { Finding } from "@/config/check/report";
import type {
  AnalysisModulesConfig,
  AnalysisPipelineConfig,
  MatchScoutingConfig,
} from "@/config/types";
import type { PublicPerformance, TbaData } from "@/data/types";
import type { EventSummary } from "@/public-data";
import { call, type Reply } from "@/scouter/api";

/** TBA's route reads TBA itself when its copy is old, three requests of up to 10 s each. */
const TBA_TIMEOUT_MS = 35_000;

export interface LoadedEvent {
  event: EventSummary;
  performances: PublicPerformance[];
  analysis: Analysis;
  modules: AnalysisModulesConfig;
  matchScouting: MatchScoutingConfig;
  /** What config:check finds in the season's two analysis files. */
  findings: Finding[];
  tba: { error: string | null; fetchedAt: number | null };
}

export type Loaded<T> = { ok: true; value: T } | { ok: false; message: string };

function failure(reply: Exclude<Reply<unknown>, { ok: true }>, what: string): string {
  return reply.offline
    ? `No connection: ${what} could not be loaded.`
    : `${what} could not be loaded. ${reply.message}`;
}

export async function loadEvents(): Promise<Loaded<EventSummary[]>> {
  const reply = await call<{ events: EventSummary[] }>("/api/analysis/events");
  return reply.ok
    ? { ok: true, value: reply.value.events }
    : { ok: false, message: failure(reply, "The list of events") };
}

interface ConfigReply<T> {
  version: string;
  config: T;
  findings?: Finding[];
}

export async function loadEvent(event: EventSummary): Promise<Loaded<LoadedEvent>> {
  const e = `?event=${encodeURIComponent(event.code)}`;
  const s = `?season=${encodeURIComponent(event.season)}`;
  const [dataset, tba, matchScouting, pipeline, modules] = await Promise.all([
    call<{ performances: PublicPerformance[] }>(`/api/analysis/dataset${e}`),
    call<{
      tba: Pick<TbaData, "matches" | "coprs" | "teams" | "fetchedAt"> | null;
      error: string | null;
    }>(`/api/analysis/tba${e}`, { timeoutMs: TBA_TIMEOUT_MS }),
    call<ConfigReply<MatchScoutingConfig>>(`/api/config/match-scouting${s}`),
    call<ConfigReply<AnalysisPipelineConfig>>(`/api/config/analysis-pipeline${s}`),
    call<ConfigReply<AnalysisModulesConfig>>(`/api/config/analysis-modules${s}`),
  ]);
  if (!dataset.ok) return { ok: false, message: failure(dataset, `${event.code}'s data`) };
  const file = (name: string) => `The season's ${name}`;
  if (!matchScouting.ok)
    return { ok: false, message: failure(matchScouting, file("match-scouting.json")) };
  if (!pipeline.ok)
    return { ok: false, message: failure(pipeline, file("analysis-pipeline.json")) };
  if (!modules.ok) return { ok: false, message: failure(modules, file("analysis-modules.json")) };

  // Without TBA the dashboard still works, with fewer values (AN-7, AN-9).
  const tbaData = tba.ok ? tba.value.tba : null;
  const tbaError = tba.ok ? tba.value.error : failure(tba, "TBA's data");
  let analysis: Analysis;
  try {
    analysis = runAnalysis({
      performances: dataset.value.performances,
      tba: tbaData,
      pipeline: pipeline.value.config,
      matchScouting: matchScouting.value.config,
    });
  } catch (error) {
    return {
      ok: false,
      message: `The analysis could not run on ${event.code}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return {
    ok: true,
    value: {
      event,
      performances: dataset.value.performances,
      analysis,
      modules: modules.value.config,
      matchScouting: matchScouting.value.config,
      findings: [...(pipeline.value.findings ?? []), ...(modules.value.findings ?? [])],
      tba: { error: tbaError, fetchedAt: tbaData?.fetchedAt ?? null },
    },
  };
}
