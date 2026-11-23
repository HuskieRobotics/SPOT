import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { ProjectInput } from "../types";
import { projectFromLegacy } from "../project/legacy";
import { blankProject } from "../project/defaults";

export interface PresetInfo {
  id: string;
  name: string;
  season: string;
  description: string;
}

const PRESETS: (PresetInfo & { tbaBreakdown?: boolean; features?: Partial<ProjectInput["analysis"]["features"]> })[] = [
  { id: "blank", name: "Blank project", season: "", description: "A minimal starting layout: pre-match, auto and teleop layers with score/miss buttons." },
  {
    id: "2026",
    name: "2026 REBUILT",
    season: "2026",
    description: "Hub shifts, A-Stop lock, alliance zones, zone→action→rating triplets, TBA climb enrichment, radar chart and shooting heatmap.",
    tbaBreakdown: true,
    features: { simulateMatch: false, pickList: false },
  },
  { id: "2025", name: "2025 REEFSCAPE", season: "2025", description: "Coral/algae counting with point values, cycle times, standard deviation, match simulation and pick list." },
  { id: "2024", name: "2024 CRESCENDO", season: "2024", description: "Speaker/amp scoring, action timing, ratios and match prediction." },
  { id: "2023", name: "2023 CHARGED UP", season: "2023", description: "Conditional layers driven by variables (held cone/cube), grid placement heatmaps." },
  { id: "2022", name: "2022 RAPID REACT", season: "2022", description: "Shot positions on the field map, hide executables, climb levels via map/threshold." },
];

export const listPresets = (): PresetInfo[] => PRESETS.map(({ id, name, season, description }) => ({ id, name, season, description }));

function readJson(dir: string, file: string) {
  const p = path.join(process.cwd(), "presets", dir, file);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

export function loadPreset(id: string): ProjectInput {
  const p = PRESETS.find((x) => x.id === id);
  if (!p || id === "blank") return blankProject();
  return projectFromLegacy({
    name: p.name,
    season: p.season,
    description: p.description,
    matchScouting: readJson(id, "match-scouting.json"),
    pipeline: readJson(id, "analysis-pipeline.json") ?? [],
    modules: readJson(id, "analysis-modules.json") ?? [],
    scoring: readJson(id, "scoring.json"),
    tbaBreakdown: p.tbaBreakdown,
    features: p.features,
  });
}
