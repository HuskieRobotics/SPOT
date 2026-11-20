/**
 * Run a season's pipeline on generated matches (T-4, docs/spec/22): what config:check (#317,
 * docs/spec/20 §4 CC-9 to CC-12) and config:preview (#318, gate K-3) both do before any real match
 * exists. The generator plays matches by the rules of match-scouting.json, with idle robots whose
 * scouts record nothing, and TBA data is made up from the configured `knownIds` and
 * `componentOprs` so entries that read enrichment results have something to work on.
 *
 * Pure: no file access, so a page can run it as well as the CLIs.
 */
import { buildEnrichedDataset, type TbaEnrichment } from "@/analysis/enrichment/tba";
import { runPipeline, type Dataset, type RunOptions, type RunResult } from "@/analysis/engine";
import type { TransformerRegistry } from "@/analysis/engine";
import type { TeamKey } from "@/data/team";
import type { TeamMatchPerformance } from "@/data/types";
import { generate } from "@/generate/synthetic";
import { generateTba } from "@/generate/synthetic-tba";
import type { MatchScoutingConfig, PipelineEntry } from "./types";

/** The robot whose scouts record nothing: a team that never did anything. */
export const IDLE_TEAM: TeamKey = "9999";

/** Enrichment that adds nothing, for a pipeline file whose enrichment section is invalid. */
export const NO_ENRICHMENT: TbaEnrichment = {
  scoreBreakdown: { enabled: false, prefixes: [], knownIds: [] },
  componentOprs: [],
};

export interface SimulateOptions {
  ms: MatchScoutingConfig;
  entries: readonly PipelineEntry[];
  enrichment: TbaEnrichment;
  registry: TransformerRegistry;
  seed: string | number;
  matches: number;
  /** Robots that never do anything; default one, `IDLE_TEAM`. */
  idleTeams?: TeamKey[];
  beforeEntry?: RunOptions["beforeEntry"];
  afterEntry?: RunOptions["afterEntry"];
}

/** What the generated event was. */
export interface GeneratedSummary {
  matches: number;
  performances: number;
  teams: number;
}

export interface Simulation extends RunResult {
  performances: TeamMatchPerformance[];
  idleTeams: TeamKey[];
  generated: GeneratedSummary;
}

export function simulate(options: SimulateOptions): Simulation {
  const { ms, entries, enrichment, registry, seed, matches } = options;
  const idleTeams = options.idleTeams ?? [IDLE_TEAM];
  const { performances, report } = generate({ config: ms, seed, matches, idleTeams });
  const tba =
    enrichment.scoreBreakdown.enabled || enrichment.componentOprs.length > 0
      ? generateTba(performances, { enrichment, seed, idleTeams })
      : null;
  const dataset: Dataset = buildEnrichedDataset(performances, enrichment, tba);
  const result = runPipeline(dataset, entries, {
    registry,
    context: { config: ms },
    beforeEntry: options.beforeEntry,
    afterEntry: options.afterEntry,
  });
  return {
    ...result,
    performances,
    idleTeams,
    generated: {
      matches: report.matches,
      performances: result.dataset.tmps.length,
      teams: Object.keys(result.dataset.teams).length,
    },
  };
}

// ---------------------------------------------------------------------------- reading values

/** The value at a dot path, without telling `observePathReads`. */
export function valueAt(obj: unknown, path: string): unknown {
  let current = obj;
  for (const key of path === "" ? [] : path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** How a value holds nothing, or null when it holds something. */
export type Nothing = "0" | "null" | "empty" | "false";

export function nothingIn(v: unknown): Nothing | null {
  if (v === null || v === undefined) return "null";
  if (v === 0) return "0";
  if (v === false) return "false";
  if (v === "") return "empty";
  if (Array.isArray(v)) return v.length === 0 ? "empty" : null;
  if (typeof v === "object") return Object.keys(v).length === 0 ? "empty" : null;
  return null;
}

/** Visit every leaf of a value: numbers, strings, lists, and empty objects. */
export function eachLeaf(
  value: unknown,
  suffix: string,
  visit: (suffix: string, v: unknown) => void,
): void {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length > 0) {
      for (const k of keys) {
        eachLeaf((value as Record<string, unknown>)[k], suffix ? `${suffix}.${k}` : k, visit);
      }
      return;
    }
  }
  visit(suffix, value);
}
