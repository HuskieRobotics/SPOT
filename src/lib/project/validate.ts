import type { Project } from "../types";
import { getTransformer } from "../analysis/transformers";
import { MODULES } from "../analysis/moduleDefs";

export interface Issue {
  level: "error" | "warning";
  area: "layout" | "timing" | "scoring" | "pipeline" | "dashboard";
  message: string;
  /** Optional pointer the builder can jump to. */
  ref?: { layer?: number; uid?: string; step?: number; module?: number; phase?: number };
}

/** Plain-language checks shown in the builder so mistakes are caught before match day. */
export function validateProject(p: Pick<Project, "scouting" | "scoring" | "pipeline" | "modules">): Issue[] {
  const issues: Issue[] = [];
  const s = p.scouting;
  const nLayers = s.layers.length;
  const add = (i: Issue) => issues.push(i);

  s.layers.forEach((layer, li) => {
    const cells = new Map<string, string>();
    for (const b of layer.buttons) {
      const [r1, c1, r2, c2] = b.area;
      if (!b.id && b.type !== "label") add({ level: "error", area: "layout", message: `A ${b.type} button on "${layer.name}" has no id.`, ref: { layer: li, uid: b.uid } });
      if (r1 < 1 || c1 < 1 || r2 > s.grid.rows + 1 || c2 > s.grid.columns + 1 || r2 <= r1 || c2 <= c1)
        add({ level: "warning", area: "layout", message: `"${b.label || b.id}" on "${layer.name}" is outside the ${s.grid.rows}×${s.grid.columns} grid (an extra row/column will be added).`, ref: { layer: li, uid: b.uid } });
      for (let r = r1; r < r2; r++)
        for (let c = c1; c < c2; c++) {
          const k = `${r},${c}`;
          if (cells.has(k) && cells.get(k) !== b.uid) {
            add({ level: "warning", area: "layout", message: `"${b.label || b.id}" overlaps another button on "${layer.name}".`, ref: { layer: li, uid: b.uid } });
            r = r2;
            break;
          }
          cells.set(k, b.uid);
        }
      for (const e of b.executables) {
        if ((e.type === "layer" || e.type === "conditionalLayer") && !(Number(e.args[1]) >= 0 && Number(e.args[1]) < nLayers))
          add({ level: "error", area: "layout", message: `"${b.label || b.id}" switches to layer ${e.args[1]}, which does not exist.`, ref: { layer: li, uid: b.uid } });
        if (e.type === "multiplier" && b.type !== "action") add({ level: "warning", area: "layout", message: `"${b.label || b.id}" uses Multiplier but is not an action button.`, ref: { layer: li, uid: b.uid } });
      }
    }
    if (li > 0 && !layer.buttons.some((b) => b.type === "undo") && layer.buttons.some((b) => b.type === "action"))
      add({ level: "warning", area: "layout", message: `"${layer.name}" has action buttons but no Undo button.`, ref: { layer: li } });
  });

  if (!s.layers[0]?.buttons.some((b) => b.type === "match-control")) add({ level: "error", area: "layout", message: "The first layer needs a match-control (Start Match) button.", ref: { layer: 0 } });
  const hasControlEverywhere = s.layers.every((l) => l.buttons.some((b) => b.type === "match-control"));
  if (!hasControlEverywhere) add({ level: "warning", area: "layout", message: "Some layers have no match-control button, so the timer and Submit are hidden there." });

  s.phases.forEach((ph, i) => {
    if (ph.at > s.totalTime) add({ level: "warning", area: "timing", message: `Phase "${ph.label}" starts at ${ph.at / 1000}s, after the match length.`, ref: { phase: i } });
    if (ph.layer >= nLayers) add({ level: "error", area: "timing", message: `Phase "${ph.label}" shows layer ${ph.layer}, which does not exist.`, ref: { phase: i } });
  });
  if (s.shifts.enabled) {
    const ids = new Set(s.layers.flatMap((l) => l.buttons.map((b) => b.id)));
    for (const id of [s.shifts.activeButtonId, s.shifts.inactiveButtonId])
      if (!ids.has(id)) add({ level: "warning", area: "timing", message: `Shifts are on but there is no button with id "${id}".` });
  }

  p.pipeline.forEach((step, i) => {
    const def = getTransformer(step.name);
    if (!def) return add({ level: "error", area: "pipeline", message: `Step ${i + 1}: unknown transformer "${step.name}".`, ref: { step: i } });
    const impl = def.types[step.type];
    if (!impl) return add({ level: "error", area: "pipeline", message: `Step ${i + 1}: "${def.label}" has no ${step.type} version.`, ref: { step: i } });
    if (!def.noOutput && !step.outputPath) add({ level: "error", area: "pipeline", message: `Step ${i + 1} (${def.label}) has no output path.`, ref: { step: i } });
    for (const o of impl.options) {
      const v = (step.options as Record<string, unknown> | undefined)?.[o.key];
      if (o.required && (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) && !(step.name === "countActions" && (step.options as any)?.all))
        add({ level: "warning", area: "pipeline", message: `Step ${i + 1} (${def.label}): "${o.label}" is empty.`, ref: { step: i } });
    }
  });

  p.modules.forEach((m, i) => {
    if (!MODULES.find((d) => d.name === m.module)) add({ level: "error", area: "dashboard", message: `Module ${i + 1}: unknown module "${m.module}".`, ref: { module: i } });
  });

  for (const [id, pts] of Object.entries(p.scoring.points)) if (!Number.isFinite(Number(pts))) add({ level: "error", area: "scoring", message: `Points for "${id}" is not a number.` });
  return issues;
}
