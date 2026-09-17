# Archived season configurations (schema v2)

Converted copies of past seasons, kept for two reasons:

1. **Worked examples.** 2026 REBUILT is an unusual season: it prefixes recorded ids with the
   period and uses repeating shifts. A typical season looks like `2025/`, which has two phases,
   no prefixes and no segments. Read that one first when writing a new season's configuration.
2. **Oracle inputs.** The behavioral oracle baselines 2025 against tag `v4.2.0`, whose default
   configuration is the `2025v2` set these files were converted from (docs/spec/17).

They are not loaded by the application. The active configuration is `config/*.json`.

Regenerate with:

```sh
npm run config:convert -- config/v1 config/seasons/2025 \
  --match-scouting match-scouting2025v2.json \
  --pipeline analysis-pipeline-2025v2.json \
  --modules analysis-modules-2025v2.json \
  --qr qr.json
npx prettier --write "config/seasons/**/*.json"
```

`tests/unit/config-active.test.ts` validates each set and checks it still equals the converter
output, so these files cannot drift away from the converter.
