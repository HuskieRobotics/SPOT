# SPOT behavioral oracle

Golden outputs of the legacy analysis pipeline, used as the acceptance target for the SPOT
rewrite (see `docs/spec/17-rewrite-plan-and-next-steps.md`, section 2.1).

`run.js` executes a SPOT analysis pipeline headlessly with the transformer code of **any**
checkout, against an exported set of TeamMatchPerformances, and writes normalized JSON.
It has no dependencies and needs no database or server.

## Layout

```
tools/oracle/
  run.js                     harness
  run-all.sh                 regenerates every golden set (needs v4.2.0 and v5 worktrees, see below)
  fixtures/
    db/                      mongoexport (extended JSON) of teamMatchPerformances and events
      2025Reefscape.*.json     2025 database (migrated to ObjectId event numbers)
      2026Rebuilt.*.json       2026 database
    tba/<eventKey>/          recorded TBA v3 responses: matches.json, teams.json, coprs.json
    synthetic/               generated TMPs in the v5 shape (docs/spec/22), one set per season
      2025syn.*.json           from config/seasons/2025, seed oracle-2025, 60 matches
      2026syn.*.json           from config/, seed oracle-2026, 60 matches
  golden/
    2025ilch_official-v4.2.0/  teams.json, tmps.json, report.json
    2026mnwi_official-v5/      teams.json, tmps.json, report.json
    2025syn_synthetic-v4.2.0/  the same, for the synthetic 2025 set
    2026syn_synthetic-v5/      the same, for the synthetic 2026 set
```

## Seasons

| Season           | Event               | Code checkout                                                                                                      | Configs                                                             | Enrichment                                                                                        |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 2025 (REEFSCAPE) | `2025ilch_official` | tag `v4.2.0` (post-season release; transformer logic identical to the in-season code, ObjectId schema)             | `v4.2.0` defaults (`match-scouting.json`, `analysis-pipeline.json`) | off (did not exist in 2025)                                                                       |
| 2026 (REBUILT)   | `2026mnwi_official` | legacy v5 code (`main` at commit `902db06`, v5.2.x; on the `v6` branch the legacy tree is gone, so use a worktree) | that checkout's `config/`                                           | on: TBA score-breakdown synthetic actions + component OPRs (`fixtures/opr-strings/2026mnwi.json`) |

Synthetic sets extend the oracle beyond the two real events (doc 17 §2 item 2, T-4). They run
through the same checkouts with enrichment off, since a generated event has no TBA data. The
2026 synthetic report lists 183 unknown action ids: the generator produces every id the v2
configuration can explain, and v5's hand-written enumeration missed many of them (the real
2026 export already showed 32). Legacy `countActions(all)` still counts them, so they are in the
golden output.

## Regenerating

```sh
# one-time: detached worktrees of the 2025 and v5 code
git worktree add --detach /path/to/spot-v4.2.0 v4.2.0
git worktree add --detach /path/to/spot-v5 main        # legacy v5 (or the v5 branch after cutover)

# 2025
node tools/oracle/run.js --checkout /path/to/spot-v4.2.0 \
  --tmps tools/oracle/fixtures/db/2025Reefscape.teamMatchPerformances.json \
  --events tools/oracle/fixtures/db/2025Reefscape.events.json \
  --event 2025ilch_official \
  --out tools/oracle/golden/2025ilch_official-v4.2.0

# 2026
node tools/oracle/run.js --checkout /path/to/spot-v5 \
  --tmps tools/oracle/fixtures/db/2026Rebuilt.teamMatchPerformances.json \
  --events tools/oracle/fixtures/db/2026Rebuilt.events.json \
  --event 2026mnwi_official \
  --tba tools/oracle/fixtures/tba/2026mnwi --enrich \
  --opr-strings tools/oracle/fixtures/opr-strings/2026mnwi.json \
  --out tools/oracle/golden/2026mnwi_official-v5
```

Or `./tools/oracle/run-all.sh /path/to/spot-v4.2.0 /path/to/spot-v5`, which also regenerates the
synthetic inputs from their seeds and runs them. `report.json` records the checkout's folder name
and commit (`checkoutCommit`), but no absolute path or timing, so a regeneration that changes
nothing leaves the files unchanged. `tests/unit/oracle-golden.test.ts` fails if the generator no
longer reproduces the committed synthetic inputs; after a deliberate generator change, rerun
`run-all.sh` so inputs and golden output move together.

## Output conventions

- Object keys are sorted recursively; `dataset.teams` is written as an object keyed by team
  number (the browser holds a sparse array with identical `Object.entries` semantics).
- `NaN`, `Infinity`, `-Infinity`, and `undefined` are written as the strings `"__NaN__"`,
  `"__Infinity__"`, `"__-Infinity__"`, `"__undefined__"` so they survive JSON.
- Mongo bookkeeping (`__v`, per-action `_id`) is removed; `eventNumber` is the ObjectId hex.
- `report.json` lists input (`tmpCount`) and derived (`derivedTmpCount`, after the pipeline; the
  2026 pipeline's `removeDuplicates` drops re-scouted robot/match pairs) TMP counts, the transformer registry, any transformer errors, timing, and every
  action id present in the data but absent from the season's `match-scouting.json`
  (`unknownActionIds`). Current `countActions(all)` counts such ids; the 2025-era code
  ignored them (decision: the rewrite keeps current behavior).

## Comparing the v6 engine (#310)

`tools/oracle/compare.ts` migrates a set's legacy input to v6 documents, runs the v6 engine with
the set's v2 configuration (`sets.ts`), and compares every derived value with the golden files,
leaf by leaf. Stored fields are not compared. Each difference is attributed to the pipeline entry
whose `outputPath` covers it.

```sh
npm run oracle:compare                          # every set
npm run oracle:compare -- 2025ilch_official-v4.2.0 --entries --diffs 20
npm run oracle:compare -- --feed                # each transformer on its own
```

Expected differences live in `divergences.json`, never in the golden files. Each rule names
the legacy values it accepts, the value v6 must produce instead (`"(any)"` for a field only v6
has, such as an action's period), optionally the sets and output paths it applies to, and the
requirement or defect behind it (DM-1b's `null`, for example). A `rename` rule instead reads a
legacy key under v6's name (v4.2.0's `cycle` wrote `pickup` where v5 and v6 write `starts`).

v6 never analyzes a superseded performance (docs/spec/09 TR-5). The migration marks superseded
exactly the re-scouts v5's `removeDuplicates` dropped, so the 2026 sets compare the same 413
performances. v4.2.0 had no `removeDuplicates` and counted the 2025 re-scouts twice, so the 2025
sets feed them in (`includeSuperseded` in `sets.ts`).

`--feed` fills each entry the engine cannot run yet with its golden output, converted to v6
form by the divergence rules, so the entries after it see the inputs legacy gave them. Each
transformer is then checked against v5 on its own, whatever order the transformers are written
in.

`tests/unit/oracle-compare.test.ts` checks every set's structure. For the 2025 sets it also acts
as a ratchet, in fed mode: any entry that runs without problems must match. The 2026 sets join the ratchet when
their composite-id paths are translated (#320, CS-16).

## What the rewrite must match

- 2025: `teams.json` and derived `tmps.json` exactly, except at paths affected by
  `unknownActionIds` (if any) where the rewrite counts and the legacy output does not.
- 2026: `teams.json` and derived `tmps.json` exactly, except where a known legacy defect
  listed in `docs/spec/12-rewrite-notes-and-test-plan.md` is deliberately fixed; each such
  difference is recorded alongside the golden file.

TBA fixtures were recorded with a team API key that is **not** stored in this repository.
