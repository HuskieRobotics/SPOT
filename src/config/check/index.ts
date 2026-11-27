/**
 * config:check (#317, gate K-2; T-3): tells a student whether a season's three configuration files
 * are right, before any match is played. Each finding names the file and line, says where in
 * words, what is wrong, and what to try.
 *
 * 1. Each file is read as JSON and validated against its schema (docs/spec/20).
 * 2. Checks the schemas cannot express: references inside match-scouting.json (layers, buttons,
 *    phases, variables), and from the other files into it (the button and period ids options
 *    name, enrichment phases); whether a long match fits one QR code (CC-7); transformer names
 *    and options against the registry, extensions included (TR-14); extension executables' names
 *    and options (#362); module names.
 * 3. The pipeline runs on generated matches (./generated.ts): paths nothing writes, values that
 *    are empty for everyone, rankings a team that never did anything drops out of.
 *
 * A check that compares two files runs only when both passed step 1, so one typo does not bury
 * the report; the report says which checks were skipped. Pure: the caller reads the files, so the
 * same check can run in the browser.
 */
import type { ModuleSet } from "@/components/analysis/extension-modules";
import type { TransformerRegistry } from "@/analysis/engine";
import { createRegistry } from "@/analysis/transformers";
import type { ExecutableSet } from "@/scouting/executables";
import type { AnalysisModulesConfig, AnalysisPipelineConfig, MatchScoutingConfig } from "../types";
import { validateConfig, type ConfigKind } from "../validate";
import { checkModulesFile, checkPipelineFile } from "./analysis";
import { checkOnGeneratedMatches } from "./generated";
import type { GeneratedSummary } from "../simulate";
import { keysFromPointer, parseJson, type Key } from "./json";
import { CONFIG_FILES, fileName, Reporter, type CheckReport } from "./report";
import { checkQr } from "./qr";
import { checkMatchScouting } from "./scouting";

export { CONFIG_FILES, formatReport, type CheckReport, type Finding } from "./report";

export interface CheckOptions {
  /** The transformers to check pipeline entries against; the app's registry by default. */
  registry?: TransformerRegistry;
  /** The extension executables buttons may name; the app's by default (#362). */
  executables?: ExecutableSet;
  /** The extension modules entries may name; the app's by default (#391). */
  modules?: ModuleSet;
  /** Run the pipeline on generated matches (CC-9 to CC-12); default true. */
  generated?: boolean;
}

const ENTRY_KEYS = new Set(["type", "name", "outputPath", "options", "comment"]);

/** Hints for schema messages whose cause is usually the same. */
function schemaHint(
  kind: ConfigKind,
  keys: Key[],
  message: string,
  property?: string,
): string | undefined {
  const aboutVersion =
    (keys.length === 0 && /"version"/.test(message)) ||
    (keys.length === 1 && keys[0] === "version");
  if (aboutVersion) {
    return "This looks like a SPOT v5 (v1) file. Convert it with: npm run config:convert -- <v1 folder> <output folder>";
  }
  if (
    kind === "analysis-pipeline" &&
    keys.length === 3 &&
    keys[0] === "pipeline" &&
    property &&
    !ENTRY_KEYS.has(property)
  ) {
    return `A transformer's options go inside "options": move "${property}" there (docs/spec/12 F-25).`;
  }
  return undefined;
}

/**
 * Check one season's configuration. `sources` holds each file's text; a missing file is reported.
 */
export function checkConfiguration(
  sources: Partial<Record<ConfigKind, string>>,
  options: CheckOptions = {},
): CheckReport {
  const docs: Partial<Record<ConfigKind, unknown>> = {};
  const valid: Partial<Record<ConfigKind, boolean>> = {};
  /** Pipeline entries and modules the schema reported, by index; they are not checked again. */
  const badEntries = new Set<number>();
  const badModules = new Set<number>();
  let enrichmentValid = true;
  const report = new Reporter(docs);
  const skipped: string[] = [];

  for (const kind of CONFIG_FILES) {
    const source = sources[kind];
    if (source === undefined) {
      report.error(
        kind,
        [],
        `${fileName(kind)} is missing.`,
        "A season's configuration has three files: match-scouting.json, analysis-pipeline.json and analysis-modules.json.",
      );
      continue;
    }
    const parsed = parseJson(source);
    if (!parsed.ok) {
      const finding = report.error(
        kind,
        [],
        `${fileName(kind)} is not valid JSON: ${parsed.message}.`,
        parsed.hint,
      );
      Object.assign(finding, parsed.position);
      continue;
    }
    docs[kind] = parsed.value;
    const result = validateConfig(kind, parsed.value);
    valid[kind] = result.ok;
    for (const issue of result.issues) {
      const keys = keysFromPointer(parsed.value, issue.pointer ?? "");
      if (issue.property && issue.message.startsWith("unknown")) keys.push(issue.property);
      if (kind === "analysis-pipeline") {
        if (keys[0] === "pipeline" && typeof keys[1] === "number") badEntries.add(keys[1]);
        if (keys[0] === "enrichment" || keys.length === 0) enrichmentValid = false;
      }
      if (kind === "analysis-modules" && keys[0] === "modules" && typeof keys[1] === "number") {
        badModules.add(keys[1]);
      }
      report.error(
        kind,
        keys,
        issue.message,
        schemaHint(kind, keys, issue.message, issue.property),
      );
    }
  }

  const ms = valid["match-scouting"] ? (docs["match-scouting"] as MatchScoutingConfig) : null;
  if (ms) checkMatchScouting(ms, report, options.executables);
  else if (docs["match-scouting"] !== undefined) {
    skipped.push(
      "checks within match-scouting.json, and of the ids other files name: fix the errors in match-scouting.json first.",
    );
  }

  // A pipeline or modules file with some bad entries is still checked entry by entry, as long as
  // its overall shape is right.
  const pipelineDoc = docs["analysis-pipeline"] as AnalysisPipelineConfig | undefined;
  const registry = options.registry ?? createRegistry();
  if (pipelineDoc && Array.isArray(pipelineDoc.pipeline)) {
    checkPipelineFile({ pipeline: pipelineDoc, badEntries, enrichmentValid, ms, registry, report });
  }
  const modulesDoc = docs["analysis-modules"] as AnalysisModulesConfig | undefined;
  if (modulesDoc !== undefined && Array.isArray(modulesDoc?.modules)) {
    checkModulesFile({
      modules: modulesDoc,
      badModules,
      ms,
      pipeline: valid["analysis-pipeline"] ? (pipelineDoc ?? null) : null,
      report,
      extensions: options.modules,
    });
  }

  if (ms) checkQr(ms, report);

  // Last, so that what follows from a mistake already reported is not reported again.
  let generated: GeneratedSummary | null = null;
  if (options.generated === false) {
    // A caller that only wants the checks above.
  } else if (ms && pipelineDoc && Array.isArray(pipelineDoc.pipeline)) {
    try {
      generated = checkOnGeneratedMatches({
        ms,
        pipeline: pipelineDoc,
        badEntries,
        enrichmentValid,
        modules: Array.isArray(modulesDoc?.modules) ? (modulesDoc ?? null) : null,
        badModules,
        extensions: options.modules,
        registry,
        report,
      });
    } catch (error) {
      skipped.push(
        `running the pipeline on generated matches failed (${error instanceof Error ? error.message : String(error)}). This is a bug in SPOT, not in the configuration; please report it.`,
      );
    }
  } else if (pipelineDoc !== undefined) {
    skipped.push(
      "running the pipeline on generated matches: fix the errors in match-scouting.json and analysis-pipeline.json first.",
    );
  }

  const result = report.finish(sources, skipped);
  if (generated) result.generated = generated;
  return result;
}
