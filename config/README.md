# Active configuration (schema v2)

New to these files? Read the [Configuration Guide](../docs/configuration-guide/README.md), which
starts with a 25-minute walk-through.

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

To see what the pipeline computes and what each module would show, before any match is played:

```sh
npm run config:preview                              # this folder, on 80 generated matches
npm run config:preview -- config --team 3061        # one team, as the team view shows it
```

Values marked ⚠ are 0, No Data or the same for every team; the full generated dataset is written to
`config-preview.json` (docs/spec/22 §3.2).

To see the scouting screen this folder's `match-scouting.json` describes and play a match on it,
run `npm run dev` and open <http://localhost:3000/scouting-preview> (`?season=2025` for a folder
under `seasons/`). It reads the file on every load (docs/spec/20 CS-17).

They were produced from the 2026 REBUILT legacy files in `config/v1/` by the converter:

```sh
npm run config:convert -- config/v1 config --opr-strings "$(cat tools/oracle/fixtures/opr-strings/2026mnwi.json)"
npx prettier --write config/*.json
```

2026's v5 client put the period in front of each button id (`activeShift1Defense`). The
converter rewrites those ids and paths into native form: button ids with a period filter
(`"phases": ["teleop", "endgame"]`), and counts grouped by period, so a path names the period and
then the button (`counts.active1.Defense`, `counts.preMatch.preloadFuel`). It derives this from
the prefixes in `match-scouting.json`, and warns where a filter covers more periods than v5's list
did (docs/spec/20 §2.2 item 5).

Until the 2026 configuration is edited by hand for the new client, the drift test in
`config-active.test.ts` requires these files to equal the converter output. Delete that one
test when you start hand-editing.

`config.json` (server secrets and settings) no longer exists in v6; use environment variables
(`.env.example`). The `v1/` folder holds the legacy configurations used as converter inputs, and
`seasons/` holds converted past seasons as worked examples and oracle inputs (see its README).
