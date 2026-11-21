/**
 * The translation table for a golden set whose legacy configuration recorded composite ids: 2026
 * (#320, CS-16, docs/spec/20 §2.2 item 5). It says where v6 keeps each legacy output value.
 *
 * Generated from the set's own v2 configuration, never written by hand: the prefixes in
 * match-scouting.json (the table the migration splits recorded ids with), the score-breakdown
 * prefixes, and the pipeline's counts grouped by period. The converter rewrites the configuration
 * with the same functions (src/config/convert/native.ts), so the two cannot disagree.
 *
 * - A legacy count of a composite id is under its period: `counts.activeShift1Defense` is
 *   `counts.active1.Defense`, and `averages.autoPassing` is `averages.auto.Passing`.
 * - A TBA score-breakdown count is under its phase: `counts.endgame.endGameTowerRobot_Level3`.
 * - An id without a prefix was recorded before the match, or only started at 0 by v5: its count
 *   is under `preMatch`.
 * - An action copied into an output keeps its button id: `starts.id` `activeShift1StartShooting`
 *   is `StartShooting`, with the period in fields legacy did not have.
 */
import { actionButtonIds } from "../../src/config/knownActionIds";
import {
  countRoots,
  nativeCountPath,
  nativeIds,
  usesPrefixes,
} from "../../src/config/convert/native";
import type { AnalysisPipelineConfig, MatchScoutingConfig } from "../../src/config/types";

export interface Translation {
  mapLegacyPath(scope: "tmp" | "team", path: string): string | null;
  mapLegacyValue(scope: "tmp" | "team", path: string, value: unknown): unknown;
}

/** The translation for a configuration, or null when it records no composite ids (2025). */
export function translationFor(
  config: MatchScoutingConfig,
  pipeline: AnalysisPipelineConfig,
): Translation | null {
  if (!usesPrefixes(config)) return null;
  // v5 started every layout button at 0, whatever its type, and the catalog ids it could not
  // derive are extraActionIds; none of them has a prefix of its own.
  const layoutIds = config.layout.layers.flatMap((l) => l.buttons.map((b) => b.id));
  const ids = nativeIds(config, pipeline.enrichment.tba.scoreBreakdown.prefixes, [
    ...layoutIds,
    ...actionButtonIds(config),
    ...config.extraActionIds,
  ]);
  const roots = {
    tmp: countRoots(pipeline.pipeline, "tmp"),
    team: countRoots(pipeline.pipeline, "team"),
  };
  return {
    mapLegacyPath: (scope, path) => nativeCountPath(ids, roots[scope], path),
    mapLegacyValue: (_scope, path, value) =>
      typeof value === "string" && (path === "id" || path.endsWith(".id"))
        ? (ids.split(value)?.button ?? value)
        : value,
  };
}
