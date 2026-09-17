# Active configuration (schema v2)

The four files here drive the v6 application:

| File                     | Schema                                            | Spec                 |
| ------------------------ | ------------------------------------------------- | -------------------- |
| `match-scouting.json`    | `src/config/schema/match-scouting.schema.json`    | docs/spec/04, 05, 20 |
| `analysis-pipeline.json` | `src/config/schema/analysis-pipeline.schema.json` | docs/spec/08, 09, 20 |
| `analysis-modules.json`  | `src/config/schema/analysis-modules.schema.json`  | docs/spec/08, 09, 20 |
| `qr.json`                | `src/config/schema/qr.schema.json`                | docs/spec/03, 20     |

Each file starts with `"$schema"` pointing at its schema, so VS Code validates and
autocompletes while you edit. `npm test` validates them too (`tests/unit/config-active.test.ts`).

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
