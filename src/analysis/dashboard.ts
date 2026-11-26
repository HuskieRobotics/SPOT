/**
 * The analysis dashboard's work in the browser (#383; docs/spec/08 AN-7, AN-9, AN-10, AN-14,
 * AN-15, AN-18a; TR-9): plain TypeScript, so it is tested without a page, and the page only draws.
 *
 * The page fetches an event's performances, its TBA data and its season's three configuration
 * files (#382), then `runAnalysis` builds the enriched dataset, runs the pipeline and lists the
 * teams, as `npm run oracle:compare` does on the recorded events.
 */
import type {
  AnalysisModulesConfig,
  AnalysisPipelineConfig,
  MatchScoutingConfig,
  ModuleEntry,
} from "@/config/types";
import type { TeamKey } from "@/data/team";
import type { PublicPerformance, TbaTeam } from "@/data/types";
import type { Dataset, PipelineProblem, TransformerRegistry } from "./engine";
import { runPipeline } from "./engine";
import { buildEnrichedDataset, type TbaEventData } from "./enrichment/tba";
import { teamList, type ListedTeam } from "./teams";
import { createRegistry } from "./transformers";

export interface AnalysisInputs {
  performances: readonly PublicPerformance[];
  /** The event's TBA data, or null when TBA was never read for it (AN-7, AN-9). */
  tba: (TbaEventData & { teams: readonly TbaTeam[] }) | null;
  pipeline: AnalysisPipelineConfig;
  matchScouting: MatchScoutingConfig;
}

export interface Analysis {
  dataset: Dataset;
  /** What the pipeline could not do, entry by entry (TR-10). */
  problems: PipelineProblem[];
  teams: ListedTeam[];
}

let registry: TransformerRegistry | null = null;

/** Enrich the performances with TBA's results, run the pipeline, and list the teams. */
export function runAnalysis(inputs: AnalysisInputs): Analysis {
  registry ??= createRegistry();
  const enriched = buildEnrichedDataset(
    inputs.performances,
    inputs.pipeline.enrichment.tba,
    inputs.tba,
  );
  const { dataset, problems } = runPipeline(enriched, inputs.pipeline.pipeline, {
    registry,
    context: { config: inputs.matchScouting },
  });
  return { dataset, problems, teams: teamList(inputs.performances, inputs.tba?.teams ?? null) };
}

/** What a team's data says about itself (AN-18a, RT-34, RT-36). */
export interface TeamNotes {
  matches: number;
  /** Records an admin or a rule flagged for review. */
  flagged: number;
  /** Records that cover only part of their match. */
  partial: number;
}

export function teamNotes(performances: readonly PublicPerformance[], team: TeamKey): TeamNotes {
  const own = performances.filter((p) => p.team === team);
  return {
    matches: own.length,
    flagged: own.filter((p) => p.flag.flagged).length,
    partial: own.filter((p) => p.coverage === "partial").length,
  };
}

/**
 * The team view's modules (AN-14, AN-15): the main column, and the side column, which exists only
 * when a module asks for it. Every listed team has data, so v5's rule hiding the modules of a team
 * without any has nothing to hide (document 08, "v6: the dashboard").
 */
export function teamViewModules(modules: AnalysisModulesConfig): {
  main: ModuleEntry[];
  side: ModuleEntry[];
} {
  const team = modules.modules.filter((m) => m.view === "team");
  return {
    main: team.filter((m) => m.position !== "side"),
    side: team.filter((m) => m.position === "side"),
  };
}
