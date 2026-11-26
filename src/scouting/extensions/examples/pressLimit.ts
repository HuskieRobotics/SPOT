/**
 * A worked example of an extension executable (ADR 0005, #362), described in
 * docs/extension-executables.md: hide a button once it has been pressed a number of times in
 * the match, such as a preload button pressed once for each game piece a robot can start with.
 * The built-in `hide` is the same thing for one press.
 *
 *     { "type": "pressLimit", "max": 3 }
 *
 * It is not registered, so a button naming "pressLimit" is reported as unknown. To use it, move it
 * up into src/scouting/extensions/ and add its export line to the index there.
 *
 * What it shows:
 * - options typed in TypeScript and described by a JSON Schema that rejects unknown options;
 * - reading the presses before this one, and changing only the view it is given (SC-38);
 * - no reverse: undoing the press that hid the button shows it again, because the session puts
 *   back whatever `execute` changed (T-10).
 */
import { defineExecutable } from "../../extension-api";

/** The options, as a button gives them. The schema below must describe the same shape. */
export interface PressLimitOptions {
  max: number;
}

export const pressLimit = defineExecutable<PressLimitOptions>({
  name: "pressLimit",
  summary: "Hide the button once it has been pressed max times in the match",
  optionsSchema: {
    type: "object",
    // Required for every extension: a misspelled option is an error, not silently ignored.
    additionalProperties: false,
    required: ["max"],
    properties: {
      max: {
        type: "integer",
        minimum: 1,
        description: "How many times the button can be pressed before it is hidden.",
      },
    },
  },
  execute: (view, { options, press, earlier }) => {
    const same = (p: { layer: string; button: string }) =>
      p.layer === press.layer && p.button === press.button;
    const presses = earlier.filter(same).length + 1;
    const key = `${press.layer}:${press.button}`;
    if (presses < options.max || view.hidden.includes(key)) return view;
    // A new list: what the executable is given is frozen.
    return { ...view, hidden: [...view.hidden, key] };
  },
});
