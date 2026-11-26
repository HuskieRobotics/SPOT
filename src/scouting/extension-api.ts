/**
 * What an extension executable is (ADR 0005, #362; docs/spec/05 SC-38). A guide for programmers
 * is in docs/extension-executables.md.
 *
 * A button names an executable by `type`. The built-in types are run by the session's own code
 * (`session.ts`). Any other type is an extension: a TypeScript file in `src/scouting/extensions/`
 * plus one export line in the index there, built into the app.
 *
 * - **Options.** The executable's other fields on the button are its options, described by a JSON
 *   Schema the extension declares. `npm run config:check` checks them, and the server refuses a
 *   configuration whose options are wrong (CS-17), so `execute` only ever sees options that
 *   passed.
 * - **What it may change.** What the scouter sees, never what is recorded (SC-38). It is given
 *   the session's variables, highlights and hidden buttons, and returns them, changed or not.
 *   The actions, the clock, the screens and the locks are out of its reach.
 * - **Undo.** The session works out what `execute` changed and puts it back when the press is
 *   undone, so an extension has no reverse to write and none to get wrong (T-10, F-1).
 */
import type { ButtonType, MatchScoutingConfig } from "@/config/types";
import type { Placement } from "@/data/phase";

/** The part of the session an extension may change. */
export interface ExecutableView {
  /** Variables, as `setVariable` sets them. A conditional layer shows buttons by their values. */
  readonly variables: Readonly<Record<string, string | number | boolean>>;
  /** Highlighted button ids. A highlight shows on every layer that has the button. */
  readonly highlights: readonly string[];
  /** Hidden buttons, as `"<layer id>:<button id>"`. */
  readonly hidden: readonly string[];
}

/** One press of a button, as an extension sees it. */
export interface ExecutablePress {
  layer: string;
  button: string;
  type: ButtonType;
  /** Match time remaining at the press, in ms; 0 after the clock ran out. */
  ts: number;
  /** The phase, segment, kind and repeat the clock was in, or nulls before the match started. */
  placement: Placement;
}

export interface ExecutableInput<O> {
  /** The executable's fields on the button, other than `type`, checked against the schema. */
  options: O;
  /** The press that runs it. */
  press: ExecutablePress;
  /** The presses before it that undo has not taken back, oldest first. */
  earlier: readonly ExecutablePress[];
  /** The season's match-scouting.json. */
  config: MatchScoutingConfig;
  /** The scouted robot's alliance, and whether the field is seen from the other side (SC-28). */
  settings: { alliance: "red" | "blue"; fieldFlipped: boolean };
}

export interface ExtensionExecutable<O = Record<string, unknown>> {
  /**
   * The `type` a button gives. It starts with a letter and has only letters, digits and `_`, and
   * cannot be a built-in executable's type.
   */
  name: string;
  /** One line for the configuration guide and error messages. */
  summary: string;
  /**
   * JSON Schema (draft 2020-12) for the executable's fields other than `type`. It must have
   * `"additionalProperties": false`, so a misspelled option is an error. Use
   * `{ "type": "object", "additionalProperties": false }` for an executable with no options.
   */
  optionsSchema: object;
  /**
   * Runs when the button is pressed, after the executables before it in the button's list.
   * Returns the view, changed or not. Everything it is given is frozen: build new objects
   * rather than changing them. A throw, or a view that is not one, is reported and the press is
   * recorded without this executable.
   */
  execute(view: ExecutableView, input: ExecutableInput<O>): ExecutableView;
}

/** Identity helper so an executable's options are typed where it is written. */
export function defineExecutable<O>(executable: ExtensionExecutable<O>): ExtensionExecutable {
  return executable as unknown as ExtensionExecutable;
}
