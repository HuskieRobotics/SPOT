/**
 * Checks within match-scouting.json (#317, T-3) that its schema cannot express: every layer,
 * button, phase and variable a reference names exists; phases and segments fit the match; buttons
 * fit the grid; every layer can be reached.
 */
import { suggest } from "@/lib/suggest";
import matchScoutingSchema from "../schema/match-scouting.schema.json";
import type { Executable, MatchScoutingConfig } from "../types";
import type { Key } from "./json";
import { builtInExecutables } from "./references";
import type { Reporter } from "./report";

const FILE = "match-scouting" as const;

const BUILT_IN_EXECUTABLES = builtInExecutables(matchScoutingSchema.$defs.executable);

/** `did you mean` for an id among candidates, or a list of them when there are few. */
export function nearHint(id: string, candidates: readonly string[], noun: string): string {
  const near = suggest(id, candidates);
  if (near) return `Did you mean "${near}"?`;
  if (candidates.length === 0) return `There are no ${noun}s.`;
  if (candidates.length <= 12) return `The ${noun}s are: ${candidates.join(", ")}.`;
  return "";
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function checkMatchScouting(ms: MatchScoutingConfig, report: Reporter): void {
  const layers = ms.layout.layers;
  const layerIds = layers.map((l) => l.id);
  const buttonIds = [...new Set(layers.flatMap((l) => l.buttons.map((b) => b.id)))];
  const buttons = new Set(buttonIds);
  const phases = ms.timing.phases;
  const phaseIds = phases.map((p) => p.id);
  const variables = new Set<string>(Object.keys(ms.variables));
  for (const p of phases) for (const v of Object.keys(p.variables ?? {})) variables.add(v);
  // Buttons shown only while a variable has some value: two of them may share a grid cell.
  const conditionalButtons = new Set<string>();
  const addConditional = (c: Record<string, Record<string, string[]>> | undefined) => {
    for (const byValue of Object.values(c ?? {})) {
      for (const ids of Object.values(byValue)) for (const id of ids) conditionalButtons.add(id);
    }
  };
  for (const p of phases) addConditional(p.conditional);
  for (const l of layers) {
    for (const b of l.buttons) {
      for (const x of b.executables) {
        if (x.type === "setVariable" && "name" in x) variables.add(String(x.name));
        if (x.type === "conditionalLayer") {
          addConditional(
            (x as { conditional: Record<string, Record<string, string[]>> }).conditional,
          );
        }
      }
    }
  }

  const duplicates = (ids: string[], keysOf: (i: number) => Key[], noun: string) => {
    const seen = new Set<string>();
    ids.forEach((id, i) => {
      if (seen.has(id)) {
        report.error(
          FILE,
          keysOf(i),
          `Two ${noun}s have the id "${id}".`,
          `Give each ${noun} its own id.`,
        );
      }
      seen.add(id);
    });
  };
  const layerRef = (id: string | undefined, keys: Key[]) => {
    if (id !== undefined && !layerIds.includes(id)) {
      report.error(FILE, keys, `There is no layer "${id}".`, nearHint(id, layerIds, "layer id"));
    }
  };
  const buttonRefs = (ids: readonly string[] | undefined, keys: Key[]) => {
    (ids ?? []).forEach((id, i) => {
      if (!buttons.has(id)) {
        report.error(
          FILE,
          [...keys, i],
          `There is no button "${id}" in any layer.`,
          nearHint(id, buttonIds, "button id"),
        );
      }
    });
  };
  const conditionalRefs = (
    conditional: Record<string, Record<string, string[]>> | undefined,
    keys: Key[],
  ) => {
    for (const [name, byValue] of Object.entries(conditional ?? {})) {
      if (!variables.has(name)) {
        report.warning(
          FILE,
          [...keys, name],
          `No variable "${name}" is declared or set, so these buttons are never shown.`,
          nearHint(name, [...variables], "variable"),
        );
      }
      for (const [value, ids] of Object.entries(byValue)) buttonRefs(ids, [...keys, name, value]);
    }
  };

  // ------------------------------------------------------------------ layout
  duplicates(layerIds, (i) => ["layout", "layers", i, "id"], "layer");
  layerRef(ms.layout.initialLayer, ["layout", "initialLayer"]);
  const shown = new Set<string>([ms.layout.initialLayer]);
  const { rows, columns } = ms.layout;
  layers.forEach((layer, li) => {
    const inLayer = new Set<string>();
    const areas: { id: string; area: number[] }[] = [];
    layer.buttons.forEach((button, bi) => {
      const keys: Key[] = ["layout", "layers", li, "buttons", bi];
      if (inLayer.has(button.id)) {
        report.warning(
          FILE,
          [...keys, "id"],
          `This layer has two buttons with the id "${button.id}".`,
          "A press records the id, so analysis cannot tell them apart.",
        );
      }
      inLayer.add(button.id);
      // The browser tolerates what follows (CSS grid adds columns past the edge, and treats an
      // end at or before its start as one row or column), so these are warnings: the screen
      // still renders, just not as intended.
      const [r1, c1, r2, c2] = button.gridArea;
      const area = button.gridArea;
      const problems: string[] = [];
      const inverted = r2 <= r1 || c2 <= c1;
      if (inverted) {
        const fixed = [r1, c1, r2 <= r1 ? r1 + 1 : r2, c2 <= c1 ? c1 + 1 : c2];
        report.warning(
          FILE,
          [...keys, "gridArea"],
          `gridArea ${JSON.stringify(area)}: an end line must come after its start line; the browser shows one ${r2 <= r1 ? "row" : "column"}.`,
          `gridArea is [row start, column start, row end, column end], and a button one row tall ends one line after it starts. Did you mean ${JSON.stringify(fixed)}?`,
        );
      }
      if (!inverted && (r1 < 1 || r2 > rows + 1))
        problems.push(
          `rows ${r1} to ${r2} go past the ${rows}-row grid (row lines 1 to ${rows + 1})`,
        );
      if (!inverted && (c1 < 1 || c2 > columns + 1))
        problems.push(
          `columns ${c1} to ${c2} go past the ${columns}-column grid (column lines 1 to ${columns + 1})`,
        );
      if (problems.length > 0) {
        report.warning(
          FILE,
          [...keys, "gridArea"],
          `gridArea ${JSON.stringify(area)}: ${problems.join("; ")}.`,
          "The browser adds rows or columns at the edge for it, which changes the layout. Keep the lines within the grid, or change layout.rows or layout.columns.",
        );
      } else if (!inverted) {
        const other = conditionalButtons.has(button.id)
          ? undefined
          : areas.find(
              ({ id, area: [a1, b1, a2, b2] }) =>
                !conditionalButtons.has(id) && r1 < a2 && a1 < r2 && c1 < b2 && b1 < c2,
            );
        if (other) {
          report.warning(
            FILE,
            [...keys, "gridArea"],
            `It overlaps button "${other.id}" in this layer.`,
            "One of them will cover the other on the scouting screen.",
          );
        }
        areas.push({ id: button.id, area: button.gridArea });
      }
      button.executables.forEach((x: Executable, xi) => {
        const xk: Key[] = [...keys, "executables", xi];
        if (x.type === "layer" || x.type === "conditionalLayer") {
          const to = (x as { to: string }).to;
          layerRef(to, [...xk, "to"]);
          shown.add(to);
        }
        if (x.type === "conditionalLayer") {
          const c = x as {
            always: string[];
            conditional: Record<string, Record<string, string[]>>;
          };
          buttonRefs(c.always, [...xk, "always"]);
          conditionalRefs(c.conditional, [...xk, "conditional"]);
        }
        if (!BUILT_IN_EXECUTABLES.includes(x.type)) {
          report.warning(
            FILE,
            [...xk, "type"],
            `"${x.type}" is not a built-in executable, so pressing the button does nothing unless an extension provides it.`,
            nearHint(x.type, BUILT_IN_EXECUTABLES, "built-in executable"),
          );
        }
      });
    });
  });

  // ------------------------------------------------------------------ timing
  duplicates(phaseIds, (i) => ["timing", "phases", i, "id"], "phase");
  const segmentIds: string[] = [];
  phases.forEach((phase, pi) => {
    const keys: Key[] = ["timing", "phases", pi];
    if (phase.startMs > ms.timing.totalMs) {
      report.error(
        FILE,
        [...keys, "startMs"],
        `The phase starts at ${phase.startMs} ms, but the match lasts ${ms.timing.totalMs} ms (timing.totalMs).`,
        "Times count down from the start of the match, in milliseconds.",
      );
    }
    const before = phases[pi - 1];
    if (before && phase.startMs >= before.startMs) {
      report.error(
        FILE,
        [...keys, "startMs"],
        `Phases must be listed in match order, so this startMs must be smaller than "${before.id}"'s (${before.startMs} ms); it is ${phase.startMs} ms.`,
        "The clock counts down, so each phase's startMs is smaller than the one before.",
      );
    }
    layerRef(phase.layer, [...keys, "layer"]);
    if (phase.layer) shown.add(phase.layer);
    buttonRefs(phase.always, [...keys, "always"]);
    conditionalRefs(phase.conditional, [...keys, "conditional"]);

    // The phase runs from its startMs down to the next phase's (or the end of the match).
    const end = phases[pi + 1]?.startMs ?? 0;
    const segments = phase.segments ?? [];
    segments.forEach((segment, si) => {
      const sk: Key[] = [...keys, "segments", si];
      segmentIds.push(segment.id);
      if (segment.startMs > phase.startMs || segment.startMs <= end) {
        report.error(
          FILE,
          [...sk, "startMs"],
          `The segment starts at ${segment.startMs} ms, outside its phase "${phase.id}" (${phase.startMs} ms down to ${end} ms).`,
        );
      }
      const previous = segments[si - 1];
      if (previous && segment.startMs >= previous.startMs) {
        report.error(
          FILE,
          [...sk, "startMs"],
          `Segments must be listed in match order, so this startMs must be smaller than "${previous.id}"'s (${previous.startMs} ms); it is ${segment.startMs} ms.`,
          "The clock counts down, so each segment's startMs is smaller than the one before.",
        );
      }
      if (segment.repeat) {
        const last = segment.startMs - (segment.repeat.count - 1) * segment.repeat.intervalMs;
        if (last <= end) {
          report.error(
            FILE,
            [...sk, "repeat"],
            `Repeat ${segment.repeat.count} would start at ${last} ms, after the phase "${phase.id}" has ended (${end} ms).`,
            `Use ${plural(Math.max(1, Math.floor((segment.startMs - end - 1) / segment.repeat.intervalMs) + 1), "repeat")} or a shorter interval.`,
          );
        }
      }
      layerRef(segment.layer, [...sk, "layer"]);
      if (segment.layer) shown.add(segment.layer);
      duplicates(
        (segment.kinds ?? []).map((k) => k.id),
        (i) => [...sk, "kinds", i, "id"],
        "kind of this segment",
      );
      (segment.kinds ?? []).forEach((kind, ki) => {
        if (!buttons.has(kind.toggleButton)) {
          report.error(
            FILE,
            [...sk, "kinds", ki, "toggleButton"],
            `There is no button "${kind.toggleButton}" in any layer, so the scouter cannot select this kind.`,
            nearHint(kind.toggleButton, buttonIds, "button id"),
          );
        }
      });
    });
  });
  duplicates(segmentIds, (i) => segmentKeys(ms, i), "segment");

  // Fixed kinds (#326): a phase or a segment without toggles counts as one of the declared kinds.
  const kindIds = [
    ...new Set(
      phases.flatMap((p) => (p.segments ?? []).flatMap((s) => s.kinds ?? []).map((k) => k.id)),
    ),
  ];
  const fixedKind = (kind: string | undefined, keys: Key[], what: string) => {
    if (kind === undefined || kindIds.includes(kind)) return;
    report.error(
      FILE,
      keys,
      kindIds.length > 0
        ? `"${kind}" is not a kind any segment declares, so the ${what} counts as no kind.`
        : `No segment declares kinds, so "${kind}" means nothing here.`,
      kindIds.length > 0
        ? nearHint(kind, kindIds, "kind id")
        : 'A fixed "kind" names one of the kinds a segment with toggle buttons declares.',
    );
  };
  phases.forEach((phase, pi) => {
    fixedKind(phase.kind, ["timing", "phases", pi, "kind"], "phase");
    (phase.segments ?? []).forEach((segment, si) => {
      const sk: Key[] = ["timing", "phases", pi, "segments", si];
      if (segment.kind !== undefined && segment.kinds?.length) {
        report.error(
          FILE,
          [...sk, "kind"],
          "This segment has kinds the scouter selects, so it cannot also have a fixed kind.",
          'Remove "kind"; a fixed kind is for a phase or segment without toggle buttons.',
        );
      } else {
        fixedKind(segment.kind, [...sk, "kind"], "segment");
      }
      if (segment.alternate && !(segment.kinds?.length && segment.repeat)) {
        report.error(
          FILE,
          [...sk, "alternate"],
          `"alternate" switches the selected kind at each repeat, but this segment has no ${segment.kinds?.length ? '"repeat"' : '"kinds"'}.`,
          'Remove "alternate", or give the segment "kinds" and "repeat".',
        );
      }
    });
  });

  // ------------------------------------------------------------------ rules
  ms.rules.locks.forEach((lock, i) => {
    buttonRefs(lock.triggerButtons, ["rules", "locks", i, "triggerButtons"]);
    if (!phaseIds.includes(lock.untilPhase)) {
      report.error(
        FILE,
        ["rules", "locks", i, "untilPhase"],
        `There is no phase "${lock.untilPhase}".`,
        nearHint(lock.untilPhase, phaseIds, "phase id"),
      );
    }
  });
  ms.rules.allianceRelativeButtons.forEach((pair, i) => {
    for (const side of ["own", "opposing"] as const) {
      if (!buttons.has(pair[side])) {
        report.error(
          FILE,
          ["rules", "allianceRelativeButtons", i, side],
          `There is no button "${pair[side]}" in any layer.`,
          nearHint(pair[side], buttonIds, "button id"),
        );
      }
    }
  });

  layers.forEach((layer, i) => {
    if (!shown.has(layer.id)) {
      report.warning(
        FILE,
        ["layout", "layers", i, "id"],
        `Layer "${layer.id}" is never shown: it is not the initialLayer, and no phase, segment or button opens it.`,
      );
    }
  });
}

/** Keys of the n-th segment counted across all phases. */
function segmentKeys(ms: MatchScoutingConfig, n: number): Key[] {
  let count = 0;
  for (const [pi, phase] of ms.timing.phases.entries()) {
    for (const si of (phase.segments ?? []).keys()) {
      if (count++ === n) return ["timing", "phases", pi, "segments", si, "id"];
    }
  }
  return ["timing", "phases"];
}
