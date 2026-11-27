import type { Dataset } from "@/analysis/engine";
import type { MatchScoutingConfig, ModuleEntry } from "@/config/types";
import type { TeamKey } from "@/data/team";

/**
 * What every module is given (docs/spec/09 MO-1): its entry, the teams shown, the dataset, and
 * the season's match-scouting configuration (the heatmap's period filters read its kinds).
 */
export interface ModuleProps {
  module: ModuleEntry;
  /** One team in the team view; an alliance in Simulate Match (#389). */
  teams: readonly TeamKey[];
  dataset: Dataset;
  matchScouting: MatchScoutingConfig;
}
