# Archived season configurations (schema v2)

Converted copies of past seasons, kept for two reasons:

1. **Worked examples.** 2026 REBUILT is an unusual season: it prefixes recorded ids with the
   period and uses repeating shifts. A typical season looks like `2025/`, which has two phases,
   no prefixes and no segments. Read that one first when writing a new season's configuration.
2. **Oracle inputs.** The behavioral oracle baselines 2025 against tag `v4.2.0` (docs/spec/17).
   These files are converted from that tag's default configuration: `match-scouting2025v2.json`
   and `analysis-modules-2025v2.json` equal it, and its pipeline is
   `analysis-pipeline-2025-v4.2.0.json` (see `config/v1/README.md`).

They are not loaded by the application. The active configuration is `config/*.json`.

Regenerate with:

```sh
npm run config:convert -- config/v1 config/seasons/2025 \
  --match-scouting match-scouting2025v2.json \
  --pipeline analysis-pipeline-2025-v4.2.0.json \
  --modules analysis-modules-2025v2.json
npx prettier --write "config/seasons/**/*.json"
```

`tests/unit/config-active.test.ts` validates each set and checks it still equals the converter
output, so these files cannot drift away from the converter.

`npm run config:check -- config/seasons/2025` reports six errors in `analysis-modules.json` and
three warnings about rankings. They are what v4.2.0 shipped (docs/spec/20 §4): four "Team Stats"
lines and the "Barge Points" values read paths the pipeline never wrote, so v5 showed 0.00 for
every team (docs/spec/12 F-27). They stay here because these files must equal the converter output; when you copy 2025
as a starting point, fix them.
