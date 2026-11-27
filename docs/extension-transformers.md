# Writing an extension transformer

This guide is for programmers. Most analysis needs no code: the built-in transformers in
[docs/spec/09](spec/09-transformers-and-modules-catalog.md) are combined in
`config/analysis-pipeline.json`, which students edit without programming. Write an extension
only when no combination of built-ins computes what you need. For a new button executable, see
[Writing an extension executable](extension-executables.md); for a new card on the dashboard,
[Writing an extension module](extension-modules.md).

An extension is a TypeScript file plus one line in an index file. It is part of the app's build,
so adding or changing one means rebuilding and redeploying; nothing is installed while the app
runs ([ADR 0005](adr/0005-extension-model.md)). The rules are in docs/spec/09 TR-14.

## What a transformer is

A transformer computes one value, and the pipeline writes it at the entry's `outputPath`.
It has one of three shapes:

| shape   | `type`, `scope`                  | `run` receives                                                 | used for                        |
| ------- | -------------------------------- | -------------------------------------------------------------- | ------------------------------- |
| tmp     | `"tmp"`, `"each"`                | one performance (one team in one match), with its `actions`    | per-match values: counts, times |
| team    | `"team"`, `"each"`               | `{ team, tmps, data }`: the team's performances in match order | values across a team's matches  |
| dataset | `"tmp"` or `"team"`, `"dataset"` | the whole dataset; returns a new one                           | rare; no built-in uses it       |

Every `run` also receives the entry's `options`, already checked against your schema, and a
`context` holding the season's `match-scouting.json` (`context.config`).

## Steps

1. **Start from the example.** Copy `src/analysis/extensions/examples/median.ts` to
   `src/analysis/extensions/<yourName>.ts` and change its imports from `../../engine/…` to
   `../engine/…`.
2. **Choose a name** that starts with a letter and has only letters, digits and `_`. It cannot be
   a built-in transformer's name, even for the other type. Name it for what it does to the data
   (`median`, `actionStreak`), not for this year's game (`climbScore`), so other seasons and
   teams can use it.
3. **Describe the options** twice: a TypeScript interface, and a JSON Schema (draft 2020-12) with
   the same shape. The schema must have `"additionalProperties": false`, so a misspelled option
   is an error rather than silently ignored. Give every option a `description`; students read
   them when the configuration is checked. Reuse the pipeline schema's definitions where they
   fit, so your options are checked exactly like the built-ins':
   - `pipelineDef("path")`: a dotted path such as `counts.l4`;
   - `pipelineDef("actionIdList")`: a list of button ids (`pipelineDef("actionId")` for one).
     `npm run config:check` then checks that each id exists in `match-scouting.json`, as it does
     for the built-ins;
   - `pipelineDef("periodFilter/properties/phases")`, `…/segments` and `…/kinds`: the period
     filters (docs/spec/20 §2.2). In `run`, `passesFilter(action, options)` from
     `../transformers/periods` keeps the actions in those periods.
4. **Write `run`.**
   - Return the value. Do not write into the performance or team yourself, and do not change
     anything you were given: stored fields are frozen (TR-7), and sorting a list you were
     handed reorders it for every later entry.
   - Missing data is `null` ("No Data"). Read values with `getPath(tmp, path, null)`; skip
     `null` when aggregating, as the built-ins do (TR-12), and return `null` when there is
     nothing to compute. The pipeline turns `NaN`, `Infinity` and `undefined` into `null` anyway.
   - Throw an `Error` whose message names the path and the value for data you cannot use, such as
     a string where a number belongs. The pipeline reports it with the first performance or team
     it failed on, and everything else still runs (TR-10).
   - No network, files or Node APIs: the dashboard runs the pipeline in the browser, also
     offline, from data the page has already loaded (ADR 0005). A test fails if anything under
     `src/analysis` imports Node or calls `fetch`.
5. **Register it** with one line in `src/analysis/extensions/index.ts`, in alphabetical order:

   ```ts
   export { median } from "./median";
   ```

6. **Test it** in `tests/unit/`, with small hand-made inputs whose answer you know;
   `tests/unit/extensions.test.ts` shows how. `npm test` also checks every registered
   transformer automatically: its schema compiles, rejects an unknown option, and its name is
   allowed.
7. **Use it** in `config/analysis-pipeline.json` like any built-in:

   ```json
   {
     "type": "team",
     "name": "median",
     "outputPath": "medians.l4",
     "options": { "path": "counts.l4" }
   }
   ```

   Run `npm test`, `npm run lint` and `npm run typecheck`, then `npm run build` and deploy.

## When an extension is wrong

| mistake                                                 | what happens                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| a built-in's name, a name with `-`, or registered twice | the registry refuses it with a message naming the transformer; tests and the app fail at once |
| a schema keyword misspelled (`propertiez`)              | tests fail; at run time its entries are reported as a bug in the code and skipped             |
| a schema that allows unknown options                    | tests fail                                                                                    |
| an option misspelled in the configuration               | the entry is reported (`Invalid options: options: unknown property "pth"`) and skipped        |
| `run` throws for some teams                             | reported with the count and the first team; the other teams and entries still run             |

## Contributing it back

If other teams could use your transformer, open an issue proposing it as a built-in. A built-in
moves its option schema into `src/config/schema/analysis-pipeline.schema.json`, so editors and
`config:check` know it by name, and gets a row in docs/spec/09.
