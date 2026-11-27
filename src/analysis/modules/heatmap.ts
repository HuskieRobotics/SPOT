/**
 * What the heatmap draws (#386; docs/spec/09 HeatmapScatterPlot, A-20, SC-28, SC-32): where on
 * the field the teams' actions happened, from the positions scouters tapped.
 *
 * A position is stored as percentages of the field picture, x from the left and y from the top,
 * and always the same way round: a tap on a turned map is stored turned back (SC-28). So the
 * module draws positions as stored, unless `coordinateTransform` folds them (A-20).
 *
 * Nothing here changes the teams or the dataset it is given (F-18).
 */
import type { Dataset } from "../engine";
import { getPath } from "../engine";
import { passesFilter, type PeriodFilter } from "../transformers/periods";
import type { MatchScoutingConfig } from "@/config/types";
import type { TeamKey } from "@/data/team";

export type CoordinateTransform = "none" | "foldHalfField";

export interface Point {
  x: number;
  y: number;
}

export interface ActionGroup extends PeriodFilter {
  name: string;
  actions: string[];
}

export interface HeatmapOptions {
  coordinatePath: string;
  aggregatedActionsPath: string;
  actionGroups: ActionGroup[];
  actionLabels: Record<string, string>;
  imgPath: string;
  coordinateTransform?: CoordinateTransform;
}

/**
 * A position as the module draws it, or null when the transform leaves it out.
 *
 * `foldHalfField` is v5's 2026 fold, which v5 always applied (A-20): both ends of the field onto
 * one half-field picture. The left third doubles (`x < 30.5` → `(2x, y)`); the right third is
 * turned round onto it (`x > 69.5` → `(2(100 − x), 100 − y)`); the middle third is left out.
 */
export function transformPoint(
  point: Point,
  transform: CoordinateTransform = "none",
): Point | null {
  if (transform === "none") return { x: point.x, y: point.y };
  if (point.x > 69.5) return { x: (100 - point.x) * 2, y: 100 - point.y };
  if (point.x < 30.5) return { x: point.x * 2, y: point.y };
  return null;
}

export interface HeatmapTrace {
  /** The action id. */
  id: string;
  /** Its name from `actionLabels`, else the id. */
  label: string;
  points: Point[];
}

export interface HeatmapGroup {
  name: string;
  /** A trace per action id of the group that has a position, in the group's order. */
  traces: HeatmapTrace[];
}

/** The group's positions, every action together: the heat layer's. */
export function heatPoints(group: HeatmapGroup): Point[] {
  return group.traces.flatMap((t) => t.points);
}

function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") return false;
  const { x, y } = value as Record<string, unknown>;
  return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y);
}

/**
 * Each action group's positions, over every team shown. An action counts when its id is one of
 * the group's and it passes the group's period filters (#320); `config` resolves a `kinds`
 * filter's fixed kinds. An action with no position, or one the transform leaves out, is skipped.
 */
export function heatmapGroups(
  dataset: Dataset,
  teams: readonly TeamKey[],
  options: HeatmapOptions,
  config?: MatchScoutingConfig,
): HeatmapGroup[] {
  const actions = teams.flatMap((team) => {
    const list = getPath(dataset.teams[team], options.aggregatedActionsPath, null);
    return Array.isArray(list) ? list : [];
  }) as Record<string, unknown>[];
  return options.actionGroups.map((group) => {
    const traces = [...new Set(group.actions)].map((id) => ({
      id,
      label: options.actionLabels[id] ?? id,
      points: actions
        .filter((a) => a && a.id === id && passesFilter(a, group, config))
        .map((a) => getPath(a, options.coordinatePath, null))
        .filter(isPoint)
        .map((p) => transformPoint(p, options.coordinateTransform))
        .filter((p): p is Point => p !== null),
    }));
    return { name: group.name, traces: traces.filter((t) => t.points.length > 0) };
  });
}
