# Writing an extension executable

This guide is for programmers. Most games need no code: the built-in executables in the
[Match scouting guide](configuration-guide/match-scouting.md#executables-what-else-a-button-does)
switch screens, set variables, capture field positions, highlight and hide buttons, and record an
action more than once. Write an extension only when no combination of them does what a button
needs. For a new analysis value, see [Writing an extension transformer](extension-transformers.md); for a
new card on the dashboard, [Writing an extension module](extension-modules.md).

An extension is a TypeScript file plus one line in an index file. It is part of the app's build,
so adding or changing one means rebuilding and redeploying; nothing is installed while the app
runs ([ADR 0005](adr/0005-extension-model.md)). The rules are in docs/spec/05 SC-38.

## What an executable can do

An executable runs when its button is pressed, after the executables before it in the button's
list. An extension executable can change **what the scouter sees**, and nothing else:

| it may change | what that is                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| `variables`   | the values `setVariable` sets; a `conditionalLayer` shows buttons by them                             |
| `highlights`  | the ids of highlighted buttons; a highlight shows on every layer that has the button                  |
| `hidden`      | hidden buttons, as `"<layer id>:<button id>"`; a hidden button disappears from its layer until undone |

It cannot change **what is recorded**: the actions a press records, the clock, the screens or
the locks. The session gives it copies of everything, frozen, and keeps only those three fields
of what it returns, so data analysis and the QR code never depend on extension code.

**Undo is automatic.** The session compares the view before and after `execute`, and when the
scouter undoes the press it puts back exactly what changed. There is no `reverse` to write. In
v5 every executable had one, and a wrong one left the screen in a state no press could fix (F-1).

## Steps

1. **Start from the example.** Copy `src/scouting/extensions/examples/pressLimit.ts` to
   `src/scouting/extensions/<yourName>.ts` and change its import from `../../extension-api` to
   `../extension-api`. It hides a button once it has been pressed a set number of times.
2. **Choose a name** that starts with a letter and has only letters, digits and `_`. It cannot be
   a built-in executable's type. Name it for what it does (`pressLimit`, `toggleVariable`), not for
   this year's game, so other seasons and teams can use it.
3. **Describe the options** twice: a TypeScript interface, and a JSON Schema (draft 2020-12) with
   the same shape. The options are the executable's fields on the button other than `type`, so
   `{ "type": "pressLimit", "max": 3 }` has the option `max`. The schema must have
   `"additionalProperties": false`, so a misspelled option is an error rather than silently
   ignored. Give every option a `description`.
4. **Write `execute(view, input)`.**
   - `view` holds `variables`, `highlights` and `hidden`. Return it, or a new one built from it.
     Everything you are given is frozen, so make new objects and lists (`[...view.hidden, key]`)
     rather than changing them.
   - `input.options` are the options, already checked against your schema.
   - `input.press` is this press: its `layer`, `button`, button `type`, the match time remaining
     `ts` in ms, and its `placement` (phase, segment, kind and repeat).
   - `input.earlier` lists the presses before it that undo has not taken back, oldest first.
   - `input.config` is the season's `match-scouting.json`, and `input.settings` gives the scouted
     robot's `alliance` and whether the field is flipped.
   - Throw an `Error` with a clear message for a situation you cannot handle. The press still
     records, and the message goes to the browser console.
   - No network, files or Node APIs: the session runs on the scouter's phone, also with no
     connection. A test fails if anything under `src/scouting` imports Node or calls `fetch`.
5. **Register it** with one line in `src/scouting/extensions/index.ts`, in alphabetical order:

   ```ts
   export { pressLimit } from "./pressLimit";
   ```

6. **Test it** in `tests/unit/`, playing presses through the session with your executable on a
   button; `tests/unit/executables.test.ts` shows how, including undo. `npm test` also checks
   every registered executable automatically: its name is allowed, it has a summary, and its
   schema compiles and rejects an unknown option.
7. **Use it** in `config/match-scouting.json` like a built-in:

   ```json
   "executables": [{ "type": "pressLimit", "max": 3 }]
   ```

   Run `npm run config:check`, `npm test`, `npm run lint` and `npm run typecheck`, then
   `npm run build` and deploy. Try it on the scouting-screen preview (`/scouting-preview`).

## When an extension is wrong

| mistake                                                      | what happens                                                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| a built-in's name, a name with `-`, or registered twice      | the app refuses it with a message naming the executable; tests fail at once                     |
| a schema keyword misspelled (`propertiez`)                   | tests fail; `config:check` reports it as a bug in the executable's code                         |
| a schema that allows unknown options                         | tests fail                                                                                      |
| a type misspelled, or not registered, in the configuration   | `config:check` reports `There is no executable "…"` with the closest name                       |
| an option misspelled or out of range in the configuration    | `config:check` reports it at the option                                                         |
| `execute` throws, changes what it was given, or returns junk | the press records without the executable, and the console says which executable on which button |

The server checks `match-scouting.json` as `config:check` does and refuses a file with errors, so
phones keep the configuration they have until it is fixed (docs/spec/20 CS-17).

Generated matches (`npm run config:preview`, `npm run generate`) do not run extension
executables. They record nothing, so the analysis is the same; only which buttons a generated
scouter presses can differ.

## Contributing it back

If other teams could use your executable, open an issue proposing it as a built-in. A built-in
moves its options into `src/config/schema/match-scouting.schema.json`, so editors know it by name,
and gets a row in the Match scouting guide.
