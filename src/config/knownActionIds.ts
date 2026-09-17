/**
 * Derive the complete set of action ids a match-scouting configuration can produce.
 *
 * Replaces the v1 "hidden catalog layer" hack (docs/spec/04 CF-9, docs/spec/12 F-4): the set is
 * prefixes × action-button ids, where prefixes come from the phases, the shift model, the
 * endgame model, and the empty pre-match prefix, plus any `extraActionIds`.
 *
 * The result is deterministic and ordered (stable QR index, docs/spec/03 and qr.schema.json).
 */
import type { MatchScoutingConfig } from "./types";

export function derivePrefixes(config: MatchScoutingConfig): string[] {
  if (config.idPrefixing === "none") return [""];
  const prefixes = new Set<string>([""]);
  for (const phase of config.timing.phases) prefixes.add(phase.prefix);
  if (config.timing.endgame) prefixes.add(config.timing.endgame.prefix);
  const shifts = config.timing.shifts;
  if (shifts) {
    for (const kind of shifts.kinds) {
      for (let i = 1; i <= shifts.maxIndex; i++) prefixes.add(`${kind.prefix}${i}`);
    }
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
