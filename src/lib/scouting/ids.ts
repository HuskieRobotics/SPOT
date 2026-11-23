import type { ScoutingConfig } from "../types";
import { camelCase } from "../analysis/path";

/** Labels a phase can take (including numbered shift labels), used to derive composite ids. */
export function phaseLabels(cfg: ScoutingConfig): string[] {
  const labels = new Set<string>(cfg.phases.map((p) => p.label));
  const s = cfg.shifts;
  if (s?.enabled) {
    const max = Math.max(1, Math.ceil((s.startsAt - s.endsAt) / Math.max(1, s.interval)));
    for (let i = 1; i <= max; i++) {
      labels.add(`${s.activeLabel} ${i}`);
      labels.add(`${s.inactiveLabel} ${i}`);
    }
    labels.add(s.endLabel);
  }
  return [...labels];
}

/** Ids of buttons that record into the action queue (action buttons only). */
export function recordedButtonIds(cfg: ScoutingConfig): string[] {
  const out: string[] = [];
  for (const layer of cfg.layers) for (const b of layer.buttons) if (b.type === "action" && !out.includes(b.id)) out.push(b.id);
  return out;
}

/**
 * Every action id the project can produce, in a stable order:
 * all button ids (first appearance) → knownActionIds → derived phase-prefixed ids.
 * Deriving the composites replaces the legacy "hidden catalog layer" hack.
 */
export function allActionIds(cfg: ScoutingConfig): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (id: string) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  for (const layer of cfg.layers) for (const b of layer.buttons) add(b.id);
  for (const id of cfg.knownActionIds || []) add(id);
  if (cfg.prefixActionIds) {
    const recorded = recordedButtonIds(cfg);
    for (const label of phaseLabels(cfg)) for (const id of recorded) add(camelCase(label) + id);
  }
  return out;
}
