/**
 * Transformer registry (ADR 0005, docs/spec/09 TR-9 and TR-14).
 *
 * A transformer is registered under its entry type and name (`tmp.countActions`,
 * `team.average`). Every transformer declares a JSON Schema for its options, built-in or not,
 * so a typo in an option is an error rather than silently ignored (CS-10, F-10). Built-in
 * transformers point their schema at `$defs/options` in analysis-pipeline.schema.json, which
 * stays the single source of truth for them; an extension writes its own and may reuse the
 * pipeline schema's definitions with `pipelineDef`.
 *
 * Three shapes, because v5's transformers did three different things:
 * - `tmp`: computes one value per performance, written at the entry's outputPath;
 * - `team`: computes one value per team from that team's performances;
 * - `dataset`: replaces the list of performances (v5's `removeDuplicates`).
 */
import type { ValidateFunction } from "ajv/dist/2020";
import type { MatchScoutingConfig } from "@/config/types";
import type { TeamKey } from "@/data/team";
import { createAjv, toIssues, type ValidationIssue } from "@/lib/json-schema";
import analysisPipelineSchema from "@/config/schema/analysis-pipeline.schema.json";
import type { AnalysisPerformance, Dataset, TeamData } from "./dataset";

export type EntryType = "tmp" | "team";

/** What every transformer can see besides its input and options. */
export interface TransformerContext {
  /** The season's match-scouting configuration (button ids, phases, segments). */
  config: MatchScoutingConfig;
  /** `Dataset.scoreBreakdownIds`; `runPipeline` fills it in from the dataset. */
  scoreBreakdownIds?: readonly string[];
}

export interface TeamInput {
  team: TeamKey;
  /** The team's performances, in dataset order. */
  tmps: readonly AnalysisPerformance[];
  /** The team's object in `dataset.teams`, holding what earlier team entries wrote. */
  data: TeamData;
}

interface Common {
  name: string;
  /** JSON Schema (draft 2020-12) for `options`. Use `{}` only for a transformer with no options. */
  optionsSchema: object;
  /** One line for error messages and the configuration guide. */
  summary: string;
}

export interface TmpTransformer<O = Record<string, unknown>> extends Common {
  type: "tmp";
  scope: "each";
  run(tmp: AnalysisPerformance, options: O, context: TransformerContext): unknown;
}

export interface TeamTransformer<O = Record<string, unknown>> extends Common {
  type: "team";
  scope: "each";
  run(input: TeamInput, options: O, context: TransformerContext): unknown;
}

export interface DatasetTransformer<O = Record<string, unknown>> extends Common {
  type: EntryType;
  scope: "dataset";
  run(dataset: Dataset, options: O, context: TransformerContext): Dataset;
}

export type Transformer<O = Record<string, unknown>> =
  TmpTransformer<O> | TeamTransformer<O> | DatasetTransformer<O>;

/** Identity helper so a transformer's options are typed where it is written. */
export function defineTransformer<O>(transformer: Transformer<O>): Transformer {
  return transformer as unknown as Transformer;
}

/**
 * A reference to a definition in the pipeline schema, such as `pipelineDef("path")` for a dotted
 * path or `pipelineDef("idList")`, so an extension's options read like the built-ins' options.
 */
export function pipelineDef(pointer: string): { $ref: string } {
  return { $ref: `${analysisPipelineSchema.$id}#/$defs/${pointer}` };
}

/** Schema for a built-in transformer's options: a reference into the pipeline schema. */
export function builtInOptions(name: string): object {
  return pipelineDef(`options/${name}`);
}

/** The names a pipeline entry can use (the schema's `entry.name` pattern). */
const NAME = new RegExp(analysisPipelineSchema.$defs.entry.properties.name.pattern);

export function registryKey(type: EntryType, name: string): string {
  return `${type}.${name}`;
}

export class TransformerRegistry {
  private readonly transformers = new Map<string, Transformer>();
  private readonly validators = new Map<string, ValidateFunction>();
  private ajv: ReturnType<typeof createAjv> | null = null;

  constructor(transformers: readonly Transformer[] = []) {
    for (const t of transformers) this.register(t);
  }

  register(transformer: Transformer): void {
    const key = registryKey(transformer.type, transformer.name);
    if (!NAME.test(transformer.name)) {
      throw new Error(
        `transformer ${key}: a name starts with a letter and has only letters, digits and _, or no pipeline entry could use it`,
      );
    }
    if (this.transformers.has(key)) throw new Error(`transformer ${key} is registered twice`);
    this.transformers.set(key, transformer);
  }

  get(type: EntryType, name: string): Transformer | undefined {
    return this.transformers.get(registryKey(type, name));
  }

  /** Registered names for one entry type, sorted, for "did you mean" suggestions. */
  names(type: EntryType): string[] {
    return [...this.transformers.values()]
      .filter((t) => t.type === type)
      .map((t) => t.name)
      .sort();
  }

  /**
   * Check options against the transformer's schema. Throws when the schema itself does not
   * compile (Ajv strict mode, so a misspelled keyword counts): that is a bug in the
   * transformer's code, not in the configuration.
   */
  validateOptions(transformer: Transformer, options: unknown): ValidationIssue[] {
    const key = registryKey(transformer.type, transformer.name);
    let validate = this.validators.get(key);
    if (!validate) {
      if (!this.ajv) {
        this.ajv = createAjv();
        this.ajv.addSchema(analysisPipelineSchema);
      }
      try {
        validate = this.ajv.compile(transformer.optionsSchema);
      } catch (error) {
        throw new Error(
          `The options schema of transformer ${key} does not compile (${error instanceof Error ? error.message : String(error)}).`,
        );
      }
      this.validators.set(key, validate);
    }
    if (validate(options) as boolean) return [];
    const issues = toIssues(validate.errors);
    return issues.length > 0 ? issues : [{ path: "(root)", message: "invalid options" }];
  }
}
