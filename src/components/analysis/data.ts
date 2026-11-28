/**
 * What the analysis dashboard fetches (#383): the events, and for one event its performances, its
 * TBA data, its season's three configuration files (#382) and its schedule (#389), turned into the
 * analysis by `runAnalysis` in the browser (TR-9). Every request has a timeout (OF-7).
 *
 * Offline (#390; docs/spec/18 OF-3, OF-5, OF-7): the network is always asked first, so an edit is
 * never hidden by an old copy. What it answers is kept on the device (`kept.ts`), the list of
 * events and each event viewed; when the network can't answer, the kept copy is shown, and the
 * page says so and from when. An event never viewed on the device fails with a message.
 */
import { runAnalysis, type Analysis } from "@/analysis/dashboard";
import type { Finding } from "@/config/check/report";
import type {
  AnalysisModulesConfig,
  AnalysisPipelineConfig,
  MatchScoutingConfig,
} from "@/config/types";
import type { PublicPerformance } from "@/data/types";
import type { EventSummary } from "@/public-data";
import { withUnsent, type ScannedRecord } from "@/scanner/scan";
import { unsentScans } from "@/scanner/store";
import { call, type Reply } from "@/scouter/api";
import type { EventInputs, KeptStore, ScheduleMatch, TbaInput } from "./kept";

export type { ScheduleMatch } from "./kept";

/** TBA's route reads TBA itself when its copy is old, three requests of up to 10 s each. */
const TBA_TIMEOUT_MS = 35_000;

/** A kept copy shown in place of the server's answer. */
export interface Kept {
  /** When the copy was read from the server, epoch milliseconds. */
  savedAt: number;
  /** Why the server's answer is not shown: null for no connection, else the server's message. */
  reason: string | null;
}

export interface LoadedEvent {
  event: EventSummary;
  performances: PublicPerformance[];
  analysis: Analysis;
  modules: AnalysisModulesConfig;
  matchScouting: MatchScoutingConfig;
  /** What config:check finds in the season's two analysis files. */
  findings: Finding[];
  tba: { error: string | null; fetchedAt: number | null };
  /** The event's matches, for Simulate Match; null when they could not be read. */
  schedule: ScheduleMatch[] | null;
  /** Set when this is a copy kept on the device (OF-3). */
  kept: Kept | null;
  /** Records this device scanned from QR codes and has not sent yet, shown with the rest (AN-8). */
  unsent: number;
}

export type Loaded<T> = { ok: true; value: T } | { ok: false; message: string };

type Failure = Exclude<Reply<unknown>, { ok: true }>;

function failure(reply: Failure, what: string): string {
  return reply.offline
    ? `No connection: ${what} could not be loaded.`
    : `${what} could not be loaded. ${reply.message}`;
}

/** Store a copy, never failing the page: a full or refused store only loses the copy. */
async function keep(write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch {
    // Nothing kept this time.
  }
}

/** The events, from the server, else as kept (OF-3). */
export async function loadEvents(
  store: KeptStore,
): Promise<Loaded<{ events: EventSummary[]; kept: Kept | null }>> {
  const reply = await call<{ events: EventSummary[] }>("/api/analysis/events");
  if (reply.ok) {
    await keep(() => store.putEvents({ savedAt: Date.now(), events: reply.value.events }));
    return { ok: true, value: { events: reply.value.events, kept: null } };
  }
  const copy = await store.events().catch(() => null);
  if (copy)
    return {
      ok: true,
      value: {
        events: copy.events,
        kept: { savedAt: copy.savedAt, reason: reply.offline ? null : reply.message },
      },
    };
  return { ok: false, message: failure(reply, "The list of events") };
}

interface ConfigReply<T> {
  version: string;
  config: T;
  findings?: Finding[];
}

interface TbaReply {
  tba: TbaInput | null;
  error: string | null;
}

type Fetched =
  | {
      ok: true;
      inputs: Omit<EventInputs, "tba" | "schedule">;
      tba: Reply<TbaReply>;
      schedule: Reply<{ matches: ScheduleMatch[] }>;
    }
  | { ok: false; reply: Failure; message: string };

/**
 * An event's inputs from the server. TBA's data and the schedule may fail on their own: the
 * dashboard works without them, with the kept ones if any (AN-7, AN-9).
 */
async function fetchInputs(event: EventSummary): Promise<Fetched> {
  const e = `?event=${encodeURIComponent(event.code)}`;
  const s = `?season=${encodeURIComponent(event.season)}`;
  const [dataset, tba, matchScouting, pipeline, modules, schedule] = await Promise.all([
    call<{ performances: PublicPerformance[] }>(`/api/analysis/dataset${e}`),
    call<TbaReply>(`/api/analysis/tba${e}`, { timeoutMs: TBA_TIMEOUT_MS }),
    call<ConfigReply<MatchScoutingConfig>>(`/api/config/match-scouting${s}`),
    call<ConfigReply<AnalysisPipelineConfig>>(`/api/config/analysis-pipeline${s}`),
    call<ConfigReply<AnalysisModulesConfig>>(`/api/config/analysis-modules${s}`),
    call<{ matches: ScheduleMatch[] }>(`/api/analysis/schedule${e}`),
  ]);
  if (!dataset.ok)
    return { ok: false, reply: dataset, message: failure(dataset, `${event.code}'s data`) };
  const file = (name: string) => `The season's ${name}`;
  if (!matchScouting.ok)
    return {
      ok: false,
      reply: matchScouting,
      message: failure(matchScouting, file("match-scouting.json")),
    };
  if (!pipeline.ok)
    return {
      ok: false,
      reply: pipeline,
      message: failure(pipeline, file("analysis-pipeline.json")),
    };
  if (!modules.ok)
    return { ok: false, reply: modules, message: failure(modules, file("analysis-modules.json")) };
  return {
    ok: true,
    inputs: {
      performances: dataset.value.performances,
      matchScouting: matchScouting.value.config,
      pipeline: pipeline.value.config,
      modules: modules.value.config,
      findings: [...(pipeline.value.findings ?? []), ...(modules.value.findings ?? [])],
    },
    tba,
    schedule,
  };
}

/** The dashboard's view of an event from its inputs: the pipeline runs here (TR-9). */
function build(
  event: EventSummary,
  given: EventInputs,
  tbaError: string | null,
  kept: Kept | null,
  scans: readonly ScannedRecord[],
): Loaded<LoadedEvent> {
  // AN-8 (#411): the matches this device scanned and has not sent count as if the server had them.
  const { performances, added } = withUnsent(given.performances, scans);
  const inputs = { ...given, performances };
  let analysis: Analysis;
  try {
    analysis = runAnalysis({
      performances: inputs.performances,
      tba: inputs.tba,
      pipeline: inputs.pipeline,
      matchScouting: inputs.matchScouting,
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
      performances: inputs.performances,
      analysis,
      modules: inputs.modules,
      matchScouting: inputs.matchScouting,
      findings: inputs.findings,
      tba: { error: tbaError, fetchedAt: inputs.tba?.fetchedAt ?? null },
      schedule: inputs.schedule,
      kept,
      unsent: added,
    },
  };
}

/** One event: from the server, kept on the device; else the kept copy, saying so (OF-3). */
export async function loadEvent(
  event: EventSummary,
  store: KeptStore,
  scanned: (eventCode: string) => Promise<ScannedRecord[]> = unsentScans,
): Promise<Loaded<LoadedEvent>> {
  const [fetched, copy, scans] = await Promise.all([
    fetchInputs(event),
    store.event(event.code).catch(() => null),
    scanned(event.code).catch(() => []),
  ]);
  if (!fetched.ok) {
    if (!copy)
      return {
        ok: false,
        message: fetched.reply.offline
          ? `No connection, and ${event.code} has not been opened on this device while online, so there is no copy of it here.`
          : fetched.message,
      };
    return build(
      copy.summary,
      copy.inputs,
      copy.inputs.tba ? null : "TBA's data is not on this device.",
      { savedAt: copy.savedAt, reason: fetched.reply.offline ? null : fetched.message },
      scans,
    );
  }
  // TBA's data and the schedule from the server, else the kept ones.
  const { tba, schedule } = fetched;
  const inputs: EventInputs = {
    ...fetched.inputs,
    tba: tba.ok ? tba.value.tba : (copy?.inputs.tba ?? null),
    schedule: schedule.ok ? schedule.value.matches : (copy?.inputs.schedule ?? null),
  };
  await keep(() =>
    store.putEvent({ code: event.code, savedAt: Date.now(), summary: event, inputs }),
  );
  return build(event, inputs, tba.ok ? tba.value.error : failure(tba, "TBA's data"), null, scans);
}
