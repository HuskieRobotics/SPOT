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
git worktree add --detach /path/to/spot-v5 902db06     # the legacy v5 code the 2026 golden sets came from

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
`run-all.sh` so inputs and golden output move together. The 2026 synthetic set was last
regenerated on 2026-11-21 (#326), when the generator began alternating shift kinds; only its
input and golden output changed, as the 2025 input came out byte for byte the same.

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
has, such as an action's period), optionally the sets, output paths and records (performance ids
or team keys) it applies to, and the requirement or defect behind it (DM-1b's `null`, for
example). A rule may accept `"(any)"` legacy value only for a set and paths named precisely
enough to review, such as the cycle outputs a pairing change rewrites; the test enforces that,
and the pinned counts show any change. A `rename` rule instead reads a legacy key under v6's
name (v4.2.0's `cycle` wrote `pickup` where v5 and v6 write `starts`).

### 2026: the translation table (#320)

2026's v5 configuration recorded composite ids (`activeShift1Defense`), so its output paths named
them (`counts.activeShift1Defense`). The native configuration counts by period, so v6 keeps the
same value at `counts.active1.Defense`. `translate.ts` maps each legacy path and value to v6's,
and is **generated from the set's own configuration**, never written by hand: the prefixes in
`match-scouting.json` (the table the migration splits recorded ids with), the score-breakdown
prefixes, and the pipeline's counts grouped by period. The converter rewrites the configuration
with the same functions (`src/config/convert/native.ts`), so the two cannot disagree.

- A legacy count of a composite id is under its period: `averages.autoPassing` is
  `averages.auto.Passing`.
- A TBA score-breakdown count is under its phase: `counts.endgame.endGameTowerRobot_Level3`.
- An id without a prefix was recorded before the match, or only started at 0 by v5: its count
  is under `preMatch`.
- An action copied into an output keeps its button id: a cycle's `starts.id`
  `activeShift1StartShooting` is compared as `StartShooting`.
- A v5 shift number names the first clock slot that shift can be in: `counts.activeShift2Defense`
  is compared with `counts.active3.Defense`. v5 numbered a kind's shifts from the toggle press and
  v6 records the slot (#326), so per-shift values are a reviewed divergence; totals are compared.

Rule paths for 2026 are v6 paths, after this mapping. A set whose configuration has no prefixes
(2025) is compared without a translation.

A set with recorded TBA responses (`tbaDir` in `sets.ts`, 2026mnwi) is enriched from them as
the page would be from live ones (#315); the others run without TBA data, so no score-breakdown
actions are added and component OPRs are null.

v6 never analyzes a superseded performance (docs/spec/09 TR-5). The migration marks superseded
exactly the re-scouts v5's `removeDuplicates` dropped, so the 2026 sets compare the same 413
performances. v4.2.0 had no `removeDuplicates` and counted the 2025 re-scouts twice, so the 2025
sets feed them in (`includeSuperseded` in `sets.ts`).

`--feed` fills each entry the engine cannot run yet with its golden output, converted to v6
form by the divergence rules, so the entries after it see the inputs legacy gave them. Each
transformer is then checked against v5 on its own, whatever order the transformers are written
in. It copies values in legacy's shape, so it serves sets whose paths need no translation (2025);
every 2026 entry runs.

`npm run oracle:compare -- <set> --divergences` lists, for each accepted rule, the output paths it
accepted, with list positions written as `#`.

`tests/unit/oracle-compare.test.ts` checks every set's structure and that every entry runs. Every
set must match the golden output entry by entry, with nothing fed, and each divergence rule must
accept exactly the number of values recorded in the test (#319 for 2025, #320 for 2026, gate
K-1). A change in any count is a change in behavior to look at. Every rule must be applied by at
least one set, so a rule that no longer excuses anything is removed. For 2025, the test also
compares without `cycle-pairing-2025` and checks that every performance whose cycles differ had a
start left without an end, so that rule cannot hide anything else. For 2026 it does the same
without `shift-numbering-2026`: every value that differs must be in a performance (or a team with
a performance) whose v5 shift numbers do not fit the clock, as the migration reports.

### Divergences, reviewed 2026-11-21 (#319, #320, #326) and 2026-11-27 (#392)

Each rule below was checked against the paths it accepts (`--divergences`). The counts are pinned
by the test. Rules are tried in this order; a value goes to the first rule that accepts it.

| Rule                             | Cites                                   | 2025ilch | 2025syn | 2026mnwi | 2026syn | What it accepts, and why that is right                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | --------------------------------------- | -------: | ------: | -------: | ------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing-nan`                    | DM-1b, D-7a                             |    1,635 |   1,345 |    2,651 |   3,231 | Only averages over nothing: cycle times with no cycle to time, per match (`cycle.*.averageTime`) and per team (`cycles.*.averageTime`), and in 2026 the team averages of ratings no match had (`averageScores.*Rating`). v5 divided by zero and wrote NaN; v6 writes null (No Data).                                                     |
| `missing-undefined`              | DM-1b, D-7a                             |        – |       – |       21 |       – | The three component OPRs of the 7 teams TBA had none for. v5 wrote undefined; v6 writes null.                                                                                                                                                                                                                                            |
| `ratio-falsy-divbyzero-2025`     | F-24                                    |       24 |       1 |        – |       – | `algaeAccuracy` (21) and `coralAccuracy` (3) for teams that never attempted: v5 turned the configured `divByZero: 0` into "N/A". These are the 24 of F-24.                                                                                                                                                                               |
| `ratio-misplaced-divbyzero-2025` | F-25, CS-11                             |        3 |       – |        – |       – | `timePerGamePiece` for the 3 teams that never scored: v5 ignored the misplaced `divByZero: 150000`. The other 3 of F-24's 27 "N/A" values.                                                                                                                                                                                               |
| `counts-nonaction-buttons`       | doc 09 countActions (#311)              |    1,964 |   1,824 |    2,036 |   1,824 | Counts and averages of buttons that never record an action, always 0 in v5: `startGame`, `undo`, 2025's `Reef` and `autoScoreCoral`, 2026's shift toggles. v6 counts action buttons only.                                                                                                                                                |
| `counts-catalog-ids-2026`        | F-4, doc 09 countActions (#311)         |        – |       – |    3,054 |   2,736 | Six catalog ids no button records (`activeShift1Fall` …, a misspelling of the button `fall`), always 0 in v5. v6 does not start `extraActionIds` at 0.                                                                                                                                                                                   |
| `cycle-start-key-2025`           | doc 09 cycle (#314)                     |   17,648 |   4,068 |        – |       – | A rename: v4.2.0 called a cycle's first action `pickup`; v5 and v6 call it `starts`. The values themselves are compared.                                                                                                                                                                                                                 |
| `action-period-fields`           | CS-16, DV-1                             |   70,416 |  15,056 |  134,012 |  60,552 | The phase, segment, kind and segment index on a cycle's `starts` and `ending` actions and on each action in a team's `aggregatedActions`. Only v6 actions carry their period.                                                                                                                                                            |
| `cycle-unended-count`            | F-28 (#320)                             |    1,221 |   1,080 |    2,065 |   1,800 | `unendedCount`, the starts that never got an end, which only v6 counts.                                                                                                                                                                                                                                                                  |
| `cycle-pairing-2025`             | F-28 (#320)                             |    4,900 |   3,598 |        – |       – | Cycle values in 2025 performances where a start was left without an end: v5 gave it the next start's end and shifted every later cycle (80 coral cycles over 30 s at 2025ilch; 10 in v6). The test checks every such performance.                                                                                                        |
| `tba-ids-start-at-zero-2026`     | DM-11 (#315)                            |        – |       – |       75 |       – | `counts.auto.autoTowerRobot_None` and `counts.endgame.endGameTowerRobot_None` start at 0. v5's hidden layer never listed the `_None` results.                                                                                                                                                                                            |
| `tba-none-average-2026`          | DM-11, TR-12 (#315)                     |        – |       – |       26 |       – | The team averages of those counts: how often it happened, not 1 for the matches where it did.                                                                                                                                                                                                                                            |
| `tba-ids-without-tba`            | DM-11, DM-1b (#315)                     |        – |       – |        – |   1,824 | The synthetic set ran without TBA data, so v6 lists no score-breakdown ids; v5's catalog started them at 0.                                                                                                                                                                                                                              |
| `opr-without-tba`                | DM-13, DM-1b (#315)                     |        – |       – |        – |     192 | The component OPRs of the synthetic set: null in v6, absent in v5.                                                                                                                                                                                                                                                                       |
| `attempt-climb-2026`             | F-29 (#392)                             |        – |       – |       21 |     262 | When a robot first attempted to climb, per match, and each team's average. v5 asked for `attemptClimb`, which no button records (the button is `AttemptClimb`), and wrote null; the active configuration names the button.                                                                                                               |
| `opr-auto-fuel-2026`             | F-29, CF-3 (#392)                       |        – |       – |       48 |       – | TBA's `Hub Auto Fuel Count`, which "Auto Fuel OPR" in Team Stats reads and v5's OPR strings never asked for: absent in v5, from the recorded COPRs in v6.                                                                                                                                                                                |
| `shift-slots-2026`               | #326, SC-22, DV-1                       |        – |       – |  128,269 |  90,287 | Per-shift counts and their team averages (`counts.active3.*` …). v6 counts a shift by the clock slot; v5 numbered a kind's shifts from the toggle press, so its `activeShift2` was slot 3 or 4. Totals over a kind's shifts are still compared.                                                                                          |
| `shift-numbering-2026`           | #326, SC-22                             |        – |       – |      318 |      60 | Per-shift ratings, and the totals and averages built from per-shift counts, in performances where a v5 shift number does not fit its clock slot (a late or repeated toggle press, a label that did not flip). The test checks every such value against the migration report's `shiftNumbering`.                                          |
| `counts-every-period-2026`       | CS-16, doc 09 countActions (#311, #320) |        – |       – |  141,919 | 100,868 | Counts of 0 where v5 had no key: every period starts every action button at 0 (`counts.shift3.Storing`, the third slot before a kind was selected), while v5's catalog listed only some composite ids. Only 0 is accepted. Per-shift counts are `shift-slots-2026`'s.                                                                    |
| `average-keys-2026`              | TR-12 (#313)                            |        – |       – |       23 |   1,172 | Team averages of the ids v5's catalog did not list, derived from that layer: v5 took an average's keys from the team's first match and averaged each over the matches that had it. The synthetic set presses buttons in periods real scouts rarely did, hence its count.                                                                 |
| `cycles-2026`                    | F-26, F-28, TR-13, CS-16                |        – |       – |   26,765 |  14,984 | 2026's cycle and zone outputs, where every reason at once applies: inactive-shift shooting counts (F-26), cycles cross boundaries (TR-13), filters name whole phases, nothing queues (F-28), and a zone holds until the next zone press. `tests/unit/action-sequence.test.ts` checks the transformers against v5 with v5's own id lists. |
| `performance-order-2026`         | TR-6                                    |        – |       – |    1,448 |       – | Teams 2290, 5822 and 5847 each had a match entered weeks later; v6 keeps match order, v5 submission order, so their joined action lists are in another order and two averages differ in the last digit.                                                                                                                                  |

Removed in the review: `missing-infinity`. Legacy `ratio` guards a zero denominator, and every
other division in v4.2.0 and v5 is an average, which gives NaN, so no golden file holds Infinity.
The issue's other examples need no rule for 2025: F-2 (tmp `averageArray`) and F-3
(`finalActionOccurrence`) are transformers the 2025 pipeline does not use.

## What the rewrite must match

- 2025: `teams.json` and derived `tmps.json` exactly, except where a reviewed divergence above
  applies. Met (#319): both sets match all 46 entries, and the 2025 sets have no unknown ids.
- 2026: `teams.json` and derived `tmps.json` exactly, through the translation table, except
  where a known legacy defect listed in `docs/spec/12-rewrite-notes-and-test-plan.md` is
  deliberately fixed; each such difference is a reviewed divergence. Met (#320): both sets match
  all 73 entries.

TBA fixtures were recorded with a team API key that is **not** stored in this repository.
