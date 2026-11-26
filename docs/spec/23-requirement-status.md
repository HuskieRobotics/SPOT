# 23 — Requirement status by phase

Each phase ends with an audit (document 17 §4). Issues cite the requirements they touch, but
that checks one direction only. The audit checks the other: every requirement the phase owns is
built and tested, or moved to a later phase on purpose; decisions made along the way are in the
spec text; and rules that were only implied are written down. This document records each audit.

**Statuses.**

- **Done**: built, and the tests named check it.
- **Divergence**: built, and the engine deliberately differs from v5; the oracle rules named in
  `tools/oracle/divergences.json` record the difference.
- **Replaced**: a later requirement replaced it, named in the row. Most are v5 descriptions
  kept as history.
- **Later**: belongs to a later phase. The row says what Phase 1 built toward it, if anything.
- **Open**: a gap, with its issue.

Tests are in `tests/unit/`; a row names the file without `.test.ts`. The test's name starts
with the requirement id unless the row quotes another name.

## Phase 1: core engine (audited 2026-11-21, #330)

**Scope** (document 17 §3): the configuration loader, JSON Schema validation and the converter;
the pipeline engine and every built-in transformer as pure TypeScript; the synthetic generator;
the extension loader; and the oracle. Issues #310 to #320 and #326, plus #31.

**Exit criterion: met.** The oracle tests pass on the real and synthetic sets, and T-2 (its
Phase 1 part), T-3 and T-4 are green.

- `npm run oracle:compare`: every set matches entry by entry, with no value differing outside the
  20 reviewed divergence rules. 2025ilch and 2025syn match on 46 of 46 entries each; 2026mnwi
  and 2026syn match on 73 of 73.
- `npm run config:check` gives what document 20 §4 says: 11 errors and 8 warnings for the
  active 2026 files, and 6 errors and 6 warnings for `config/seasons/2025`.
- `npm test`: 543 tests pass, including the ones this audit added.

### What the audit changed

**Spec text that no longer matched what was built:**

1. Document 17 §4 still sent per-game work to issue #333, which is now the checklist page. Its
   oracle practice said to "update the expected fixture", which contradicts CLAUDE.md and
   `tools/oracle/README.md`: the golden files are never edited, and a divergence rule cites
   the defect. Both are corrected, and §5 records Phase 1 as complete.
2. Document 20 §1 still listed the start rules, the manual schedule, the extension contract and
   data model v2 as undecided. Its Source column named unrelated ids for CS-1 (`D-4, F-9`), CS-2
   (`CF-4`), CS-6 (`CF-6, D-3`), CS-10 (`AN-5, F-10`) and CS-15 (`NF-9, A-40`). §3 said a
   prefix changes the recorded ids, which stopped being true with CS-16. §6 still had the phase
   and segment fields to build. All are corrected.
3. Document 09: TR-1, TR-2 and TR-4 describe v5 and now name their v6 successors. The catalog
   listed a `template` transformer that v6 does not have. The authoring rules were v5's and now
   point at TR-7, TR-9 and TR-14.
4. Document 04 describes the v1 files and now opens with where each CF requirement went in v6.
   CF-9a now notes that CS-16 superseded it.
5. Document 13 now says that v6's 2026 ids and paths differ from the v1 files it walks through,
   and that the oracle compares the values through a translation table.
6. Document 12's quirks were numbered K-1 to K-8, the same ids as document 17's gate K. They
   are now Q-1 to Q-8, each with what v6 does. Its D-3 row now notes the CS-16 revision.
7. Document 14's answers 22, 38 and 39 now point at the decisions that replaced them (CS-16,
   TR-15, A-39).
8. Document 21 §6 said the MongoDB driver did not exist and that the database layer comes in
   Phase 1. The driver exists (Phase 0 item 6); the layer is Phase 2's. Document 22 §4 still
   listed the engine's expectations as missing.
9. Document 03 has DM-14's status, and lost a stray `#` that broke a paragraph. The spec README
   lists the current id ranges of documents 20 to 22, and which document each id prefix belongs to.

**Rules that were only implied, now written down:**

- TR-5: flagged performances and partial ones (RT-34) stay in the dataset, and `teams` is in
  team-key order.
- TR-9: all analysis code runs in the browser. It imports nothing from Node, reads no files and
  fetches nothing. A test in `tba-enrichment` already checked this, but only TR-14 (for
  extensions) and DM-11c (for enrichment) said it.
- CS-5: since #315, TBA ids belong in `knownIds`. `extraActionIds` is only for legacy ids the
  migration must explain, and the pipeline never reads it.
- Document 17 §4: the oracle's divergence-rule practice, and this audit as the last step of
  each phase.

**Code:** the dataset's `extraActionIds`, which lists the TBA ids reported at an event, had the
same name as the configuration's `extraActionIds`, which lists legacy ids. It is now
`Dataset.scoreBreakdownIds`.

**Tests:** 66 test names in 11 files gained the ids they check. A new test covers DV-7, whose
hook fields nothing checked. `tests/unit/requirement-status.test.ts` keeps this document true:
every id in its tables is in the spec, every oracle rule it names exists, and a requirement
marked Done or Divergence with a test file is named in a test of that file, unless the row
quotes the test's name.

**Gaps:**

- **DM-14 and AN-11, the hand-entered data hooks:** v6 never decided whether to keep them.
  The engine needs no hook. Decided with the dashboard's data loading in Phase 3, #345.
- **The configuration loader:** no requirement said how the application loads the four files.
  Phase 1 built validation (`src/config/validate.ts`), the checks (`src/config/check/`, which
  read nothing from disk) and the folder reader the scripts use. How pages load and serve the
  files (bundled or fetched, cacheable per OF-5, propagated per OF-8) was left to their first
  user, the scouting-screen preview. **Decided 2026-11-22 (#322):** document 20 CS-17,
  `src/config/load.ts`, tested in `config-load`.
- **#31 (BL-31):** done by DV-2. Actions carry no `_id`, and a test in `engine` checks it.

### Document 09: transformers

| Id      | Status     | Where                                                                                                                                                                           |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TR-1    | Replaced   | by TR-9 (v5's `DataTransformer` class)                                                                                                                                          |
| TR-2    | Replaced   | by TR-9 and TR-14 (v5's marker bundling)                                                                                                                                        |
| TR-3    | Done       | `engine`                                                                                                                                                                        |
| TR-4    | Replaced   | by TR-5 and TR-9                                                                                                                                                                |
| TR-5    | Done       | `engine`, `action-sequence`                                                                                                                                                     |
| TR-6    | Divergence | `engine`, `action-sequence`; rule `performance-order-2026`                                                                                                                      |
| TR-7    | Done       | `engine`                                                                                                                                                                        |
| TR-8    | Done       | `engine`                                                                                                                                                                        |
| TR-9    | Done       | `engine`, `tba-enrichment`                                                                                                                                                      |
| TR-10   | Done       | `engine`, `config-check` (CC-4)                                                                                                                                                 |
| TR-11   | Done       | `arithmetic`                                                                                                                                                                    |
| TR-12   | Done       | `aggregation`; rule `average-keys-2026`                                                                                                                                         |
| TR-13   | Divergence | `action-sequence`; rule `cycles-2026` (F-26)                                                                                                                                    |
| TR-14   | Done       | `extensions`, `config-check` (CC-4)                                                                                                                                             |
| TR-15   | Divergence | `action-sequence`; rules `cycle-pairing-2025`, `cycle-unended-count`, `cycles-2026` (F-28)                                                                                      |
| Catalog | Done       | The 23 transformers in the reference table are the 23 the registry holds (checked 2026-11-21), each tested in `count-actions`, `arithmetic`, `aggregation` or `action-sequence` |

### Document 20: configuration schema v2 and config:check

| Id            | Status   | Where                                                                                                                     |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| CS-1          | Done     | `config-v2-schema`, `config-convert`                                                                                      |
| CS-2          | Done     | `config-convert`; `config-check` (CC-3, "phases and segments in match order")                                             |
| CS-3          | Replaced | by CS-16                                                                                                                  |
| CS-4          | Done     | `config-v2-schema`, `config-convert`, `config-check` (CC-3, #326)                                                         |
| CS-5          | Done     | `config-convert`; `phase` ("round-trips every derived prefix")                                                            |
| CS-6          | Done     | `config-convert` ("match-scouting converts to a valid v2 document" resolves every layer); `config-check` (CC-3)           |
| CS-7          | Done     | `config-v2-schema`                                                                                                        |
| CS-8          | Done     | `config-convert`                                                                                                          |
| CS-9          | Done     | `config-convert`. The scouting client that applies the rules is Phase 2.                                                  |
| CS-10         | Done     | `config-v2-schema`, `engine`, `arithmetic`, `count-actions`                                                               |
| CS-11         | Done     | `config-convert`; `config-check` (CC-2, F-25)                                                                             |
| CS-12         | Done     | `config-convert`, `tba-enrichment`, `config-check` (CC-6)                                                                 |
| CS-13         | Done     | `config-v2-schema`. The modules that read these options are Phase 3.                                                      |
| CS-14         | Later    | `config-convert` widens the id field and CC-7 checks it, but the encoding that replaces the composite-id index is Phase 2 |
| CS-15         | Done     | By design: no settings file and no schema for one (ADR 0003)                                                              |
| CS-16         | Done     | `count-actions`, `config-convert`, `oracle-compare`; rules `action-period-fields`, `counts-every-period-2026`             |
| CC-1 to CC-8  | Done     | `config-check`                                                                                                            |
| CC-9 to CC-12 | Done     | `config-check-generated`                                                                                                  |

### Document 22: synthetic data

| Id            | Status | Where                                         |
| ------------- | ------ | --------------------------------------------- |
| SY-1 to SY-11 | Done   | `synthetic`; SY-4 also by the CLI's own check |

### Document 21: data model v2 (Phase 0, which the engine reads)

| Id                    | Status | Where                                                                                   |
| --------------------- | ------ | --------------------------------------------------------------------------------------- |
| DV-1                  | Done   | `data-schema`, `migrate`, `phase`; rule `action-period-fields`                          |
| DV-2                  | Done   | `data-schema`, `engine` (BL-31)                                                         |
| DV-3                  | Done   | `data-schema`, `team`, `mongo`                                                          |
| DV-4                  | Done   | `data-schema`, `migrate`. Signing in by student ID is Phase 2.                          |
| DV-5, DV-6            | Done   | `data-schema`, `migrate`                                                                |
| DV-7                  | Done   | `data-schema` (the fields exist; Phase 2 and later fill them)                           |
| DV-8                  | Done   | `data-schema`, `migrate`                                                                |
| DV-9                  | Done   | `migrate` ("splits an event code"). Write gating with the join code is Phase 2.         |
| DV-10                 | Done   | `engine` (DM-1b); rules `missing-nan`, `missing-undefined`                              |
| DV-11                 | Done   | `migrate`, `config-convert` (`actionQueue` becomes `actions`)                           |
| DV-12, DV-12a, DV-12b | Later  | The settings document is Phase 2, and the pages that select an event are Phases 2 and 3 |

### Document 03: data model and the analysis dataset

| Id     | Status   | Where                                                                                        |
| ------ | -------- | -------------------------------------------------------------------------------------------- |
| DM-1a  | Done     | `team`, `data-schema`, `engine`                                                              |
| DM-1b  | Done     | `engine`; rules `missing-nan`, `missing-undefined`, `tba-ids-without-tba`, `opr-without-tba` |
| DM-3   | Done     | Kept (Q-3): `phase` places actions by the countdown                                          |
| DM-5a  | Done     | As DV-1                                                                                      |
| DM-7f  | Done     | As DV-8                                                                                      |
| DM-7g  | Done     | `migrate`; `oracle-compare` runs the engine on the migrated inputs                           |
| DM-11  | Replaced | by DM-11a to DM-11c (v5's prefix scan)                                                       |
| DM-11a | Done     | `tba-enrichment`                                                                             |
| DM-11b | Done     | `tba-enrichment`, `count-actions`; rule `tba-ids-start-at-zero-2026`                         |
| DM-11c | Done     | `tba-enrichment`                                                                             |
| DM-12  | Replaced | by TR-5                                                                                      |
| DM-13  | Replaced | by DM-13a                                                                                    |
| DM-13a | Done     | `tba-enrichment`; rule `opr-without-tba`                                                     |
| DM-14  | Open     | #345                                                                                         |
| BL-195 | Later    | A hook for later; the `scouters` collection meets it (DM-7e)                                 |

### Document 08: analysis, data loading

| Id     | Status   | Where                                                                                |
| ------ | -------- | ------------------------------------------------------------------------------------ |
| AN-7   | Done     | As DM-11a                                                                            |
| AN-9   | Done     | `tba-enrichment`, `engine`                                                           |
| AN-10  | Done     | `engine`                                                                             |
| AN-11  | Open     | #345 for manual data; the match list is Phase 3                                      |
| AN-25  | Replaced | by AN-26a                                                                            |
| AN-26a | Later    | Phase 3 builds the CSV in the browser, on the one pipeline Phase 1 built (TR-9, D-5) |

### Document 04: configuration v1

| Id            | Status   | Where                                                                               |
| ------------- | -------- | ----------------------------------------------------------------------------------- |
| CF-1 to CF-14 | Replaced | Each mapped to its v2 successor in document 04, "Where each requirement went in v6" |

### Document 12: tests, decisions, defects and quirks

| Id   | Status     | Where                                                                                                                                                                        |
| ---- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-1  | Done       | `.github/workflows/ci.yml`: lint, typecheck, unit tests, build and end-to-end tests on every pull request                                                                    |
| T-2  | Done       | Its Phase 1 part: every transformer, `getPath` and `setPath`, TBA enrichment and OPRs. Action ids, undo, QR, assignment, schedules, Filter Teams and CSV are Phases 2 and 3. |
| T-3  | Done       | `config-check`, `config-check-generated`, `config-convert`, `config-active`                                                                                                  |
| T-4  | Done       | `oracle-compare`, `oracle-golden`, `synthetic`                                                                                                                               |
| T-9  | Done       | Recorded TBA responses in `tools/oracle/`; no test calls TBA                                                                                                                 |
| D-1  | Done       | A versioned successor with a converter (document 20)                                                                                                                         |
| D-2  | Done       | Game constants are configuration (CS-4, CS-9, CS-12, CS-13). The clients that read them are Phases 2 and 3.                                                                  |
| D-5  | Done       | One pipeline implementation that also runs in the browser (TR-9). The server's calls to itself go with Phases 2 and 3 (#90).                                                 |
| D-7  | Done       | As DM-1a                                                                                                                                                                     |
| D-7a | Done       | As DM-1b                                                                                                                                                                     |
| D-8  | Done       | ES modules and explicit registration (TR-9, TR-14, ADR 0005)                                                                                                                 |
| F-2  | Done       | `aggregation` ("F-2: the tmp variant works")                                                                                                                                 |
| F-3  | Done       | `engine`, `action-sequence`                                                                                                                                                  |
| F-4  | Divergence | For analysis: derived ids (CS-5) and TBA ids from `knownIds` (DM-11b); rule `counts-catalog-ids-2026`. The QR side is Phase 2; CC-7 checks the id field until then.          |
| F-11 | Done       | Gone: v6 has no `analysis-transformers.json`                                                                                                                                 |
| F-19 | Done       | In configuration, as D-2                                                                                                                                                     |
| F-24 | Divergence | `arithmetic`; rule `ratio-falsy-divbyzero-2025`                                                                                                                              |
| F-25 | Divergence | `arithmetic`, `config-check`; rule `ratio-misplaced-divbyzero-2025`                                                                                                          |
| F-26 | Divergence | As TR-13                                                                                                                                                                     |
| F-27 | Done       | `config-check-generated` (CC-10), `config-preview` (MO-3, MO-4). The modules are Phase 3.                                                                                    |
| F-28 | Divergence | As TR-15                                                                                                                                                                     |
| Q-1  | Replaced   | by CS-16                                                                                                                                                                     |
| Q-3  | Done       | As DM-3                                                                                                                                                                      |
| Q-4  | Done       | `count-actions` ("all: counts ids the configuration does not know"), as Q-4 now says                                                                                         |

### Document 14: answers that changed Phase 1

| Id         | Status   | Where                                                                                                     |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------- |
| A-1, A-3   | Done     | JSON configuration for students, and the documented pipeline structure: `docs/configuration-guide/` (K-4) |
| A-5, A-49  | Done     | ADR 0005, TR-14                                                                                           |
| A-13       | Open     | #345                                                                                                      |
| A-14       | Done     | CS-13 (the bands); the page is Phase 3                                                                    |
| A-22, A-23 | Done     | CS-16, CS-5                                                                                               |
| A-34       | Done     | CS-12                                                                                                     |
| A-38       | Replaced | by TR-15                                                                                                  |
| A-39       | Done     | `arithmetic` (explicit `countPaths`, and the converter writing out v5's inference)                        |
| A-40, A-41 | Done     | CS-1, CS-11                                                                                               |
| A-45       | Done     | Document 22                                                                                               |

### Documents 02, 17 and the ADRs

| Id       | Status | Where                                                                                                                                                   |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NF-8     | Done   | As T-1                                                                                                                                                  |
| NF-12    | Done   | `.nvmrc` is 24, and `package.json` requires Node 24 or later                                                                                            |
| NF-13    | Done   | `.vscode/launch.json`: `vscode-launch`                                                                                                                  |
| K-1      | Done   | This audit, `oracle-compare`                                                                                                                            |
| K-2      | Done   | #317: `config-check`, `config-check-generated`                                                                                                          |
| K-3      | Done   | #318: `config-preview`                                                                                                                                  |
| K-4      | Done   | #321: `config-guide`                                                                                                                                    |
| K-5      | Done   | #322: `config-load`, `config-guide`, and the browser test `tests/e2e/scouting-preview.spec.ts`                                                          |
| K-6      | Done   | #333: `config-guide`                                                                                                                                    |
| ADR 0003 | Done   | For the game configuration: four files with schemas. Settings and secrets are Phase 2 and 4.                                                            |
| ADR 0005 | Done   | For transformers (TR-14) and executables (SC-38, #362). Extension modules are Phase 3; their names stay open in the schema until then (document 20 §6). |
