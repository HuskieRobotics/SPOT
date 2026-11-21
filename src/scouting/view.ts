/**
 * What the scouting screen shows for a session state (docs/spec/05): the buttons on screen with
 * their labels, places and states, the clock's label, and the last-actions readout. Pure, so the
 * preview, the Phase 2 client and the tests all read the same thing.
 */
import type { Button, ButtonType, GridArea, MatchScoutingConfig } from "@/config/types";
import type { Placement } from "@/data/phase";
import {
  alliancePartner,
  currentScreen,
  isLocked,
  isShown,
  kindOf,
  layerOf,
  type ScoutingContext,
  type SessionState,
} from "./session";

export interface ButtonView {
  /** Unique on the screen: `layer:button`. */
  key: string;
  layer: string;
  id: string;
  type: ButtonType;
  label: string;
  /** Where the button sits, after a flipped field swaps alliance-relative buttons (SC-28). */
  gridArea: GridArea;
  color?: string;
  textColor?: string;
  highlighted: boolean;
  /** A lock keeps it from being pressed (SC-27b). */
  disabled: boolean;
}

/** The buttons on the screen shown now, in layer order (SC-14, SC-26, SC-28, SC-36). */
export function screenButtons(
  state: SessionState,
  context: ScoutingContext,
  now: number,
): ButtonView[] {
  const { config, settings } = context;
  const screen = currentScreen(state);
  const layer = layerOf(config, screen.layer);
  if (!layer) return [];
  const byId = new Map(layer.buttons.map((b) => [b.id, b]));
  return layer.buttons
    .filter((b) => isShown(state, { layer: layer.id, button: b.id }))
    .map((b) => {
      const partner = alliancePartner(config, b.id);
      const other = partner ? byId.get(partner) : undefined;
      // On blue, the button in this place records its partner, so it shows the partner's label.
      const labelled = settings.alliance === "blue" && other ? other : b;
      // A flipped field puts each alliance-relative button where its partner was.
      const placed = settings.fieldFlipped && other ? other : b;
      return {
        key: `${layer.id}:${b.id}`,
        layer: layer.id,
        id: b.id,
        type: b.type,
        label: b.type === "match-control" ? clockLabel(state, context, b, now) : labelOf(labelled),
        gridArea: placed.gridArea,
        color: b.color,
        textColor: b.textColor,
        highlighted: state.highlights.includes(b.id),
        disabled: isLocked(state, b),
      };
    });
}

function labelOf(button: Button): string {
  return button.label ?? button.id;
}

/**
 * The period as the scouter reads it: "Auto", "Teleop Transition", "Active Shift 2" (a kind,
 * the segment and the repeat index), or "" before the match.
 */
export function periodLabel(
  state: SessionState,
  config: MatchScoutingConfig,
  placement: Placement = state.placement,
): string {
  const phase = config.timing.phases.find((p) => p.id === placement.phase);
  if (!phase) return "";
  const segment = (phase.segments ?? []).find((s) => s.id === placement.segment);
  if (!segment) return phase.label;
  const kindId = kindOf(state, config, placement);
  const kind = segment.kinds?.find((k) => k.id === kindId);
  const index = placement.segmentIndex === null ? "" : ` ${placement.segmentIndex}`;
  if (kind) return `${kind.label ?? kind.id} ${segment.label ?? segment.id}${index}`;
  if (segment.kinds?.length) return phase.label; // no kind chosen yet (v5 showed the phase)
  return `${segment.label ?? phase.label}${segment.repeat ? index : ""}`;
}

/** How long "Match Complete" shows before the control becomes "Submit Match" (SC-20). */
export const MATCH_COMPLETE_MS = 2000;

/**
 * The match control's label (SC-17, SC-20, SC-21): its own label before the match, then
 * "<seconds> | <period>" while running, "Match Complete" and then "Submit Match" at the end.
 */
export function clockLabel(
  state: SessionState,
  context: ScoutingContext,
  button: Button,
  now: number,
): string {
  switch (state.status) {
    case "pre-match":
      return labelOf(button);
    case "running": {
      const period = periodLabel(state, context.config);
      const paused = state.holding !== null ? " (paused)" : "";
      return `${(state.ts / 1000).toFixed(2)} | ${period}${paused}`;
    }
    case "ended":
      return state.endedAt !== null && now - state.endedAt < MATCH_COMPLETE_MS
        ? "Match Complete"
        : "Submit Match";
    case "submitted":
      return "Submitted";
  }
}

/**
 * The last-actions readout (SC-2): the last three runs of presses, oldest first, each with
 * "(n)" when pressed n times in a row. Temp presses count; an action shows the id it records.
 */
export function readout(state: SessionState): string[] {
  const runs: { id: string; n: number }[] = [];
  for (const entry of state.queue) {
    const id = entry.recordedId;
    const last = runs[runs.length - 1];
    if (last && last.id === id) last.n++;
    else runs.push({ id, n: 1 });
  }
  return runs.slice(-3).map((r) => (r.n > 1 ? `${r.id} (${r.n})` : r.id));
}

/** The message of the lock that is engaged, if any (SC-27b). */
export function lockMessage(state: SessionState): string | null {
  return state.lock?.lock.message ?? null;
}
