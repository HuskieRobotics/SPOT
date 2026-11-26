/**
 * The executables a button can name (ADR 0005, #362): the built-in types the session runs itself,
 * and the extension executables exported from `src/scouting/extensions/index.ts`.
 *
 * This file is in the scouting client's bundle, so it holds no schema checker: config:check
 * checks extension options (`src/config/check/executables.ts`), and the server sends only a
 * configuration that passed.
 */
import * as extensions from "./extensions";
import type { ExecutableInput, ExecutableView, ExtensionExecutable } from "./extension-api";

/** The types the session runs itself, as match-scouting.schema.json lists them (a test checks). */
export const BUILT_IN_EXECUTABLES: readonly string[] = [
  "layer",
  "conditionalLayer",
  "setVariable",
  "position",
  "constantPosition",
  "exclusiveHighlight",
  "clearHighlight",
  "hide",
  "multiplier",
];

/** The names an extension executable can have. */
export const EXECUTABLE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Extension executables by name. */
export type ExecutableSet = ReadonlyMap<string, ExtensionExecutable>;

/** Every executable exported from src/scouting/extensions/index.ts. */
export const extensionExecutables: readonly ExtensionExecutable[] = Object.values(
  extensions satisfies Record<string, ExtensionExecutable>,
);

/**
 * The app's extension executables, plus `extra` (tests). Refuses a name no button could use, a
 * built-in executable's name, and a name registered twice, naming the executable.
 */
export function createExecutables(extra: readonly ExtensionExecutable[] = []): ExecutableSet {
  const set = new Map<string, ExtensionExecutable>();
  for (const x of [...extensionExecutables, ...extra]) {
    if (!EXECUTABLE_NAME.test(x.name)) {
      throw new Error(
        `extension executable "${x.name}": a name starts with a letter and has only letters, digits and _`,
      );
    }
    if (BUILT_IN_EXECUTABLES.includes(x.name)) {
      throw new Error(
        `extension executable "${x.name}": "${x.name}" is a built-in executable; choose another name`,
      );
    }
    if (set.has(x.name)) throw new Error(`extension executable "${x.name}" is registered twice`);
    set.set(x.name, x);
  }
  return set;
}

let app: ExecutableSet | null = null;

/** The app's extension executables. */
export function appExecutables(): ExecutableSet {
  return (app ??= createExecutables());
}

// ---------------------------------------------------------------------------- running one

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** A frozen copy of each configuration, made once, so an extension cannot change the session's. */
const frozenConfigs = new WeakMap<object, unknown>();

function frozenConfig<C extends object>(config: C): C {
  let frozen = frozenConfigs.get(config) as C | undefined;
  if (!frozen) {
    frozen = deepFreeze(structuredClone(config));
    frozenConfigs.set(config, frozen);
  }
  return frozen;
}

const isValue = (v: unknown) =>
  typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string");

/** Why `value` is not a view, or null when it is one. */
function notAView(value: unknown): string | null {
  if (value === null || typeof value !== "object") return "it returned no view";
  const v = value as Record<string, unknown>;
  const variables = v.variables;
  if (variables === null || typeof variables !== "object" || Array.isArray(variables)) {
    return "variables is not an object";
  }
  for (const [name, value] of Object.entries(variables)) {
    if (!isValue(value)) {
      return `variable "${name}" is ${JSON.stringify(value) ?? String(value)}, not a string, number or true/false`;
    }
  }
  if (!isStrings(v.highlights)) return "highlights is not a list of button ids";
  if (!isStrings(v.hidden)) return "hidden is not a list of buttons";
  return null;
}

export type ExtensionOutcome = { ok: true; view: ExecutableView } | { ok: false; message: string };

/**
 * Run an extension on frozen copies of what it is given, and keep only the three fields it may
 * change. A throw, or a result that is not a view, is an outcome rather than an exception: a press
 * in a match is never lost to an extension's mistake.
 */
export function runExtension(
  extension: ExtensionExecutable,
  view: ExecutableView,
  input: ExecutableInput<Record<string, unknown>>,
): ExtensionOutcome {
  const given = deepFreeze({
    variables: { ...view.variables },
    highlights: [...view.highlights],
    hidden: [...view.hidden],
  });
  const frozenInput = {
    options: deepFreeze(structuredClone(input.options)),
    press: deepFreeze(structuredClone(input.press)),
    earlier: deepFreeze(structuredClone(input.earlier)),
    config: frozenConfig(input.config),
    settings: deepFreeze({ ...input.settings }),
  };
  let result: unknown;
  try {
    result = extension.execute(given, frozenInput);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  const wrong = notAView(result);
  if (wrong) return { ok: false, message: wrong };
  const r = result as ExecutableView;
  return {
    ok: true,
    view: {
      variables: { ...r.variables },
      highlights: [...new Set(r.highlights)],
      hidden: [...new Set(r.hidden)],
    },
  };
}
