import type { Dataset } from "@/analysis/engine";
import type { ModuleEntry } from "@/config/types";
import type { TeamKey } from "@/data/team";

/** What every module is given (docs/spec/09 MO-1): its entry, the teams shown, the dataset. */
export interface ModuleProps {
  module: ModuleEntry;
  /** One team in the team view; an alliance in Simulate Match (#389). */
  teams: readonly TeamKey[];
  dataset: Dataset;
}
