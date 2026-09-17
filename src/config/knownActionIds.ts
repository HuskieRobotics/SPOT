/**
 * Derive the complete set of action ids a match-scouting configuration can produce.
 *
 * Replaces the v1 "hidden catalog layer" hack (docs/spec/04 CF-9, docs/spec/12 F-4): the set is
 * prefixes × action-button ids, plus any `extraActionIds`. Prefixes come from the phases, from
 * the segments inside each phase (including each repeat index and each scouter-selected kind),
 * and from the empty pre-match prefix.
 *
 * The result is deterministic and ordered (stable QR index, docs/spec/03 and qr.schema.json).
 */
import type { MatchScoutingConfig, Phase, Segment } from "./types";

/** Prefixes a segment can contribute: kind prefixes (or its own), each with the repeat index. */
export function segmentPrefixes(segment: Segment): string[] {
  const bases = segment.kinds?.length
    ? segment.kinds.map((k) => k.prefix)
    : segment.prefix !== undefined
      ? [segment.prefix]
      : [];
  if (!segment.repeat) return bases;
  const out: string[] = [];
  for (const base of bases) {
    for (let i = 1; i <= segment.repeat.count; i++) out.push(`${base}${i}`);
  }
  return out;
}

export function phasePrefixes(phase: Phase): string[] {
  return [phase.prefix, ...(phase.segments ?? []).flatMap(segmentPrefixes)];
}

export function derivePrefixes(config: MatchScoutingConfig): string[] {
  if (config.idPrefixing === "none") return [""];
  // "" covers actions recorded before the match starts, when no phase is active yet.
  const prefixes = new Set<string>([""]);
  for (const phase of config.timing.phases) {
    for (const prefix of phasePrefixes(phase)) prefixes.add(prefix);
  }
  return [...prefixes];
}

export function actionButtonIds(config: MatchScoutingConfig): string[] {
  const ids = new Set<string>();
  for (const layer of config.layout.layers) {
    for (const button of layer.buttons) {
      if (button.type === "action") ids.add(button.id);
    }
  }
  return [...ids];
}

export function deriveKnownActionIds(config: MatchScoutingConfig): string[] {
  const out = new Set<string>();
  const buttons = actionButtonIds(config);
  for (const prefix of derivePrefixes(config)) {
    for (const id of buttons) out.add(`${prefix}${id}`);
  }
  for (const id of config.extraActionIds) out.add(id);
  return [...out].sort();
}

/** Ids present in data that the configuration cannot explain. */
export function unknownActionIds(
  config: MatchScoutingConfig,
  idsInData: Iterable<string>,
): string[] {
  const known = new Set(deriveKnownActionIds(config));
  const missing = new Set<string>();
  for (const id of idsInData) if (!known.has(id)) missing.add(id);
  return [...missing].sort();
}
