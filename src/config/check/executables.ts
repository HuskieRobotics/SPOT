/**
 * Extension executables' options, checked against each extension's own schema (ADR 0005, #362),
 * as CC-4 checks a transformer's. Kept out of `src/scouting/`, so the scouting client's bundle
 * carries no schema checker: the server refuses a configuration that fails here (CS-17).
 */
import type { ValidateFunction } from "ajv/dist/2020";
import { createAjv, toIssues, type ValidationIssue } from "@/lib/json-schema";
import type { ExtensionExecutable } from "@/scouting/extension-api";

const validators = new WeakMap<ExtensionExecutable, ValidateFunction>();
let ajv: ReturnType<typeof createAjv> | null = null;

/**
 * Check an executable's fields other than `type` against the extension's schema. Throws when the
 * schema itself does not compile (Ajv strict mode, so a misspelled keyword counts): that is a bug
 * in the extension's code, not in the configuration.
 */
export function validateExecutableOptions(
  extension: ExtensionExecutable,
  options: unknown,
): ValidationIssue[] {
  let validate = validators.get(extension);
  if (!validate) {
    ajv ??= createAjv();
    try {
      validate = ajv.compile(extension.optionsSchema);
    } catch (error) {
      throw new Error(
        `The options schema of executable "${extension.name}" does not compile (${error instanceof Error ? error.message : String(error)}).`,
      );
    }
    validators.set(extension, validate);
  }
  if (validate(options) as boolean) return [];
  const issues = toIssues(validate.errors);
  return issues.length > 0 ? issues : [{ path: "(root)", message: "invalid options" }];
}
