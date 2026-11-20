/**
 * config:preview (#318, gate K-3; docs/spec/22 §3.2): what a season's pipeline computes, and what
 * its modules would show, before any match is played. The pipeline runs on generated matches
 * (one robot never does anything), and the preview summarizes:
 *
 * - every value a module shows, formatted as the module formats it (multiplier, decimals, unit),
 *   with its spread across teams and what the team that never did anything gets;
 * - every pipeline output, per performance or per team;
 * - values that look wrong: No Data for everyone, 0 for everyone, the same for everyone; with the
 *   entry that writes them.
 *
 * `formatTeam` shows one team the way the team view would, ranks included. Pure, like config:check:
 * the CLI (scripts/config-preview.ts) reads the files and writes the dataset.
 */
import type { Dataset, PipelineProblem, TransformerRegistry } from "@/analysis/engine";
import { displayValue, NO_DATA, rankTeams, type DisplayOptions } from "@/analysis/modules/display";
import { createRegistry } from "@/analysis/transformers";
import type { TeamKey } from "@/data/team";
import { describeLocation } from "../check/locations";
import { findReferences, moduleOptionsSchema, modulesRoot } from "../check/references";
import type { Key } from "../check/json";
import { eachLeaf, IDLE_TEAM, simulate, valueAt, type GeneratedSummary } from "../simulate";
import type {
  AnalysisModulesConfig,
  AnalysisPipelineConfig,
  MatchScoutingConfig,
  ModuleEntry,
} from "../types";

/** A typical event: about ten matches a team. */
export const PREVIEW_DEFAULTS = { seed: "preview", matches: 80 } as const;

export interface PreviewOptions {
  seed?: string;
  matches?: number;
  registry?: TransformerRegistry;
}

/** What looks wrong about a value across every team (or performance). */
export type Flag = "noData" | "zero" | "empty" | "constant";

/** A set of numbers across teams or performances. */
export interface Spread {
  /** Values with a number. */
  count: number;
  /** Values that are No Data. */
  noData: number;
  min: number | null;
  median: number | null;
  max: number | null;
}

export interface ItemPreview {
  /** The stat, bar or slice name, or the path when the module names none. */
  label: string;
  path: string;
  /** Where the path is in analysis-modules.json. */
  keys: Key[];
  kind: "team" | "performance";
  display: DisplayOptions;
  sort: 0 | 1 | -1;
  /** Displayed values across every team (or performance) but the one that never did anything. */
  spread: Spread;
  /** What the team that never did anything shows. */
  idle: string;
  flag?: Flag;
  /** The entry that writes the path, or null when no entry does. */
  writer: string | null;
}

export interface ModulePreview {
  index: number;
  where: string;
  module: ModuleEntry;
  items: ItemPreview[];
  /** Why the module's values are not listed, when they are not. */
  note?: string;
}

export interface LeafPreview {
  /** The full path of the value. */
  path: string;
  type: "number" | "list" | "text" | "none";
  /** Numbers, or list lengths. */
  spread: Spread;
  /** Different texts seen, for text values. */
  texts: number;
  flag?: Flag;
}

export interface EntryPreview {
  index: number;
  where: string;
  kind: "tmp" | "team";
  leaves: LeafPreview[];
  /** Set when every value the entry writes has the same flag. */
  flag?: Flag;
}

export interface Preview {
  seed: string;
  generated: GeneratedSummary;
  idleTeam: TeamKey;
  dataset: Dataset;
  /** Entries that could not run or failed (`describeProblem` words them). */
  problems: PipelineProblem[];
  entries: EntryPreview[];
  /** Null when there is no valid modules file. */
  modules: ModulePreview[] | null;
}

export interface PreviewInput {
  ms: MatchScoutingConfig;
  pipeline: AnalysisPipelineConfig;
  modules: AnalysisModulesConfig | null;
}

// ---------------------------------------------------------------------------- spreads

function spreadOf(values: readonly (number | null)[]): Spread {
  const numbers = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  const mid = numbers.length >> 1;
  return {
    count: numbers.length,
    noData: values.length - numbers.length,
    min: numbers.length ? numbers[0] : null,
    median: numbers.length
      ? numbers.length % 2
        ? numbers[mid]
        : (numbers[mid - 1] + numbers[mid]) / 2
      : null,
    max: numbers.length ? numbers[numbers.length - 1] : null,
  };
}

function flagOf(spread: Spread, type: LeafPreview["type"] = "number"): Flag | undefined {
  if (spread.count === 0) return spread.noData > 0 ? "noData" : undefined;
  if (spread.max === 0 && spread.min === 0) return type === "list" ? "empty" : "zero";
  if (spread.noData === 0 && spread.count > 1 && spread.min === spread.max) return "constant";
  return undefined;
}

// ---------------------------------------------------------------------------- the preview

export function previewConfiguration(input: PreviewInput, options: PreviewOptions = {}): Preview {
  const { ms, pipeline, modules } = input;
  const seed = options.seed ?? PREVIEW_DEFAULTS.seed;
  const registry = options.registry ?? createRegistry();
  const entries = pipeline.pipeline;
  const leafValues = new Map<number, Map<string, unknown[]>>();

  const run = simulate({
    ms,
    entries,
    enrichment: pipeline.enrichment.tba,
    registry,
    seed,
    matches: options.matches ?? PREVIEW_DEFAULTS.matches,
    afterEntry: (i, d) => {
      // Values are read right after the entry runs: a later entry may add keys inside an
      // object this one wrote, and those are the later entry's values.
      const entry = entries[i];
      const objects =
        entry.type === "tmp"
          ? d.tmps.filter((t) => t.team !== IDLE_TEAM)
          : Object.entries(d.teams)
              .filter(([team]) => team !== IDLE_TEAM)
              .map(([, data]) => data);
      const byLeaf = new Map<string, unknown[]>();
      for (const o of objects) {
        eachLeaf(valueAt(o, entry.outputPath), "", (suffix, v) => {
          const list = byLeaf.get(suffix) ?? [];
          list.push(v);
          byLeaf.set(suffix, list);
        });
      }
      leafValues.set(i, byLeaf);
    },
  });

  const entryPreviews: EntryPreview[] = entries.map((entry, index) => {
    const leaves: LeafPreview[] = [];
    for (const [suffix, values] of leafValues.get(index) ?? []) {
      leaves.push(leafPreview(suffix ? `${entry.outputPath}.${suffix}` : entry.outputPath, values));
    }
    const flags = new Set(leaves.map((l) => l.flag));
    const [only] = flags;
    return {
      index,
      where: describeLocation("analysis-pipeline", pipeline, ["pipeline", index]),
      kind: entry.type,
      leaves,
      ...(leaves.length > 0 && flags.size === 1 && only && only !== "constant"
        ? { flag: only }
        : {}),
    };
  });

  return {
    seed,
    generated: run.generated,
    idleTeam: IDLE_TEAM,
    dataset: run.dataset,
    problems: run.problems,
    entries: entryPreviews,
    modules: modules ? previewModules(modules, pipeline, run.dataset) : null,
  };
}

function leafPreview(path: string, values: readonly unknown[]): LeafPreview {
  const lists = values.filter(Array.isArray);
  const numbers = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const texts = new Set(values.filter((v): v is string => typeof v === "string"));
  const none = values.filter((v) => v === null || v === undefined).length;
  if (lists.length > 0 && lists.length + none === values.length) {
    const spread = spreadOf(values.map((v) => (Array.isArray(v) ? v.length : null)));
    return { path, type: "list", spread, texts: 0, flag: flagOf(spread, "list") };
  }
  if (texts.size > 0) {
    const spread = spreadOf([]);
    spread.noData = none;
    return { path, type: "text", spread, texts: texts.size };
  }
  const spread = spreadOf(
    values.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null)),
  );
  const type = numbers.length > 0 ? "number" : "none";
  return { path, type, spread, texts: 0, flag: flagOf(spread) };
}

/** The last entry that writes `path` (or an object holding it) for teams or performances. */
function writerOf(
  pipeline: AnalysisPipelineConfig,
  kind: "tmp" | "team",
  path: string,
): number | null {
  let found: number | null = null;
  pipeline.pipeline.forEach((e, i) => {
    if (e.type === kind && (path === e.outputPath || path.startsWith(`${e.outputPath}.`))) {
      found = i;
    }
  });
  return found;
}

const DISPLAY_KEYS = ["multiplier", "addend", "decimals", "unit", "hideIfValue", "string"] as const;

function displayOptions(o: Record<string, unknown> | undefined): DisplayOptions {
  const out: Record<string, unknown> = {};
  for (const k of DISPLAY_KEYS) if (o && o[k] !== undefined) out[k] = o[k];
  return out as DisplayOptions;
}

function previewModules(
  modules: AnalysisModulesConfig,
  pipeline: AnalysisPipelineConfig,
  dataset: Dataset,
): ModulePreview[] {
  const teams = Object.entries(dataset.teams);
  const others = teams.filter(([team]) => team !== IDLE_TEAM);
  const idleData = dataset.teams[IDLE_TEAM];
  const tmps = dataset.tmps.filter((t) => t.team !== IDLE_TEAM);
  const idleTmps = dataset.tmps.filter((t) => t.team === IDLE_TEAM);

  return modules.modules.map((m, index): ModulePreview => {
    const where = describeLocation("analysis-modules", modules, ["modules", index]);
    const schema = moduleOptionsSchema(m.module);
    if (!schema) {
      return { index, where, module: m, items: [], note: "not a built-in module" };
    }
    if (m.module === "SingleDisplay" && m.options.aggrMethod === "percentChanceOfWinning") {
      return {
        index,
        where,
        module: m,
        items: [],
        note: "win probability, from averageScores.total and standardDeviation; it compares two alliances (Simulate Match)",
      };
    }
    const items: ItemPreview[] = [];
    for (const ref of findReferences(
      m.options,
      schema,
      ["modules", index, "options"],
      modulesRoot,
    )) {
      if (ref.kind !== "path" && ref.kind !== "performancePath") continue;
      const parentKeys = ref.keys.slice(3, -1);
      const parent = (parentKeys.length ? valueAt(m.options, parentKeys.join(".")) : m.options) as
        Record<string, unknown> | undefined;
      const label = typeof parent?.name === "string" ? parent.name : ref.id;
      const display = displayOptions(parent);
      const sort = parent?.sort === 1 || parent?.sort === -1 ? parent.sort : 0;
      const kind = ref.kind === "path" ? "team" : "performance";
      const objects = kind === "team" ? others.map(([, d]) => d) : tmps;
      const raw = objects.map((o) => valueAt(o, ref.id));
      // A list (the actions a heatmap plots) is described by its length.
      const list = raw.some(Array.isArray);
      const shown = raw.map((v) =>
        list ? (Array.isArray(v) ? v.length : null) : displayValue(v, display).value,
      );
      const spread = spreadOf(shown);
      // Who writes it: an entry, or TBA enrichment for component OPRs. A path inside an object an
      // entry writes ("averages.missCoral") is written only if it is there.
      const written = raw.some((v) => v !== undefined);
      const entry = writerOf(pipeline, kind === "team" ? "team" : "tmp", ref.id);
      const writer = !written
        ? null
        : entry !== null
          ? describeLocation("analysis-pipeline", pipeline, ["pipeline", entry])
          : kind === "team" && ref.id.startsWith("opr.")
            ? "TBA enrichment (componentOprs)"
            : null;
      const idleValue =
        kind === "team"
          ? valueAt(idleData, ref.id)
          : idleTmps.length > 0
            ? valueAt(idleTmps[0], ref.id)
            : undefined;
      items.push({
        label,
        path: ref.id,
        keys: ref.keys,
        kind,
        display: list ? { unit: " items" } : display,
        sort,
        spread,
        idle: list
          ? `${Array.isArray(idleValue) ? idleValue.length : 0} items`
          : displayValue(idleValue, display, 2).text,
        flag: display.string ? undefined : flagOf(spread, list ? "list" : "number"),
        writer,
      });
    }
    return { index, where, module: m, items };
  });
}

// ---------------------------------------------------------------------------- text

const FLAG_WORDS: Record<Flag, (who: string) => string> = {
  noData: (who) => `No Data for every ${who}`,
  zero: (who) => `0 for every ${who}`,
  empty: (who) => `empty for every ${who}`,
  constant: (who) => `the same for every ${who}`,
};

function pad(text: string, width: number, right = false): string {
  if (text.length >= width) return text;
  return right ? text.padStart(width) : text.padEnd(width);
}

function number(value: number | null, display: DisplayOptions = {}): string {
  if (value === null) return NO_DATA;
  return displayValue(value, { decimals: display.decimals, unit: display.unit }, 2).text;
}

export interface FormatOptions {
  /** How to name the folder in the text. */
  dir: string;
  /** List every value of every entry, not just the ones that look wrong. */
  all?: boolean;
}

/** The preview as text for a terminal: what modules show, then what each entry writes. */
export function formatPreview(preview: Preview, { dir, all = false }: FormatOptions): string {
  const g = preview.generated;
  const others = g.teams - 1;
  const lines: string[] = [
    `Preview of ${dir}: ${g.matches} generated matches (seed "${preview.seed}"), ${g.performances} performances of ${g.teams} teams.`,
    `Team ${preview.idleTeam} never does anything; its column shows what such a team gets.`,
    "",
  ];

  if (preview.modules === null) {
    lines.push("analysis-modules.json is not valid, so the modules are not shown.", "");
  } else {
    lines.push(`What the modules show, across the other ${others} teams`);
    const rows: { label: string; cells: string[]; note?: string }[] = [];
    for (const m of preview.modules) {
      rows.push({ label: m.where, cells: [], note: m.note });
      for (const item of m.items) {
        const who = item.kind === "team" ? "team" : "performance";
        const label = `  ${item.label === item.path ? item.path : `${item.label} (${item.path})`}`;
        if (item.writer === null && !item.path.startsWith("manual.")) {
          rows.push({ label, cells: [], note: "never written by the pipeline" });
          continue;
        }
        const s = item.spread;
        rows.push({
          label,
          cells: [
            number(s.min, item.display),
            number(s.median, item.display),
            number(s.max, item.display),
            item.kind === "team" ? item.idle : "",
          ],
          note: item.flag ? `⚠ ${FLAG_WORDS[item.flag](who)}` : undefined,
        });
      }
    }
    const width = Math.min(72, Math.max(...rows.map((r) => r.label.length))) + 2;
    lines.push(
      `${pad("", width)}${["min", "median", "max", preview.idleTeam].map((h) => pad(h, 12, true)).join("")}`,
    );
    for (const r of rows) {
      const cells = r.cells.map((c) => pad(c, 12, true)).join("");
      const note = r.note ? (r.cells.length ? `  ${r.note}` : r.note) : "";
      lines.push(
        r.cells.length || r.note ? `${pad(r.label, width)}${cells}${note}`.trimEnd() : r.label,
      );
    }
    lines.push("");
  }

  lines.push(
    `What each pipeline entry writes, per performance (tmp) or per team${all ? "" : " (--all lists every value)"}`,
  );
  const whereWidth = Math.min(72, Math.max(0, ...preview.entries.map((e) => e.where.length))) + 2;
  for (const e of preview.entries) {
    const who = e.kind === "tmp" ? "performance" : "team";
    const flagged = e.leaves.filter((l) => l.flag && l.flag !== "constant");
    lines.push(
      `${pad(e.where, whereWidth)}${summarize(e)}${e.flag ? `  ⚠ ${FLAG_WORDS[e.flag](who)}` : ""}`,
    );
    const listed = all ? e.leaves : e.flag || e.leaves.length === 1 ? [] : flagged;
    for (const l of listed) {
      lines.push(
        `    ${l.path}  ${describeLeaf(l)}${l.flag ? `  ⚠ ${FLAG_WORDS[l.flag](who)}` : ""}`,
      );
    }
  }
  lines.push("");

  const failed = preview.problems;
  if (failed.length > 0) {
    lines.push(
      `${failed.length} ${failed.length === 1 ? "entry" : "entries"} did not run or failed; npm run config:check says why.`,
      "",
    );
  }
  return lines.join("\n").trimEnd();
}

function summarize(e: EntryPreview): string {
  if (e.leaves.length === 0) return "(did not run)";
  if (e.leaves.length === 1) return describeLeaf(e.leaves[0]);
  const flagged = e.leaves.filter((l) => l.flag && l.flag !== "constant").length;
  return `${e.leaves.length} values${flagged && !e.flag ? `, ${flagged} of them look empty` : ""}`;
}

function describeLeaf(l: LeafPreview): string {
  const s = l.spread;
  if (l.type === "text") return `text, ${l.texts} different`;
  if (l.type === "none") return NO_DATA;
  const unit = l.type === "list" ? " items" : "";
  const range =
    s.min === s.max
      ? `${number(s.min)}${unit}`
      : `${number(s.min)} … ${number(s.median)} … ${number(s.max)}${unit}`;
  return s.noData > 0 ? `${range}, No Data for ${s.noData}` : range;
}

/** One team as the team view would show it: each module's values, with ranks where sorted. */
export function formatTeam(preview: Preview, team: TeamKey): string {
  const data = preview.dataset.teams[team];
  if (!data) {
    const known = Object.keys(preview.dataset.teams);
    return `Team ${team} is not in the generated event. Its teams are ${known.slice(0, 8).join(", ")} and ${known.length - 8} more.`;
  }
  const tmps = preview.dataset.tmps.filter((t) => t.team === team);
  const lines = [
    `Team ${team} in ${preview.generated.matches} generated matches (seed "${preview.seed}"): ${tmps.length} matches played${team === preview.idleTeam ? ", doing nothing in any" : ""}.`,
    "",
  ];
  if (preview.modules === null) {
    lines.push("analysis-modules.json is not valid, so the modules are not shown.");
    return lines.join("\n");
  }
  for (const m of preview.modules) {
    lines.push(m.where);
    if (m.note) {
      lines.push(`  (${m.note})`);
      continue;
    }
    if (m.module.module === "HeatmapScatterPlot") {
      lines.push(...heatmap(m, data));
      continue;
    }
    for (const item of m.items) {
      if (item.kind === "performance") {
        const byMatch = tmps
          .map(
            (t) => `${t.matchNumber}: ${displayValue(valueAt(t, item.path), item.display, 2).text}`,
          )
          .join(", ");
        lines.push(`  ${item.label}, by match: ${byMatch}`);
        continue;
      }
      const shown = displayValue(valueAt(data, item.path), item.display, 2);
      let rank = "";
      if (item.sort !== 0 && shown.value !== null) {
        const values = new Map(
          Object.entries(preview.dataset.teams).map(([t, d]) => [
            t,
            displayValue(valueAt(d, item.path), item.display).value,
          ]),
        );
        const r = rankTeams(values, item.sort).get(team);
        if (r) rank = `   #${r.rank} of ${r.of}`;
      }
      lines.push(`  ${item.label}: ${shown.text}${rank}`);
    }
  }
  return lines.join("\n");
}

/** A heatmap as text: how many recorded positions each action group has for the team. */
function heatmap(m: ModulePreview, data: Record<string, unknown>): string[] {
  const o = m.module.options as {
    coordinatePath: string;
    aggregatedActionsPath: string;
    actionGroups: { name: string; actions: string[] }[];
  };
  const actions = valueAt(data, o.aggregatedActionsPath);
  if (!Array.isArray(actions)) return [`  "${o.aggregatedActionsPath}" holds no list`];
  return o.actionGroups.map((group) => {
    const placed = actions.filter(
      (a) =>
        group.actions.includes((a as { id: string }).id) &&
        valueAt(a, o.coordinatePath) !== undefined,
    );
    return `  ${group.name}: ${placed.length} position${placed.length === 1 ? "" : "s"}`;
  });
}
