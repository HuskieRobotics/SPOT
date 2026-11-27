# Writing an extension module

This guide is for programmers. Most seasons need no code: the built-in modules in the
[Analysis modules guide](configuration-guide/analysis-modules.md#modules) show numbers, tables,
bar and pie charts, a value match by match, radar charts, a heatmap, a grid and dividers. Write an
extension only when none of them shows what the team needs. For a new value to show, see
[Writing an extension transformer](extension-transformers.md): most new displays need a new value,
not a new module.

An extension is a TypeScript file plus one line in an index file. It is part of the app's build,
so adding or changing one means rebuilding and redeploying; nothing is installed while the app
runs ([ADR 0005](adr/0005-extension-model.md)). The rules are in docs/spec/09, "Module framework".

## What a module is

A module draws one card on the analysis dashboard. An entry of `analysis-modules.json` names it by
`module`, gives it a `name` (the card's heading) and `options`:

```json
{
  "view": "team",
  "module": "Percentile",
  "name": "Auto Points",
  "options": { "path": "averageScores.auto" },
  "position": "side"
}
```

The dashboard draws the card and its heading. Your module draws what goes under the heading, from:

| it is given     | what that is                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `options`       | the entry's `options`, already checked against your schema                                                  |
| `teams`         | the teams shown: one team on a team's page, an alliance in Simulate Match                                   |
| `opponents`     | the other alliance, for an entry with `"wholeMatch": true` in Simulate Match; absent elsewhere              |
| `dataset`       | the analysis: `dataset.teams[team]` holds what the pipeline's team entries wrote, `dataset.tmps` each match |
| `module`        | the whole entry                                                                                             |
| `matchScouting` | the season's `match-scouting.json`                                                                          |

It must not change any of them: every module on the page shares them.

**No hooks, and no `"use client"`, in the module's file.** `config:check` reads each module's name
and schema, and so does the server before it sends `analysis-modules.json`. Next.js builds that
server code as server components, where a React hook is a build error and a `"use client"` file is
an empty reference. So the file draws with plain elements, as a function of what it is given, and
may use the dashboard's own components (`Plot` from `../modules/plot` for a chart, `NoChart` and
`Value` from `../modules/frame`), which use hooks of their own. A module that needs state of its
own, such as a choice the viewer makes, puts that part in a second file that starts with
`"use client"` and imports it. A test fails if a file the server reads says `"use client"` or
imports a hook.

## Steps

1. **Start from the example.** Copy
   `src/components/analysis/extensions/examples/percentile.tsx` to
   `src/components/analysis/extensions/<yourName>.tsx` and change its import from
   `../../extension-api` to `../extension-api`. It shows where one team stands among the event's
   teams on a value.
2. **Choose a name** that starts with a letter and has only letters and digits, and that is not a
   built-in module's name. Name it for what it shows (`Percentile`, `Trend`), not for this year's
   game, so other seasons and teams can use it.
3. **Describe the options** twice: a TypeScript interface, and a JSON Schema (draft 2020-12) with
   the same shape. The schema must have `"additionalProperties": false`, so a misspelled option is
   an error rather than silently ignored. Give every option a `description`. For a team value use
   `modulesDef("path")` (a value of each match: `modulesDef("performancePath")`; a button id:
   `modulesDef("actionId")`), so `config:check` checks it as it checks a built-in module's: a path
   the pipeline never writes is an error, with the path probably meant.
4. **Write `component`.** It returns what goes under the heading.
   - A value that is missing or not a number is No Data, never 0 (docs/spec/12 F-27). Show
     "No Data" (`NO_DATA` from `@/analysis/modules/display`), as the built-in modules do.
   - Several teams: say what your module shows for an alliance, or show
     "Shown for one team at a time.", as PerformanceTimePlot does.
   - Use the theme's colours through Tailwind classes (`bg-primary`, `text-muted-foreground`), so
     dark mode works. A chart drawn with `Plot` names them as `"var(--primary)"`.
   - If it throws, the card shows "This module could not be drawn" with the message, and the rest
     of the page carries on.
5. **Register it** with one line in `src/components/analysis/extensions/index.ts`, in alphabetical
   order:

   ```ts
   export { percentile } from "./percentile";
   ```

6. **Test it** in `tests/unit/`: `tests/unit/extension-modules.test.ts` draws the example with
   `renderToStaticMarkup` on a small dataset. `npm test` also checks every registered module
   automatically: its name is allowed, it has a summary, its schema compiles and rejects an unknown
   option, and its file says no `"use client"` and imports no hook.
7. **Use it** in `analysis-modules.json` like a built-in, then run `npm run config:check`,
   `npm test`, `npm run lint` and `npm run typecheck`, then `npm run build` and deploy. Look at it
   on the dashboard (`npm run build && npm start`, then `/analysis`).

## When an extension is wrong

| mistake                                                        | what happens                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| a built-in's name, a name with `_` or `-`, or registered twice | the app refuses it with a message naming the module; tests fail at once                        |
| `"use client"` or a hook in the module's file                  | tests fail, and `npm run build` stops with Next.js's message                                   |
| a schema keyword misspelled (`propertiez`)                     | tests fail; `config:check` reports it as a bug in the module's code                            |
| a schema that allows unknown options                           | tests fail                                                                                     |
| a module misspelled, or not registered, in the configuration   | `config:check` reports `There is no module "…"` with the closest name                          |
| an option misspelled or out of range in the configuration      | `config:check` reports it at the option, and the dashboard's card says the options have errors |
| `component` throws                                             | the card says the module could not be drawn, and the browser console says why                  |

## Contributing it back

If other teams could use your module, open an issue proposing it as a built-in. A built-in moves
its options into `src/config/schema/analysis-modules.schema.json`, so editors know it by name, and
gets a section in the Analysis modules guide.
