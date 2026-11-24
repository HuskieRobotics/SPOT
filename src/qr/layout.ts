/**
 * The QR layout of a season (CS-14 as revised by CS-16, CC-7; decided 2026-11-24, #358): derived
 * from match-scouting.json, so students set nothing. An action is a button number, the number of
 * the period it was recorded in, and its time; every width is the fewest bits that number them.
 *
 * Buttons are numbered in sorted order and periods in a fixed order, so rearranging the layout
 * changes nothing. Adding, removing or renaming a button or a period does, and the 16-bit
 * fingerprint of the layout lets the decoder refuse a code made under another configuration
 * (DM-15a) rather than read it as wrong data.
 */
import { actionButtonIds } from "@/config/knownActionIds";
import type { MatchScoutingConfig } from "@/config/types";
import type { Placement } from "@/data/phase";
import { bitsFor } from "./bits";

export interface QrLayout {
  /** The ids an action may have: action buttons and `extraActionIds`, sorted. */
  buttons: string[];
  /** Every period an action may be recorded in, pre-match first. */
  placements: Placement[];
  /** The longest time an action may carry: the match's length in ms. */
  maxTs: number;
  bits: { button: number; placement: number; ts: number };
  /** Bits in one action without and with a position (SC-32). */
  actionBits: { plain: number; positioned: number };
  /** 16 bits that change when the layout does (DM-15a). */
  fingerprint: number;
}

/** A position's x and y are whole percentages, 0 to 100 (SC-32): 7 bits each. */
export const POSITION_BITS = 7;

export function placementKey(p: Placement): string {
  return [p.phase, p.segment, p.segmentKind, p.segmentIndex].map((v) => v ?? "").join("/");
}

/**
 * Every placement the scouting screen can record: before the match; each phase; each segment, at
 * each repeat index, with no kind selected or with each kind.
 */
export function allPlacements(config: MatchScoutingConfig): Placement[] {
  const out: Placement[] = [{ phase: null, segment: null, segmentKind: null, segmentIndex: null }];
  for (const phase of config.timing.phases) {
    out.push({ phase: phase.id, segment: null, segmentKind: null, segmentIndex: null });
    for (const segment of phase.segments ?? []) {
      const indexes = segment.repeat
        ? Array.from({ length: segment.repeat.count }, (_, i) => i + 1)
        : [null];
      const kinds = [null, ...(segment.kinds ?? []).map((k) => k.id)];
      for (const segmentIndex of indexes)
        for (const segmentKind of kinds)
          out.push({ phase: phase.id, segment: segment.id, segmentKind, segmentIndex });
    }
  }
  return out;
}

/** FNV-1a over the text, folded to 16 bits. Not for security: it tells layouts apart. */
function fingerprintOf(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ((h >>> 16) ^ h) & 0xffff;
}

export function qrLayout(config: MatchScoutingConfig): QrLayout {
  const buttons = [...new Set([...actionButtonIds(config), ...config.extraActionIds])].sort();
  const placements = allPlacements(config);
  const maxTs = config.timing.totalMs;
  const bits = {
    button: bitsFor(buttons.length),
    placement: bitsFor(placements.length),
    ts: bitsFor(maxTs + 1),
  };
  const plain = bits.button + bits.placement + bits.ts + 1;
  return {
    buttons,
    placements,
    maxTs,
    bits,
    actionBits: { plain, positioned: plain + 2 * POSITION_BITS },
    fingerprint: fingerprintOf(
      JSON.stringify({ buttons, placements: placements.map(placementKey), maxTs }),
    ),
  };
}
