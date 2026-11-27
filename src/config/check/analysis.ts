/**
 * Checks of analysis-pipeline.json and analysis-modules.json against match-scouting.json and the
 * transformer registry (#317, T-3): transformer names and options (extensions included, TR-14),
 * the button and period ids options name, grouping keys, TBA enrichment, and module names.
 */
import { unknownTransformerHint, type TransformerRegistry } from "@/analysis/engine";
import { groupKeys, PRE_MATCH } from "@/analysis/transformers/periods";
import { appModules, type ModuleSet } from "@/components/analysis/extension-modules";
import { actionButtonIds } from "../knownActionIds";
import type { AnalysisModulesConfig, AnalysisPipelineConfig, MatchScoutingConfig } from "../types";
import { keysFromPointer, type Key } from "./json";
import {
  builtInModules,
  findReferences,
  isPeriod,
  moduleOptionsSchema,
  modulesRoot,
  type Reference,
} from "./references";
import type { Reporter } from "./report";
import { validateModuleOptions } from "./extension-modules";
import { nearHint } from "./scouting";
import type { ConfigKind } from "../validate";

const PIPELINE = "analysis-pipeline" as const;
const MODULES = "analysis-modules" as const;

const quoted = (ids: readonly string[]) => ids.map((id) => `"${id}"`).join(", ");

/** What an action id in an option can be, and how to explain one that is none of these. */
export class ActionCatalog {
  readonly actions: Set<string>;
  private readonly extra: Set<string>;
  private readonly otherButtons = new Map<string, string>();
  private readonly tbaPrefixes: string[];
  private readonly knownIds: Set<string>;
  /** v5 period prefixes, longest first, for recognizing a composite id. */
  private readonly periods: { prefix: string; period: string }[] = [];

  constructor(ms: MatchScoutingConfig, pipeline: AnalysisPipelineConfig | null) {
    this.actions = new Set(actionButtonIds(ms));
    this.extra = new Set(ms.extraActionIds);
    for (const layer of ms.layout.layers) {
      for (const b of layer.buttons) {
        if (!this.actions.has(b.id)) this.otherButtons.set(b.id, b.type);
      }
    }
    const tba = pipeline?.enrichment.tba.scoreBreakdown;
    this.tbaPrefixes = tba?.enabled ? tba.prefixes.map((p) => p.prefix) : [];
    this.knownIds = new Set(tba?.knownIds ?? []);
    for (const phase of ms.timing.phases) {
      if (phase.prefix) this.periods.push({ prefix: phase.prefix, period: `phase "${phase.id}"` });
      for (const segment of phase.segments ?? []) {
        const repeats = segment.repeat
          ? Array.from({ length: segment.repeat.count }, (_, i) => String(i + 1))
          : [""];
        for (const n of repeats) {
          const which = n ? ` ${n}` : "";
          if (segment.prefix) {
            this.periods.push({
              prefix: segment.prefix + n,
              period: `segment "${segment.id}"${which}`,
            });
          }
          for (const kind of segment.kinds ?? []) {
            this.periods.push({
              prefix: kind.prefix + n,
              period: `"${kind.id}" ${segment.id}${which}`,
            });
          }
        }
      }
    }
    this.periods.sort((a, b) => b.prefix.length - a.prefix.length);
  }

  isKnown(id: string): boolean {
    return (
      this.actions.has(id) ||
      this.extra.has(id) ||
      this.knownIds.has(id) ||
      this.tbaPrefixes.some((p) => id.startsWith(p) && id.indexOf("_", p.length) > 0)
    );
  }

  /** The button and period a v5 id such as `activeShift1StopShooting` stood for. */
  composite(id: string): { button: string; period: string } | null {
    for (const { prefix, period } of this.periods) {
      if (id.startsWith(prefix) && this.actions.has(id.slice(prefix.length))) {
        return { button: id.slice(prefix.length), period };
      }
    }
    return null;
  }

  /** What to try for ids that are not known; `filters` when the options take period filters. */
  hint(ids: readonly string[], filters = true): string {
    const parts: string[] = [];
    // Buttons whose v5 ids cover the same periods are described together.
    const periodsOf = new Map<string, string[]>();
    const paths: [string, string][] = [];
    for (const id of ids) {
      const c = this.composite(id);
      if (c) {
        periodsOf.set(c.button, [...(periodsOf.get(c.button) ?? []), c.period]);
        continue;
      }
      const type = this.otherButtons.get(id);
      if (type) {
        parts.push(`"${id}" is a ${type} button; only action buttons are recorded.`);
        continue;
      }
      const last = id.split(".").pop() ?? id;
      if (last !== id && this.isKnown(last)) {
        paths.push([id, last]);
        continue;
      }
      const near = nearHint(id, [...this.actions, ...this.extra], "button id");
      if (near.startsWith("Did you mean")) {
        parts.push(ids.length === 1 ? near : `For "${id}", did you mean ${near.slice(13)}`);
      }
    }
    if (paths.length > 0) {
      const [[path, id]] = paths;
      parts.push(
        paths.length === ids.length && ids.length === 1
          ? `It is a path; the button id is "${id}".`
          : paths.length === 1
            ? `"${path}" is a path; the button id is "${id}".`
            : `${paths.length === ids.length ? "They are" : `${paths.length} of them are`} paths; a button id is the last part, such as "${id}".`,
      );
    }
    const composites = this.describeComposites(periodsOf, "It is", "They are");
    parts.push(...composites);
    if (composites.length > 0) {
      parts.push(
        filters
          ? 'v6 records the button id and the period separately: name the button, and choose periods with "phases", "segments" or "kinds" (docs/spec/20 §2.2).'
          : "v6 records the button id and the period separately: name the button (docs/spec/20 §2.2).",
      );
    }
    return parts.join(" ");
  }

  /**
   * What to try for paths that end in a v5 id (`counts.autoStopShooting`), or "" when none does:
   * v6 counts a button once, with its period beside it.
   */
  pathHint(paths: readonly string[]): string {
    const periodsOf = new Map<string, string[]>();
    for (const path of paths) {
      const c = this.composite(path.split(".").pop() ?? path);
      if (c) periodsOf.set(c.button, [...(periodsOf.get(c.button) ?? []), c.period]);
    }
    const one = paths.length === 1;
    const composites = this.describeComposites(
      periodsOf,
      one ? "Its last part is" : "Their last parts are",
      one ? "Its last part is" : "Their last parts are",
    );
    if (composites.length === 0) return "";
    return [
      ...composites,
      'v6 counts a button under its own id and records the period beside it: count it per period with a countActions entry that has "phases", "segments" or "by", then read the button id from that output (docs/spec/20 §2.2).',
    ].join(" ");
  }

  /** One sentence per group of buttons whose v5 ids cover the same periods. */
  private describeComposites(
    periodsOf: ReadonlyMap<string, string[]>,
    one: string,
    many: string,
  ): string[] {
    const byPeriods = new Map<string, { buttons: string[]; periods: string[] }>();
    for (const [button, periods] of periodsOf) {
      const key = periods.join("|");
      const group = byPeriods.get(key) ?? { buttons: [], periods };
      group.buttons.push(button);
      byPeriods.set(key, group);
    }
    return [...byPeriods.values()].map(({ buttons, periods }) =>
      buttons.length === 1 && periods.length === 1
        ? `${one} v5's id for button "${buttons[0]}" in ${periods[0]}.`
        : `${many} v5's ids for button${buttons.length === 1 ? "" : "s"} ${listed(buttons)}${buttons.length === 1 ? "" : " each"} in ${listed(periods, false)}.`,
    );
  }
}

/** "a", "b" and "c"; quoted unless `quote` is false. */
export function listed(items: readonly string[], quote = true): string {
  const q = items.map((i) => (quote ? `"${i}"` : i));
  return q.length <= 1 ? q.join("") : `${q.slice(0, -1).join(", ")} and ${q[q.length - 1]}`;
}

/** The first few ids, and how many more. */
export function someOf(ids: readonly string[], shown = 5): string {
  const head = quoted(ids.slice(0, shown));
  return ids.length > shown ? `${head} and ${ids.length - shown} more` : head;
}

/** Report unknown action ids, one finding per option, pointing at the first bad id. */
function reportActions(
  file: ConfigKind,
  doc: unknown,
  refs: readonly Reference[],
  catalog: ActionCatalog,
  report: Reporter,
): void {
  const groups = new Map<string, { keys: Key[]; refs: Reference[] }>();
  for (const r of refs) {
    if (r.kind !== "action" || catalog.isKnown(r.id)) continue;
    // A list item or a property name is grouped by its list or object; a lone id by itself.
    const last = r.keys[r.keys.length - 1];
    const isValue = typeof last !== "number" && valueAt(doc, r.keys) === r.id;
    const keys = isValue ? r.keys : r.keys.slice(0, -1);
    const key = JSON.stringify(keys);
    const group = groups.get(key) ?? { keys, refs: [] };
    group.refs.push(r);
    groups.set(key, group);
  }
  for (const { keys, refs: bad } of groups.values()) {
    const ids = [...new Set(bad.map((r) => r.id))];
    report.error(
      file,
      keys,
      ids.length === 1
        ? `"${ids[0]}" is not a button id in match-scouting.json.`
        : `${ids.length} ids are not button ids in match-scouting.json: ${someOf(ids)}.`,
      catalog.hint(ids, file === PIPELINE),
      bad[0].keys,
    );
  }
}

function valueAt(doc: unknown, keys: readonly Key[]): unknown {
  let current = doc;
  for (const k of keys) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[k];
  }
  return current;
}

function reportPeriods(
  file: ConfigKind,
  refs: readonly Reference[],
  ms: MatchScoutingConfig,
  report: Reporter,
): void {
  const phases = [...ms.timing.phases.map((p) => p.id), PRE_MATCH];
  const segments = ms.timing.phases.flatMap((p) => (p.segments ?? []).map((s) => s.id));
  const kinds = [
    ...new Set(
      ms.timing.phases.flatMap((p) =>
        (p.segments ?? []).flatMap((s) => (s.kinds ?? []).map((k) => k.id)),
      ),
    ),
  ];
  const valid = { phase: phases, segment: segments, kind: kinds };
  for (const r of refs) {
    if (!isPeriod(r.kind) || valid[r.kind].includes(r.id)) continue;
    const near = nearHint(r.id, valid[r.kind], `${r.kind} id`);
    report.error(
      file,
      r.keys,
      `"${r.id}" is not a ${r.kind} id in match-scouting.json.`,
      r.kind === "phase"
        ? `${near} "${PRE_MATCH}" selects actions recorded before the match starts.`.trim()
        : near,
    );
  }
}

export interface PipelineCheck {
  pipeline: AnalysisPipelineConfig;
  /** Entries the schema already reported; they are not checked again. */
  badEntries: ReadonlySet<number>;
  enrichmentValid: boolean;
  ms: MatchScoutingConfig | null;
  registry: TransformerRegistry;
  report: Reporter;
}

export function checkPipelineFile({
  pipeline,
  badEntries,
  enrichmentValid,
  ms,
  registry,
  report,
}: PipelineCheck): void {
  const catalog = ms ? new ActionCatalog(ms, enrichmentValid ? pipeline : null) : null;
  pipeline.pipeline.forEach((entry, i) => {
    if (badEntries.has(i)) return;
    const keys: Key[] = ["pipeline", i];
    const transformer = registry.get(entry.type, entry.name);
    if (!transformer) {
      report.error(
        PIPELINE,
        [...keys, "name"],
        `There is no ${entry.type} transformer named "${entry.name}".`,
        unknownTransformerHint(entry.type, entry.name, registry) ||
          "The transformers are listed in docs/spec/09.",
      );
      return;
    }
    const options = entry.options ?? {};
    let issues;
    try {
      issues = registry.validateOptions(transformer, options);
    } catch (error) {
      report.error(
        PIPELINE,
        [...keys, "name"],
        error instanceof Error ? error.message : String(error),
        "This is a bug in the transformer's code, not in the configuration. Ask whoever wrote the extension to fix it.",
      );
      return;
    }
    for (const issue of issues) {
      const at = [...keys, "options", ...keysFromPointer(options, issue.pointer ?? "")];
      if (issue.property && issue.message.startsWith("unknown")) at.push(issue.property);
      report.error(PIPELINE, at, `options: ${issue.message}`);
    }
    if (issues.length > 0 || !ms || !catalog) return;

    const refs = findReferences(options, transformer.optionsSchema, [...keys, "options"]);
    reportActions(PIPELINE, pipeline, refs, catalog, report);
    reportPeriods(PIPELINE, refs, ms, report);

    const by = options.by;
    if (by === "phase" || by === "segment") {
      try {
        groupKeys(ms, by);
      } catch (error) {
        report.error(
          PIPELINE,
          [...keys, "options", "by"],
          error instanceof Error ? error.message : String(error),
          "Give those periods different ids in match-scouting.json.",
        );
      }
    }
  });

  if (enrichmentValid) checkEnrichment(pipeline, ms, report);
}

function checkEnrichment(
  pipeline: AnalysisPipelineConfig,
  ms: MatchScoutingConfig | null,
  report: Reporter,
): void {
  const sb = pipeline.enrichment.tba.scoreBreakdown;
  const keys: Key[] = ["enrichment", "tba", "scoreBreakdown"];
  if (ms) {
    const phases = ms.timing.phases.map((p) => p.id);
    sb.prefixes.forEach((p, i) => {
      if (!phases.includes(p.phase)) {
        report.error(
          PIPELINE,
          [...keys, "prefixes", i, "phase"],
          `"${p.phase}" is not a phase id in match-scouting.json, so actions from "${p.prefix}" would belong to no period that a filter or a count by phase expects.`,
          nearHint(p.phase, phases, "phase id"),
        );
      }
    });
  }
  if (!sb.enabled) return;
  if (sb.prefixes.length === 0) {
    report.warning(
      PIPELINE,
      [...keys, "prefixes"],
      "Score-breakdown enrichment is enabled but has no prefixes, so it adds no actions.",
    );
  }
  const known = sb.knownIds ?? [];
  if (known.length === 0) {
    report.warning(
      PIPELINE,
      [...keys, "enabled"],
      'Score-breakdown enrichment is enabled, but "knownIds" lists no ids.',
      'List the ids countActions should start at 0 in every match, such as "endGameTowerRobot_Level3". Without them, a count of a result nobody achieved at an event is No Data instead of 0 (docs/spec/03 DM-11b).',
    );
  }
  known.forEach((id, i) => {
    if (!sb.prefixes.some((p) => id.startsWith(p.prefix))) {
      report.warning(
        PIPELINE,
        [...keys, "knownIds", i],
        `"${id}" does not start with any score-breakdown prefix (${quoted(sb.prefixes.map((p) => p.prefix))}), so enrichment never produces it.`,
      );
    }
  });
}

export interface ModulesCheck {
  modules: AnalysisModulesConfig;
  badModules: ReadonlySet<number>;
  ms: MatchScoutingConfig | null;
  pipeline: AnalysisPipelineConfig | null;
  report: Reporter;
  /** The extension modules entries may name; the app's by default (#391). */
  extensions?: ModuleSet;
}

const BUILT_IN_MODULES = builtInModules();

export function checkModulesFile({
  modules,
  badModules,
  ms,
  pipeline,
  report,
  extensions = appModules(),
}: ModulesCheck): void {
  const catalog = ms ? new ActionCatalog(ms, pipeline) : null;
  modules.modules.forEach((m, i) => {
    if (badModules.has(i)) return;
    const keys: Key[] = ["modules", i];
    if (BUILT_IN_MODULES.includes(m.module)) {
      if (!catalog) return;
      const refs = findReferences(
        m.options,
        moduleOptionsSchema(m.module),
        [...keys, "options"],
        modulesRoot,
      );
      reportActions(MODULES, modules, refs, catalog, report);
      return;
    }
    // An extension module (ADR 0005, #391): registered, and its options as its schema says.
    const extension = extensions.get(m.module);
    if (!extension) {
      report.error(
        MODULES,
        [...keys, "module"],
        `There is no module "${m.module}".`,
        nearHint(m.module, [...BUILT_IN_MODULES, ...extensions.keys()], "module"),
      );
      return;
    }
    let issues;
    try {
      issues = validateModuleOptions(extension, m.options);
    } catch (error) {
      report.error(
        MODULES,
        [...keys, "module"],
        error instanceof Error ? error.message : String(error),
        "This is a bug in the module's code, not in the configuration. Ask whoever wrote the extension to fix it.",
      );
      return;
    }
    for (const issue of issues) {
      const at: Key[] = [...keys, "options", ...keysFromPointer(m.options, issue.pointer ?? "")];
      if (issue.property && issue.message.startsWith("unknown")) at.push(issue.property);
      report.error(MODULES, at, issue.message, `${m.module}: ${extension.summary}.`);
    }
    if (!catalog || issues.length > 0) return;
    const refs = findReferences(m.options, extension.optionsSchema, [...keys, "options"]);
    reportActions(MODULES, modules, refs, catalog, report);
  });
}
