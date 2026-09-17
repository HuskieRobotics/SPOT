# SPOT behavioral oracle

Golden outputs of the legacy analysis pipeline, used as the acceptance target for the SPOT
rewrite (see `claude/17-rewrite-plan-and-next-steps.md`, section 2.1).

`run.js` executes a SPOT analysis pipeline headlessly with the transformer code of **any**
checkout, against an exported set of TeamMatchPerformances, and writes normalized JSON.
It has no dependencies and needs no database or server.

## Layout

```
tools/oracle/
  run.js                     harness
  run-all.sh                 regenerates both seasons (needs a v4.2.0 worktree, see below)
  fixtures/
    db/                      mongoexport (extended JSON) of teamMatchPerformances and events
      2025Reefscape.*.json     2025 database (migrated to ObjectId event numbers)
      2026Rebuilt.*.json       2026 database
    tba/<eventKey>/          recorded TBA v3 responses: matches.json, teams.json, coprs.json
  golden/
    2025ilch_official-v4.2.0/  teams.json, tmps.json, report.json
    2026mnwi_official-HEAD/    teams.json, tmps.json, report.json
```

## Seasons

| Season | Event | Code checkout | Configs | Enrichment |
|--------|-------|---------------|---------|------------|
| 2025 (REEFSCAPE) | `2025ilch_official` | tag `v4.2.0` (post-season release; transformer logic identical to the in-season code, ObjectId schema) | `v4.2.0` defaults (`match-scouting.json`, `analysis-pipeline.json`) | off (did not exist in 2025) |
| 2026 (REBUILT) | `2026mnwi_official` | `HEAD` of `main` (v5.2.x) | repo `config/` | on: TBA score-breakdown synthetic actions + component OPRs (`TBA_OPR_STRINGS` from `config/config.json`) |

## Regenerating

```sh
# one-time: a detached worktree of the 2025 code
git worktree add --detach /path/to/spot-v4.2.0 v4.2.0

# 2025
node tools/oracle/run.js --checkout /path/to/spot-v4.2.0 \
  --tmps tools/oracle/fixtures/db/2025Reefscape.teamMatchPerformances.json \
  --events tools/oracle/fixtures/db/2025Reefscape.events.json \
  --event 2025ilch_official \
  --out tools/oracle/golden/2025ilch_official-v4.2.0

# 2026
node tools/oracle/run.js --checkout . \
  --tmps tools/oracle/fixtures/db/2026Rebuilt.teamMatchPerformances.json \
  --events tools/oracle/fixtures/db/2026Rebuilt.events.json \
  --event 2026mnwi_official \
  --tba tools/oracle/fixtures/tba/2026mnwi --enrich \
  --opr-strings "$(node -e 'console.log(JSON.stringify(require("./config/config.json").TBA_OPR_STRINGS))')" \
  --out tools/oracle/golden/2026mnwi_official-HEAD
```

Or `./tools/oracle/run-all.sh /path/to/spot-v4.2.0`.

## Output conventions

- Object keys are sorted recursively; `dataset.teams` is written as an object keyed by team
  number (the browser holds a sparse array with identical `Object.entries` semantics).
- `NaN`, `Infinity`, `-Infinity`, and `undefined` are written as the strings `"__NaN__"`,
  `"__Infinity__"`, `"__-Infinity__"`, `"__undefined__"` so they survive JSON.
- Mongo bookkeeping (`__v`, per-action `_id`) is removed; `eventNumber` is the ObjectId hex.
- `report.json` lists the transformer registry, any transformer errors, timing, and every
  action id present in the data but absent from the season's `match-scouting.json`
  (`unknownActionIds`). Current `countActions(all)` counts such ids; the 2025-era code
  ignored them (decision: the rewrite keeps current behavior).

## What the rewrite must match

- 2025: `teams.json` and derived `tmps.json` exactly, except at paths affected by
  `unknownActionIds` (if any) where the rewrite counts and the legacy output does not.
- 2026: `teams.json` and derived `tmps.json` exactly, except where a known legacy defect
  listed in `claude/12-rewrite-notes-and-test-plan.md` is deliberately fixed; each such
  difference is recorded alongside the golden file.

TBA fixtures were recorded with a team API key that is **not** stored in this repository.
