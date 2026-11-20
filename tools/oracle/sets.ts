/**
 * The golden sets the v6 engine must reproduce (docs/spec/17 §2, T-4). Each names the legacy
 * input it was produced from and the v2 configuration the engine runs with.
 *
 * Paths are relative to the repository root.
 */
export interface GoldenSet {
  /** Folder under tools/oracle/golden. */
  name: string;
  /** Event code inside the export. */
  event: string;
  /** v5-shaped inputs (mongoexport extended JSON or the generator's legacy shape). */
  performances: string;
  events: string;
  /** v2 configuration folder: match-scouting.json places actions, analysis-pipeline.json runs. */
  configDir: string;
  /** Recorded TBA responses, for sets produced with enrichment on (#315). */
  tbaDir?: string;
}

export const goldenSets: readonly GoldenSet[] = [
  {
    name: "2025ilch_official-v4.2.0",
    event: "2025ilch_official",
    performances: "tools/oracle/fixtures/db/2025Reefscape.teamMatchPerformances.json",
    events: "tools/oracle/fixtures/db/2025Reefscape.events.json",
    configDir: "config/seasons/2025",
  },
  {
    name: "2025syn_synthetic-v4.2.0",
    event: "2025syn_synthetic",
    performances: "tools/oracle/fixtures/synthetic/2025syn.teamMatchPerformances.json",
    events: "tools/oracle/fixtures/synthetic/2025syn.events.json",
    configDir: "config/seasons/2025",
  },
  {
    name: "2026mnwi_official-v5",
    event: "2026mnwi_official",
    performances: "tools/oracle/fixtures/db/2026Rebuilt.teamMatchPerformances.json",
    events: "tools/oracle/fixtures/db/2026Rebuilt.events.json",
    // The active configuration is 2026's until kickoff, when it moves to config/seasons/2026 (#320).
    configDir: "config",
    tbaDir: "tools/oracle/fixtures/tba/2026mnwi",
  },
  {
    name: "2026syn_synthetic-v5",
    event: "2026syn_synthetic",
    performances: "tools/oracle/fixtures/synthetic/2026syn.teamMatchPerformances.json",
    events: "tools/oracle/fixtures/synthetic/2026syn.events.json",
    configDir: "config",
  },
];
