# Legacy (v1) configuration files

These are the SPOT v5-and-earlier configuration files, carried over unchanged from `main`
for two purposes:

1. inputs to the v1 → v2 configuration converter and its tests (docs/spec/17, Phase 0 step 4);
2. fixtures for the configuration validation tests (`tests/unit/config-v1.test.ts`, T-3).

The format is documented in `docs/spec/04-configuration.md`. The un-suffixed files
(`match-scouting.json`, `analysis-pipeline.json`, `analysis-modules.json`, `qr.json`,
`analysis-transformers.json`) are the 2026 REBUILT configuration; suffixed files are archived
seasons (2022 Rapid React, 2023 Charged Up, 2024 Crescendo, 2025 Reefscape). `2025v2` was
re-created from the 2025 season in February 2026 (#243). Its match-scouting, modules and QR
files equal the defaults at tag `v4.2.0`, but its pipeline does not: v4.2.0 shipped
`analysis-pipeline-2025-v4.2.0.json` (46 entries, copied from the tag), which is the pipeline
that produced the 2025 golden output of the behavioral oracle. `2025v2`'s pipeline (50 entries)
differs in its drop and miss counts and writes one output to `s.endgame.all`, an apparent typo for
`cycles.endgame.all`.

`manual-teams.json` / `manual-tmps.json` are the (empty) hand-entered-data hooks from
`src/analysis/manual/`. `configInfo.md` is a pre-split description of the button schema.

Known issue: `analysis-pipeline-2024.json` is not valid JSON on `main` (truncated); it is kept
as-is and the tests expect it to fail to parse.

`config.json` (secrets) is git-ignored and must never be added here.
