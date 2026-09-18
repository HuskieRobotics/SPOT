/**
 * Resolving when an action happened, from a match-scouting configuration.
 *
 * Two independent routes to the same answer, which is why they live together:
 *
 *  - `placeAt(config, ts)` uses the clock. The clock counts DOWN, so a phase begins when the
 *    time remaining reaches its `startMs`, and the active phase is the most recent one to have
 *    begun (docs/spec/20 §2). Before the first phase begins there is no phase.
 *  - `splitActionId(config, id)` uses the recorded composite id, which v5 built as
 *    prefix + button id (SC-23). This is how migrated data recovers its phase.
 *
 * The migration runs both and reports disagreements (docs/spec/21).
 */
import type { MatchScoutingConfig, Phase, Segment } from "@/config/types";
import { actionButtonIds } from "@/config/knownActionIds";

/** Where an action sits in the match. `null` means "before any phase began" (pre-match). */
export interface Placement {
  phase: string | null;
  segment: string | null;
  segmentKind: string | null;
  /** 1-based repeat index for a repeating segment. */
  segmentIndex: number | null;
}

export const NOWHERE: Placement = {
  phase: null,
  segment: null,
  segmentKind: null,
  segmentIndex: null,
};

/** Phases in the order they occur: highest `startMs` first. */
function orderedPhases(config: MatchScoutingConfig): Phase[] {
  return [...config.timing.phases].sort((a, b) => b.startMs - a.startMs);
}

function orderedSegments(phase: Phase): Segment[] {
  return [...(phase.segments ?? [])].sort((a, b) => b.startMs - a.startMs);
}

/** The most recent entry to have begun at `ts` ms remaining, or undefined if none has. */
function current<T extends { startMs: number }>(items: T[], ts: number): T | undefined {
  let found: T | undefined;
  for (const item of items) {
    if (item.startMs >= ts) found = item;
    else break;
  }
  return found;
}

/** Repeat index of a repeating segment at `ts`, 1-based and capped at `repeat.count`. */
export function repeatIndexAt(segment: Segment, ts: number): number | null {
  if (!segment.repeat) return null;
  const elapsed = segment.startMs - ts;
  if (elapsed < 0) return null;
  const index = Math.floor(elapsed / segment.repeat.intervalMs) + 1;
  return Math.min(index, segment.repeat.count);
}

/**
 * Place an action by the clock alone. The scouter-selected kind of a segment cannot be known
 * from the clock, so `segmentKind` is always null here; `splitActionId` recovers it.
 */
export function placeAt(config: MatchScoutingConfig, ts: number): Placement {
  const phase = current(orderedPhases(config), ts);
  if (!phase) return { ...NOWHERE };
  const segment = current(orderedSegments(phase), ts);
  if (!segment) return { phase: phase.id, segment: null, segmentKind: null, segmentIndex: null };
  return {
    phase: phase.id,
    segment: segment.id,
    segmentKind: null,
    segmentIndex: repeatIndexAt(segment, ts),
  };
}

// ---------------------------------------------------------------------------- id splitting

export interface SplitId extends Placement {
  /** The button id with the period prefix removed. */
  baseId: string;
  /** False when no prefix + known-button combination explained the id. */
  known: boolean;
}

interface PrefixEntry extends Placement {
  prefix: string;
}

/**
 * Every prefix the configuration can produce, longest first so that matching is unambiguous
 * when one prefix is a prefix of another (`teleop` and `teleopTransition`).
 */
export function prefixTable(config: MatchScoutingConfig): PrefixEntry[] {
  const entries: PrefixEntry[] = [];
  for (const phase of config.timing.phases) {
    entries.push({
      prefix: phase.prefix,
      phase: phase.id,
      segment: null,
      segmentKind: null,
      segmentIndex: null,
    });
    for (const segment of phase.segments ?? []) {
      const counts = segment.repeat ? segment.repeat.count : 0;
      const push = (prefix: string, kind: string | null, index: number | null) =>
        entries.push({
          prefix,
          phase: phase.id,
          segment: segment.id,
          segmentKind: kind,
          segmentIndex: index,
        });
      if (segment.kinds?.length) {
        for (const kind of segment.kinds) {
          if (counts) for (let i = 1; i <= counts; i++) push(`${kind.prefix}${i}`, kind.id, i);
          else push(kind.prefix, kind.id, null);
        }
      }
      if (segment.prefix !== undefined) {
        if (counts) for (let i = 1; i <= counts; i++) push(`${segment.prefix}${i}`, null, i);
        else push(segment.prefix, null, null);
      }
    }
  }
  // Longest first; an empty prefix sorts last so it only matches when nothing else does.
  return entries.sort((a, b) => b.prefix.length - a.prefix.length);
}

/**
 * Split a recorded composite id into its button id and the period it was recorded in.
 * A configuration with empty prefixes (any season before 2026) yields the id unchanged with no
 * placement, and the caller falls back to `placeAt`.
 */
export function splitActionId(config: MatchScoutingConfig, id: string): SplitId {
  const buttons = new Set(actionButtonIds(config));
  for (const entry of prefixTable(config)) {
    if (entry.prefix === "") continue;
    if (!id.startsWith(entry.prefix)) continue;
    const baseId = id.slice(entry.prefix.length);
    if (buttons.has(baseId)) {
      return {
        baseId,
        known: true,
        phase: entry.phase,
        segment: entry.segment,
        segmentKind: entry.segmentKind,
        segmentIndex: entry.segmentIndex,
      };
    }
  }
  if (buttons.has(id)) return { baseId: id, known: true, ...NOWHERE };
  return { baseId: id, known: false, ...NOWHERE };
}

/** Rebuild the composite id v5 would have recorded. The inverse of `splitActionId`. */
export function compositeActionId(
  config: MatchScoutingConfig,
  baseId: string,
  placement: Placement,
): string {
  const phase = config.timing.phases.find((p) => p.id === placement.phase);
  if (!phase) return baseId;
  const segment = (phase.segments ?? []).find((s) => s.id === placement.segment);
  if (segment) {
    const kind = segment.kinds?.find((k) => k.id === placement.segmentKind);
    const index = placement.segmentIndex === null ? "" : String(placement.segmentIndex);
    if (kind) return `${kind.prefix}${index}${baseId}`;
    if (segment.prefix !== undefined) return `${segment.prefix}${index}${baseId}`;
  }
  return `${phase.prefix}${baseId}`;
}
