# Active configuration (schema v2)

The four files here drive the v6 application:

| File                     | Schema                                            | Spec                 |
| ------------------------ | ------------------------------------------------- | -------------------- |
| `match-scouting.json`    | `src/config/schema/match-scouting.schema.json`    | docs/spec/04, 05, 20 |
| `analysis-pipeline.json` | `src/config/schema/analysis-pipeline.schema.json` | docs/spec/08, 09, 20 |
| `analysis-modules.json`  | `src/config/schema/analysis-modules.schema.json`  | docs/spec/08, 09, 20 |
| `qr.json`                | `src/config/schema/qr.schema.json`                | docs/spec/03, 20     |

Each file starts with `"$schema"` pointing at its schema, so VS Code validates and
autocompletes while you edit. To check all four files and the references between them, run:

```sh
npm run config:check                          # this folder
npm run config:check -- config/seasons/2025   # another season
```

Each finding gives the file and line, where in words, what is wrong, and what to try
(docs/spec/20 §4). It also runs the pipeline on 120 generated matches, so it reports a path no
entry writes, a module path the pipeline never writes, a value that is empty for every team, and
a ranking that a team that never did anything drops out of. Errors make it exit with 1; look at
each warning, and either fix it or know why it stays. `npm test` validates the files too
(`tests/unit/config-active.test.ts`).

They were produced from the 2026 REBUILT legacy files in `config/v1/` by the converter:

```sh
npm run config:convert -- config/v1 config --opr-strings "$(cat tools/oracle/fixtures/opr-strings/2026mnwi.json)"
npx prettier --write config/*.json
```

Until the 2026 configuration is edited by hand for the new client, the drift test in
`config-active.test.ts` requires these files to equal the converter output. Delete that one
test when you start hand-editing.

`config.json` (server secrets and settings) no longer exists in v6; use environment variables
(`.env.example`). The `v1/` folder holds the legacy configurations used as converter inputs, and
`seasons/` holds converted past seasons as worked examples and oracle inputs (see its README).
