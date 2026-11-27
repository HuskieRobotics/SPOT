/**
 * Extension modules' options, checked against each extension's own schema (ADR 0005, #391), as
 * CC-4 checks a transformer's and #362 an executable's. Kept out of the dashboard's code, so the
 * browser carries no schema checker. The modules schema is added first, so an extension's
 * `modulesDef("path")` resolves.
 */
import type { ValidateFunction } from "ajv/dist/2020";
import type { ExtensionModule } from "@/components/analysis/extension-api";
import { createAjv, toIssues, type ValidationIssue } from "@/lib/json-schema";
import analysisModulesSchema from "../schema/analysis-modules.schema.json";
import analysisPipelineSchema from "../schema/analysis-pipeline.schema.json";

const validators = new WeakMap<ExtensionModule, ValidateFunction>();
let ajv: ReturnType<typeof createAjv> | null = null;

/**
 * Check an entry's `options` against the extension's schema. Throws when the schema itself does
 * not compile (Ajv strict mode, so a misspelled keyword counts): that is a bug in the extension's
 * code, not in the configuration.
 */
export function validateModuleOptions(
  extension: ExtensionModule,
  options: unknown,
): ValidationIssue[] {
  let validate = validators.get(extension);
  if (!validate) {
    if (!ajv) {
      ajv = createAjv();
      // The modules schema reaches into the pipeline schema (the heatmap's period filters).
      ajv.addSchema(analysisPipelineSchema);
      ajv.addSchema(analysisModulesSchema);
    }
    try {
      validate = ajv.compile(extension.optionsSchema);
    } catch (error) {
      throw new Error(
        `The options schema of module "${extension.name}" does not compile (${error instanceof Error ? error.message : String(error)}).`,
      );
    }
    validators.set(extension, validate);
  }
  if (validate(options) as boolean) return [];
  const issues = toIssues(validate.errors);
  return issues.length > 0 ? issues : [{ path: "(root)", message: "invalid options" }];
}
