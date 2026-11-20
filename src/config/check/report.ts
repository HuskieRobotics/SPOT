/**
 * Findings of config:check (#317, gate K-2) and the text a student reads.
 */
import type { ConfigKind } from "../validate";
import { indexPositions, locate, type Key } from "./json";
import { describeLocation } from "./locations";

export type Severity = "error" | "warning";

export interface Finding {
  severity: Severity;
  file: ConfigKind;
  /** Keys of what the finding is about, in the file. */
  keys: Key[];
  /** `keys` in words: "entry 6 (tmp actionTime → actionTimes.attemptClimb) › options.actionId". */
  where: string;
  /** What is wrong. */
  message: string;
  /** What to try. */
  hint?: string;
  /** Where to look, 1-based; absent when the file could not be read. */
  line?: number;
  column?: number;
}

export interface CheckReport {
  findings: Finding[];
  errors: number;
  warnings: number;
  /** Checks that could not run, and why ("fix the errors in match-scouting.json first"). */
  skipped: string[];
}

export const CONFIG_FILES: readonly ConfigKind[] = [
  "match-scouting",
  "analysis-pipeline",
  "analysis-modules",
  "qr",
];

export const fileName = (kind: ConfigKind) => `${kind}.json`;

/** Collects findings for one run, describing each location in the file's own terms. */
export class Reporter {
  readonly findings: Finding[] = [];
  private readonly focus = new Map<Finding, Key[]>();

  constructor(private readonly docs: Partial<Record<ConfigKind, unknown>>) {}

  /**
   * Add a finding about `keys`. `focus`, when given, is the exact value to point the line at
   * (the first bad id of a list the finding is about).
   */
  add(
    severity: Severity,
    file: ConfigKind,
    keys: Key[],
    message: string,
    hint?: string,
    focus?: Key[],
  ): Finding {
    const finding: Finding = {
      severity,
      file,
      keys,
      where: describeLocation(file, this.docs[file], keys),
      message,
      ...(hint ? { hint } : {}),
    };
    this.findings.push(finding);
    if (focus) this.focus.set(finding, focus);
    return finding;
  }

  error(file: ConfigKind, keys: Key[], message: string, hint?: string, focus?: Key[]): Finding {
    return this.add("error", file, keys, message, hint, focus);
  }

  warning(file: ConfigKind, keys: Key[], message: string, hint?: string, focus?: Key[]): Finding {
    return this.add("warning", file, keys, message, hint, focus);
  }

  /** Fill in line numbers from the sources and sort by file, then line. */
  finish(sources: Partial<Record<ConfigKind, string>>, skipped: string[]): CheckReport {
    const indexes = new Map<ConfigKind, Map<string, number>>();
    for (const f of this.findings) {
      if (f.line !== undefined) continue;
      const source = sources[f.file];
      if (source === undefined || this.docs[f.file] === undefined) continue;
      let index = indexes.get(f.file);
      if (!index) {
        index = indexPositions(source);
        indexes.set(f.file, index);
      }
      const at = locate(source, index, this.focus.get(f) ?? f.keys);
      if (at) {
        f.line = at.line;
        f.column = at.column;
      }
    }
    const order = (f: Finding) => CONFIG_FILES.indexOf(f.file);
    const findings = [...this.findings].sort(
      (a, b) => order(a) - order(b) || (a.line ?? 0) - (b.line ?? 0),
    );
    return {
      findings,
      errors: findings.filter((f) => f.severity === "error").length,
      warnings: findings.filter((f) => f.severity === "warning").length,
      skipped,
    };
  }
}

/**
 * The report as text. Each finding starts with `file:line:column`, which VS Code's terminal
 * opens on a click, then says where in words, what is wrong, and what to try.
 */
export function formatReport(report: CheckReport, dir: string): string {
  const lines: string[] = [];
  const base = dir.replace(/\/+$/, "");
  for (const f of report.findings) {
    const at = f.line !== undefined ? `:${f.line}:${f.column}` : "";
    lines.push(`${base}/${fileName(f.file)}${at}  ${f.severity}  ${f.where}`);
    lines.push(`    ${f.message}`);
    if (f.hint) lines.push(`    ${f.hint}`);
    lines.push("");
  }
  for (const s of report.skipped) lines.push(`Skipped: ${s}`);
  if (report.skipped.length > 0) lines.push("");
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  lines.push(
    report.errors > 0
      ? `✗ ${count(report.errors, "error")} and ${count(report.warnings, "warning")} in ${base}/`
      : report.warnings > 0
        ? `✓ No errors in ${base}/, but ${count(report.warnings, "warning")} to look at.`
        : `✓ No errors or warnings in ${base}/.`,
  );
  return lines.join("\n");
}
