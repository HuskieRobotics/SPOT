/**
 * Run an analysis pipeline over a dataset (docs/spec/08 AN-10, docs/spec/09 TR-1 to TR-4).
 *
 * Entries run in order. Before anything runs, every entry is checked: an unknown transformer or
 * invalid options is reported and that entry is skipped, so one typo does not hide every other
 * problem in the file. While running, a failure is caught per entry and reported with the
 * performance or team it failed on; the remaining performances, teams and entries still run.
 * v5 stopped at the first exception and reported nothing a student could act on.
 *
 * Every value an entry writes is normalized so that a missing value is `null`, never `NaN`,
 * `Infinity` or `undefined` (DM-1b).
 */
import type { PipelineEntry } from "@/config/types";
import type { Dataset } from "./dataset";
import { setPath } from "./path";
import type { Transformer, TransformerContext, TransformerRegistry } from "./registry";

export interface PipelineProblem {
  /** Position of the entry in the `pipeline` array, counting from 0. */
  index: number;
  type: PipelineEntry["type"];
  name: string;
  outputPath: string;
  stage: "check" | "run";
  message: string;
  /** Run stage: how many performances or teams failed, and the first one. */
  failed?: { count: number; of: number; first: string };
}

export interface RunResult {
  dataset: Dataset;
  problems: PipelineProblem[];
  /** Indexes of entries that ran (all items, or some items with problems reported). */
  ran: number[];
}

export interface RunOptions {
  registry: TransformerRegistry;
  context: TransformerContext;
}

/** Replace NaN, ±Infinity and undefined with null, all the way down (DM-1b). */
export function normalizeMissing(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = normalizeMissing(value[i]);
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) record[key] = normalizeMissing(record[key]);
  return record;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Closest registered name, for "did you mean" (edit distance, case-insensitive). */
export function suggest(name: string, candidates: readonly string[]): string | null {
  const distance = (a: string, b: string): number => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const current = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = current;
      }
    }
    return row[b.length];
  };
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const d = distance(name.toLowerCase(), c.toLowerCase());
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best !== null && bestDistance <= Math.max(2, Math.floor(name.length / 3)) ? best : null;
}

interface Checked {
  index: number;
  entry: PipelineEntry;
  transformer: Transformer;
  options: Record<string, unknown>;
}

/** Check every entry without running anything. Used by the runner and by `config:check`. */
/** Transformers v6 no longer has, and what replaced them; checked before "did you mean". */
export const RETIRED_TRANSFORMERS: Readonly<Record<string, string>> = {
  removeDuplicates:
    "It is no longer needed: analysis never sees a performance that a re-scout replaced (RT-14a). Remove this entry.",
};

export function checkPipeline(
  entries: readonly PipelineEntry[],
  registry: TransformerRegistry,
): { runnable: Checked[]; problems: PipelineProblem[] } {
  const runnable: Checked[] = [];
  const problems: PipelineProblem[] = [];
  entries.forEach((entry, index) => {
    const base = {
      index,
      type: entry.type,
      name: entry.name,
      outputPath: entry.outputPath,
      stage: "check" as const,
    };
    const transformer = registry.get(entry.type, entry.name);
    if (!transformer) {
      const other = entry.type === "tmp" ? "team" : "tmp";
      const hint = Object.hasOwn(RETIRED_TRANSFORMERS, entry.name)
        ? ` ${RETIRED_TRANSFORMERS[entry.name]}`
        : registry.get(other, entry.name)
          ? ` There is a ${other} transformer with that name; check "type".`
          : (() => {
              const s = suggest(entry.name, registry.names(entry.type));
              return s ? ` Did you mean "${s}"?` : "";
            })();
      problems.push({
        ...base,
        message: `There is no ${entry.type} transformer named "${entry.name}".${hint}`,
      });
      return;
    }
    const options = entry.options ?? {};
    const issues = registry.validateOptions(transformer, options);
    if (issues.length > 0) {
      const detail = issues
        .map((i) => `${i.path === "(root)" ? "options" : `options.${i.path}`}: ${i.message}`)
        .join("; ");
      problems.push({ ...base, message: `Invalid options: ${detail}` });
      return;
    }
    runnable.push({ index, entry, transformer, options });
  });
  return { runnable, problems };
}

export function runPipeline(
  dataset: Dataset,
  entries: readonly PipelineEntry[],
  { registry, context }: RunOptions,
): RunResult {
  const { runnable, problems } = checkPipeline(entries, registry);
  const ran: number[] = [];
  let current = dataset;

  for (const { index, entry, transformer, options } of runnable) {
    const base = {
      index,
      type: entry.type,
      name: entry.name,
      outputPath: entry.outputPath,
      stage: "run" as const,
    };
    ran.push(index);

    if (transformer.scope === "dataset") {
      try {
        current = transformer.run(current, options, context);
      } catch (error) {
        problems.push({ ...base, message: message(error) });
      }
      continue;
    }

    const failures: { count: number; first: { at: string; error: string } | null } = {
      count: 0,
      first: null,
    };
    const fail = (at: string, error: unknown) => {
      failures.count++;
      failures.first ??= { at, error: message(error) };
    };

    if (transformer.type === "tmp") {
      for (const tmp of current.tmps) {
        try {
          setPath(tmp, entry.outputPath, normalizeMissing(transformer.run(tmp, options, context)));
        } catch (error) {
          fail(`performance ${tmp._id} (match ${tmp.matchNumber}, team ${tmp.team})`, error);
        }
      }
    } else {
      const byTeam = new Map<string, typeof current.tmps>();
      for (const tmp of current.tmps) {
        const list = byTeam.get(tmp.team);
        if (list) list.push(tmp);
        else byTeam.set(tmp.team, [tmp]);
      }
      for (const [team, data] of Object.entries(current.teams)) {
        try {
          const value = transformer.run(
            { team, tmps: byTeam.get(team) ?? [], data },
            options,
            context,
          );
          setPath(data, entry.outputPath, normalizeMissing(value));
        } catch (error) {
          fail(`team ${team}`, error);
        }
      }
    }

    if (failures.first) {
      const of =
        transformer.type === "tmp" ? current.tmps.length : Object.keys(current.teams).length;
      problems.push({
        ...base,
        message: failures.first.error,
        failed: { count: failures.count, of, first: failures.first.at },
      });
    }
  }

  return { dataset: current, problems, ran };
}

/** One readable line per problem, for the terminal and for `config:check`. */
export function describeProblem(p: PipelineProblem): string {
  const where = `pipeline entry ${p.index + 1} (${p.type} ${p.name} → ${p.outputPath})`;
  const scope = p.failed
    ? ` [failed for ${p.failed.count} of ${p.failed.of}; first: ${p.failed.first}]`
    : "";
  return `${where}: ${p.message}${scope}`;
}
