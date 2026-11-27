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
  **Decided 2026-11-26 (#382): dropped.**
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
| TR-10   | Done       | `engine`, `config-check` (CC-4); the dashboard lists the problems, in the browser test `tests/e2e/analysis.spec.ts`                                                             |
| TR-11   | Done       | `arithmetic`                                                                                                                                                                    |
| TR-12   | Done       | `aggregation`; rule `average-keys-2026`                                                                                                                                         |
| TR-13   | Divergence | `action-sequence`; rule `cycles-2026` (F-26)                                                                                                                                    |
| TR-14   | Done       | `extensions`, `config-check` (CC-4)                                                                                                                                             |
| TR-15   | Divergence | `action-sequence`; rules `cycle-pairing-2025`, `cycle-unended-count`, `cycles-2026` (F-28)                                                                                      |
| Catalog | Done       | The 23 transformers in the reference table are the 23 the registry holds (checked 2026-11-21), each tested in `count-actions`, `arithmetic`, `aggregation` or `action-sequence` |

### Document 20: configuration schema v2 and config:check

| Id            | Status   | Where                                                                                                                                   |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| CS-1          | Done     | `config-v2-schema`, `config-convert`                                                                                                    |
| CS-2          | Done     | `config-convert`; `config-check` (CC-3, "phases and segments in match order")                                                           |
| CS-3          | Replaced | by CS-16                                                                                                                                |
| CS-4          | Done     | `config-v2-schema`, `config-convert`, `config-check` (CC-3, #326)                                                                       |
| CS-5          | Done     | `config-convert`; `phase` ("round-trips every derived prefix")                                                                          |
| CS-6          | Done     | `config-convert` ("match-scouting converts to a valid v2 document" resolves every layer); `config-check` (CC-3)                         |
| CS-7          | Done     | `config-v2-schema`                                                                                                                      |
| CS-8          | Done     | `config-convert`                                                                                                                        |
| CS-9          | Done     | `config-convert`, `scouting-session` (the client applies the rules, Phase 2)                                                            |
| CS-10         | Done     | `config-v2-schema`, `engine`, `arithmetic`, `count-actions`                                                                             |
| CS-11         | Done     | `config-convert`; `config-check` (CC-2, F-25)                                                                                           |
| CS-12         | Done     | `config-convert`, `tba-enrichment`, `config-check` (CC-6)                                                                               |
| CS-13         | Done     | `config-v2-schema`; the modules read them (#384 to #387).                                                                               |
| CS-14         | Done     | `qr` (#358): a button index and its period (CS-16), the layout derived from match-scouting.json (DM-15d); CC-7 checks a long match fits |
| CS-15         | Done     | By design: no settings file and no schema for one (ADR 0003)                                                                            |
| CS-16         | Done     | `count-actions`, `config-convert`, `oracle-compare`; rules `action-period-fields`, `counts-every-period-2026`                           |
| CC-1 to CC-8  | Done     | `config-check`                                                                                                                          |
| CC-9 to CC-12 | Done     | `config-check-generated`                                                                                                                |

### Document 22: synthetic data

| Id            | Status | Where                                         |
| ------------- | ------ | --------------------------------------------- |
| SY-1 to SY-11 | Done   | `synthetic`; SY-4 also by the CLI's own check |

### Document 21: data model v2 (Phase 0, which the engine reads)

| Id                    | Status | Where                                                                                                                                                                                                            |
| --------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DV-1                  | Done   | `data-schema`, `migrate`, `phase`; rule `action-period-fields`                                                                                                                                                   |
| DV-2                  | Done   | `data-schema`, `engine` (BL-31)                                                                                                                                                                                  |
| DV-3                  | Done   | `data-schema`, `team`, `mongo`                                                                                                                                                                                   |
| DV-4                  | Done   | `data-schema`, `migrate`, `sign-in` (signing in by student ID, Phase 2)                                                                                                                                          |
| DV-5, DV-6            | Done   | `data-schema`, `migrate`                                                                                                                                                                                         |
| DV-7                  | Done   | `data-schema` (the fields exist; Phase 2 and later fill them)                                                                                                                                                    |
| DV-8                  | Done   | `data-schema`, `migrate`                                                                                                                                                                                         |
| DV-9                  | Done   | `migrate` ("splits an event code"); the join code gates writes in `submission` (Phase 2)                                                                                                                         |
| DV-10                 | Done   | `engine` (DM-1b); rules `missing-nan`, `missing-undefined`                                                                                                                                                       |
| DV-11                 | Done   | `migrate`, `config-convert` (`actionQueue` becomes `actions`)                                                                                                                                                    |
| DV-12, DV-12a, DV-12b | Done   | `admin-page` (Phase 2): the settings document holds the active event (DV-13), chosen and shown by its code. The analysis page lists the events by code and opens the active one first (`analysis-data`, Phase 3) |

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
| DM-14  | Done     | Dropped (#345, decided 2026-11-26): v5 shipped both files empty                              |
| BL-195 | Later    | A hook for later; the `scouters` collection meets it (DM-7e)                                 |

### Document 08: analysis, data loading

| Id     | Status   | Where                                                                        |
| ------ | -------- | ---------------------------------------------------------------------------- |
| AN-7   | Done     | As DM-11a                                                                    |
| AN-9   | Done     | `tba-enrichment`, `engine`                                                   |
| AN-10  | Done     | `engine`                                                                     |
| AN-11  | Done     | The manual data is dropped (DM-14); the match list is `analysis-data` (#389) |
| AN-25  | Replaced | by AN-26a                                                                    |
| AN-26a | Done     | `csv` (#388), and the browser test downloads it                              |

### Document 04: configuration v1

| Id            | Status   | Where                                                                               |
| ------------- | -------- | ----------------------------------------------------------------------------------- |
| CF-1 to CF-14 | Replaced | Each mapped to its v2 successor in document 04, "Where each requirement went in v6" |

### Document 12: tests, decisions, defects and quirks

| Id   | Status     | Where                                                                                                                                                                                                                                                   |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-1  | Done       | `.github/workflows/ci.yml`: lint, typecheck, unit tests, build and end-to-end tests on every pull request                                                                                                                                               |
| T-2  | Done       | Phase 1: every transformer, `getPath` and `setPath`, TBA enrichment and OPRs. Phase 2: action ids and undo in `scouting-session`, QR in `qr`, assignment in `registry`, schedules in `schedule`. Phase 3: Filter Teams in `filter-teams`, CSV in `csv`. |
| T-3  | Done       | `config-check`, `config-check-generated`, `config-convert`, `config-active`                                                                                                                                                                             |
| T-4  | Done       | `oracle-compare`, `oracle-golden`, `synthetic`; in the browser, `tests/e2e/oracle.spec.ts` (#392): what the team view shows is the golden output, through the reviewed divergences                                                                      |
| T-9  | Done       | Recorded TBA responses in `tools/oracle/`; no test calls TBA. The browser tests' server answers TBA from them (#363)                                                                                                                                    |
| D-1  | Done       | A versioned successor with a converter (document 20)                                                                                                                                                                                                    |
| D-2  | Done       | Game constants are configuration (CS-4, CS-9, CS-12, CS-13). The scouting client (Phase 2) and the analysis page (Phase 3: rating bands, the Simulate Match and Auto Pick flags) read them.                                                             |
| D-5  | Done       | One pipeline implementation that also runs in the browser (TR-9). The server no longer calls itself (#90): the page reads public routes and runs the pipeline (`analysis-data`, Phase 3)                                                                |
| D-7  | Done       | As DM-1a                                                                                                                                                                                                                                                |
| D-7a | Done       | As DM-1b                                                                                                                                                                                                                                                |
| D-8  | Done       | ES modules and explicit registration (TR-9, TR-14, ADR 0005)                                                                                                                                                                                            |
| F-2  | Done       | `aggregation` ("F-2: the tmp variant works")                                                                                                                                                                                                            |
| F-3  | Done       | `engine`, `action-sequence`                                                                                                                                                                                                                             |
| F-4  | Divergence | For analysis: derived ids (CS-5) and TBA ids from `knownIds` (DM-11b); rule `counts-catalog-ids-2026`. The QR code carries the button and its period (CS-14, #358), so no id list can drift.                                                            |
| F-11 | Done       | Gone: v6 has no `analysis-transformers.json`                                                                                                                                                                                                            |
| F-19 | Done       | In configuration, as D-2                                                                                                                                                                                                                                |
| F-24 | Divergence | `arithmetic`; rule `ratio-falsy-divbyzero-2025`                                                                                                                                                                                                         |
| F-25 | Divergence | `arithmetic`, `config-check`; rule `ratio-misplaced-divbyzero-2025`                                                                                                                                                                                     |
| F-26 | Divergence | As TR-13                                                                                                                                                                                                                                                |
| F-27 | Done       | `config-check-generated` (CC-10), `config-preview` (MO-3, MO-4), `modules` (#384), `chart-modules` (#385), `filter-teams`, `csv`, `win-chance`; every module without data in the browser test `tests/e2e/modules.spec.ts`                               |
| F-28 | Divergence | As TR-15                                                                                                                                                                                                                                                |
| F-29 | Divergence | Fixed in the active 2026 files (#392): `config-active` (`edit2026`), `config-check`; rules `attempt-climb-2026`, `opr-auto-fuel-2026`                                                                                                                   |
| Q-1  | Replaced   | by CS-16                                                                                                                                                                                                                                                |
| Q-3  | Done       | As DM-3                                                                                                                                                                                                                                                 |
| Q-4  | Done       | `count-actions` ("all: counts ids the configuration does not know"), as Q-4 now says                                                                                                                                                                    |

### Document 14: answers that changed Phase 1

| Id         | Status   | Where                                                                                                     |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------- |
| A-1, A-3   | Done     | JSON configuration for students, and the documented pipeline structure: `docs/configuration-guide/` (K-4) |
| A-5, A-49  | Done     | ADR 0005, TR-14                                                                                           |
| A-13       | Done     | As DM-14: dropped                                                                                         |
| A-14       | Done     | CS-13 (the bands); `filter-teams` (#387)                                                                  |
| A-22, A-23 | Done     | CS-16, CS-5                                                                                               |
| A-34       | Done     | CS-12                                                                                                     |
| A-38       | Replaced | by TR-15                                                                                                  |
| A-39       | Done     | `arithmetic` (explicit `countPaths`, and the converter writing out v5's inference)                        |
| A-40, A-41 | Done     | CS-1, CS-11                                                                                               |
| A-45       | Done     | Document 22                                                                                               |

### Documents 02, 17 and the ADRs

| Id       | Status | Where                                                                                                                                                                           |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NF-8     | Done   | As T-1                                                                                                                                                                          |
| NF-12    | Done   | `.nvmrc` is 24, and `package.json` requires Node 24 or later                                                                                                                    |
| NF-13    | Done   | `.vscode/launch.json`: `vscode-launch`                                                                                                                                          |
| K-1      | Done   | This audit, `oracle-compare`                                                                                                                                                    |
| K-2      | Done   | #317: `config-check`, `config-check-generated`                                                                                                                                  |
| K-3      | Done   | #318: `config-preview`                                                                                                                                                          |
| K-4      | Done   | #321: `config-guide`                                                                                                                                                            |
| K-5      | Done   | #322: `config-load`, `config-guide`, and the browser test `tests/e2e/scouting-preview.spec.ts`                                                                                  |
| K-6      | Done   | #333: `config-guide`                                                                                                                                                            |
| ADR 0003 | Done   | For the game configuration: four files with schemas. The settings document is built (DV-13, Phase 2); the settings page is Phase 4 (R-32), and secrets stay in the environment. |
| ADR 0005 | Done   | For transformers (TR-14), executables (SC-38, #362) and modules (`extension-modules`, #391)                                                                                     |

## Phase 2: scouting vertical slice (audited 2026-11-26, #364)

**Scope** (document 17 §3): the scouting client (landing, sign-in, waiting, the grid, the clock
with its hold and 2×, undo, executables, submission, IndexedDB, QR), the session and assignment
service with its transport, and the admin page's match selection and scouter monitor. Issues
#351 to #364, after the scouting-screen preview (#322, K-5) that began it, and four backlog items
moved in from phase 5: BL-93, BL-54, BL-116 and BL-33.

**Exit criterion: met.** `tests/e2e/acceptance.spec.ts` (#363), run in CI with every browser
test: two scouters on phones and an admin page, against `next start`, the in-memory MongoDB and
TBA's recorded schedule, get assigned, scout and submit, and the records land in MongoDB valid
and correct; the QR code made offline decodes to the record MongoDB stores. Gate W-1 is met.

- `npm test`: 851 tests pass, including the ones this audit added.
- The browser tests: 30 pass, and 2 are skipped by design: two tests that change shared server
  state run in one project only.
- Nothing in the engine changed: `npm run oracle:compare` still matches all four sets entry by
  entry, and `npm run config:check` still gives 11 errors and 8 warnings for the active files
  and 6 and 6 for `config/seasons/2025`, as at Phase 1.

### What the audit changed

**Spec text that no longer matched what was built:**

1. Document 05 described the scouting-screen preview's components as waiting for "the Phase 2
   client", which exists (#359).
2. Document 12: Q-2 still said "Phase 2", and T-7 said the online and offline journeys would
   follow. Both now say what was built and where it is tested.
3. Document 11's v6 route table had no row for `/scouting-preview`.
4. Document 02: NF-1 asked for a manifest locked to landscape. v6's manifest does not lock the
   orientation, because the admin page and, later, analysis are used upright; whether the
   scouting screen refuses portrait is #43. NF-2's install modal is replaced by SC-5's.
5. Document 22 still called the scouting client "the Phase 2 client".
6. Document 17 §5 and the README now record Phase 2 as complete and Phase 3 as next.
7. Phase 1's rows that waited for Phase 2 are updated above: CS-9, CS-14, DV-4, DV-9, DV-12,
   T-2, T-9, D-2, F-4 and ADR 0003.

**Decisions made along the way, checked to be in the spec text:** the transport (ADR 0001,
"Implementation"), the QR layout (document 03 DM-15d to DM-16, document 20 CS-14), the
registry's persistence (document 21 DV-15 and DV-16), how the roster reaches devices (document
12 SEC-7a and SEC-8a), the offline worker and where the client's data lives (document 18, and
OF-5 as reworded in #377), and extension executables (document 05 SC-38).

**Rules that were only implied, now written down:**

- Document 06, "v6: the registry": who gets which robot. Free robots go to waiting scouters in
  sign-in order, red 1 to 3 then blue 1 to 3, skipping one a scouter was released from; a
  scouter who signs in or returns while a match is current gets a free robot at once. The
  acceptance test's replacement depends on it.
- Document 06, "v6: submission and sync": `submittedAt` is the device's clock, so a phone with a
  clock far wrong could win or lose RT-14a's "latest". Accepted, with the reason.

**Tests:** a new test for SC-33 (`constantPosition`), which nothing exercised. The browser
tests now check the landing page's version and links (SC-4, SC-7) and the settings menu
(SC-3). 15 test names in 8 files gained the ids they check. The admin sign-in browser test
pressed "Sign out" by a name that a scouter's card, left by a test running alongside, also
matched, so it failed now and then; it now matches the name exactly. **Code:** the landing page's
feedback link uses the menu's constant instead of a second copy of the address.

**Gaps, each moved on purpose:**

- **SEC-6's aliases and merge** are Phase 4, with the edit page (SEC-6a). Until then a scouter
  added twice under two student IDs stays two records.
- **SEC-1:** the read path already drops private fields (SEC-8, `db`); the public dataset route
  is Phase 3.
- **SEC-5's other admin actions** (flag, edit, delete, the scanner's undo) are Phase 4; demo
  mode is #374. Restart is gone (AD-9).
- **OF-3, OF-4 and the rest of OF-9 and T-7** belong to the analysis page (Phase 3) and the
  scanner and edit pages (Phase 4).
- **ADR 0001's stream through nginx and Cloud Run** is tested with their recipes (W-3).
- **The migration's driver-backed runner** (document 21 §6) runs against the real dump in
  Phase 4.
- **Portrait on the scouting screen** is #43.

### Document 05: the scouting client

| Id             | Status   | Where                                                                                                                             |
| -------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| SC-1           | Done     | `scouting-client`; the browser test `tests/e2e/scouting-client.spec.ts`                                                           |
| SC-2           | Done     | `scouting-session`                                                                                                                |
| SC-3           | Done     | The browser tests `tests/e2e/sign-in.spec.ts` (the menu) and `tests/e2e/scouting-client.spec.ts` (sign out)                       |
| SC-4           | Done     | The browser test `tests/e2e/smoke.spec.ts`: the GitHub issues page. v5's email link is gone                                       |
| SC-5           | Done     | The browser test `tests/e2e/offline.spec.ts`: the manifest, its icons, and the offer once per device                              |
| SC-6           | Done     | As CS-17                                                                                                                          |
| SC-7           | Done     | The browser test `tests/e2e/smoke.spec.ts`. The demo label comes with demo mode (#374)                                            |
| SC-8           | Replaced | Google sign-in is dropped (F-13; #126 closed)                                                                                     |
| SC-9           | Replaced | by SEC-7a: a name from the roster                                                                                                 |
| SC-10, SC-11   | Done     | `scouting-client`; the browser test `tests/e2e/offline.spec.ts`                                                                   |
| SC-12          | Done     | The browser test `tests/e2e/scouting-client.spec.ts`                                                                              |
| SC-13          | Done     | `scouting-client`                                                                                                                 |
| SC-14          | Done     | `scouting-session`; the browser test `tests/e2e/scouting-preview.spec.ts`                                                         |
| SC-15          | Replaced | by the session's state (`src/scouting/session.ts`): v5's bookkeeping on DOM elements                                              |
| SC-16          | Done     | Presentation, seen in the preview; not tested                                                                                     |
| SC-17, SC-18   | Done     | `scouting-session`                                                                                                                |
| SC-19 to SC-21 | Done     | `scouting-clock`, `scouting-session`                                                                                              |
| SC-21a         | Done     | `scouting-clock` (BL-298's hold); BL-230's 2× clock in `scouting-client`                                                          |
| SC-22 to SC-26 | Done     | `scouting-session`; the browser test `tests/e2e/scouting-preview.spec.ts`                                                         |
| SC-27, SC-27b  | Done     | `scouting-session`                                                                                                                |
| SC-27a         | Replaced | by SC-27 (v6): a lock's trigger buttons are configuration (`rules.locks`, CS-9), not a name containing "astop"                    |
| SC-28          | Done     | `scouting-session`, `scouting-client`, `admin-page`                                                                               |
| SC-29 to SC-37 | Done     | `scouting-session`                                                                                                                |
| SC-38          | Done     | `executables`                                                                                                                     |
| SC-39          | Done     | `submission`                                                                                                                      |
| SC-40, SC-42   | Done     | The browser test `tests/e2e/scouting-client.spec.ts`: sent at once, with no reload                                                |
| SC-41          | Done     | The browser tests `tests/e2e/scouting-client.spec.ts`, `tests/e2e/offline.spec.ts` and `tests/e2e/acceptance.spec.ts`             |
| SC-43, SC-44   | Replaced | by the connection (RT-5 to RT-8) and its status line (OF-7), and sending on connecting (RT-28)                                    |
| SC-45          | Replaced | by the stream's `signed-out` (ADR 0001)                                                                                           |
| SC-46 to SC-48 | Replaced | by the stream's messages, each carrying the scouter's whole view, and HTTP actions, whose reply is the acknowledgement (ADR 0001) |
| BL-54          | Done     | `registry`, `scouting-client`                                                                                                     |
| BL-93          | Done     | The browser test `tests/e2e/scouting-client.spec.ts`: the list, its QR codes and **Send now**                                     |
| BL-230         | Done     | `scouting-client`                                                                                                                 |
| BL-298         | Done     | `scouting-clock`                                                                                                                  |

### Document 06: real-time coordination

| Id              | Status   | Where                                                                                                                           |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| RT-1            | Replaced | by `POST /api/scouter/sign-in` and `POST /api/scouter/action` (ADR 0001)                                                        |
| RT-2, RT-3      | Replaced | by `POST /api/scouter/performances` (#360): validated, behind the join code, stored once per nonce (DV-18)                      |
| RT-4            | Replaced | by RT-29                                                                                                                        |
| RT-5            | Done     | `transport`, `scouting-client`                                                                                                  |
| RT-6            | Done     | `scouting-client`                                                                                                               |
| RT-7            | Replaced | The device sends on its own (RT-21); the server never asks                                                                      |
| RT-8            | Done     | `scouting-client` (`signed-out`)                                                                                                |
| RT-9            | Done     | `registry`                                                                                                                      |
| RT-10           | Replaced | by RT-25: a robot anyone holds, connected or not, is not free                                                                   |
| RT-11           | Done     | `registry`. With RT-14a, a seventh scouter waits instead of doubling a robot                                                    |
| RT-12, RT-13    | Replaced | by RT-12a. RT-13's demo start comes with demo mode (#374)                                                                       |
| RT-12a          | Done     | `registry`, `transport`, `admin-page`                                                                                           |
| RT-14, RT-14a   | Done     | `registry`, `submission`                                                                                                        |
| RT-14b          | Done     | `admin-page`; two admins in the browser test `tests/e2e/admin-page.spec.ts`                                                     |
| RT-14c          | Done     | The browser test `tests/e2e/scouter-stream.spec.ts`: an assignment arrives within the 2 to 3 s allowed                          |
| RT-15           | Replaced | by RT-12a's admin start, scoped to the current match                                                                            |
| RT-16           | Done     | `transport`                                                                                                                     |
| RT-17           | Replaced | by the registry's `remove` (RT-29): one action for **Sign out** and **Remove**                                                  |
| RT-18           | Replaced | by `GET /api/admin/registry` (document 11)                                                                                      |
| RT-19, RT-20    | Replaced | by "v6: submission and sync": one request, no question first                                                                    |
| RT-21           | Done     | `submission`                                                                                                                    |
| RT-22, RT-22a   | Done     | `schedule`                                                                                                                      |
| RT-23 to RT-23b | Done     | `schedule`                                                                                                                      |
| RT-24 to RT-36  | Done     | `registry`, `submission`, `transport`, `scouting-client`; both paths of T-6a in the browser test `tests/e2e/acceptance.spec.ts` |

### Document 07: the admin page and the schedule

| Id             | Status   | Where                                                                                                      |
| -------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| AD-1, AD-2     | Replaced | by SEC-4a and SEC-5a: a cookie, checked in `src/proxy.ts`                                                  |
| AD-3           | Replaced | v5 databases are migrated before v6 uses them (`npm run migrate`, document 21 §3)                          |
| AD-4           | Done     | `admin-page`; cards stay (RT-29)                                                                           |
| AD-4a, AD-4b   | Done     | The browser tests `tests/e2e/admin-page.spec.ts` and `tests/e2e/acceptance.spec.ts`                        |
| AD-5 to AD-7   | Replaced | by the v6 admin page (document 07): **Sign out** and **Remove**, **Start match** (RT-12a), the match panel |
| AD-8           | Replaced | by AD-8a                                                                                                   |
| AD-8a          | Done     | `schedule`                                                                                                 |
| AD-9           | Replaced | Not carried over: a deployment restarts the process (document 10)                                          |
| AD-10 to AD-21 | Later    | The edit page and the QR scanner, Phase 4                                                                  |
| AD-22 to AD-25 | Replaced | by the schedule page at `/admin/schedule`; AD-25's `tempTeams` by the schedule's teams (F-12)              |
| AD-25a         | Done     | `schedule`; the browser test `tests/e2e/admin-schedule.spec.ts`                                            |

### Document 18: offline, for scouting

| Id   | Status | Where                                                                                                                         |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| OF-1 | Done   | `scouting-client`, `sign-in`, `offline`; the browser test `tests/e2e/offline.spec.ts`                                         |
| OF-2 | Done   | `submission`; the browser test `tests/e2e/scouting-client.spec.ts`                                                            |
| OF-3 | Done   | `analysis-kept`; the browser test `tests/e2e/offline.spec.ts` (#390)                                                          |
| OF-4 | Later  | The QR scanner, Phase 4                                                                                                       |
| OF-5 | Done   | `offline`, for the scouting client, as reworded in #377                                                                       |
| OF-6 | Done   | `offline`; the browser test `tests/e2e/offline.spec.ts`                                                                       |
| OF-7 | Done   | `scouting-client`, `offline`, `schedule`                                                                                      |
| OF-8 | Done   | `offline`, `config-load`; the browser test `tests/e2e/offline.spec.ts`                                                        |
| OF-9 | Done   | The browser test `tests/e2e/offline.spec.ts`: the scouting client, and the analysis page (#390). The scanner joins in Phase 4 |

### Document 21: what the server keeps

| Id                     | Status | Where                                                     |
| ---------------------- | ------ | --------------------------------------------------------- |
| DV-13, DV-14           | Done   | `db`                                                      |
| DV-15                  | Done   | `db`, `registry`, `transport`                             |
| DV-16                  | Done   | `registry`                                                |
| DV-17                  | Done   | `schedule`                                                |
| DV-18                  | Done   | `submission`                                              |
| §6, the database layer | Done   | `db` (T-5). Its driver-backed migration runner is Phase 4 |

### Document 03: the QR code

| Id               | Status | Where                                                 |
| ---------------- | ------ | ----------------------------------------------------- |
| DM-15a, DM-15c   | Done   | `qr`                                                  |
| DM-15d to DM-15f | Done   | `qr`                                                  |
| DM-16            | Done   | `qr`; the browser test `tests/e2e/acceptance.spec.ts` |

### Document 12: security, tests and defects

| Id                    | Status | Where                                                                                                                                                                                   |
| --------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-1                 | Done   | `analysis-data`: anyone may read the events, the dataset, TBA's data and the schedule, without scouter ids or join codes (Phase 3)                                                      |
| SEC-2                 | Done   | `submission`, `transport`, `sign-in`                                                                                                                                                    |
| SEC-3, SEC-3a, SEC-3b | Done   | `admin-auth`, `db`, `submission`, `sign-in`                                                                                                                                             |
| SEC-4, SEC-4a         | Done   | `admin-auth`; the browser test `tests/e2e/admin-sign-in.spec.ts`                                                                                                                        |
| SEC-5                 | Done   | `admin-auth`, for Phase 2's actions (events, the schedule, the registry, settings, the roster). The rest are Phase 4, and demo mode is #374                                             |
| SEC-5a                | Done   | `admin-auth`                                                                                                                                                                            |
| SEC-6                 | Done   | `db`, `sign-in`. Aliases and the merge are Phase 4 (SEC-6a)                                                                                                                             |
| SEC-6a                | Done   | `admin-page`: correcting a name                                                                                                                                                         |
| SEC-7, SEC-7a         | Done   | `sign-in`                                                                                                                                                                               |
| SEC-8, SEC-8a         | Done   | `db`, `sign-in`                                                                                                                                                                         |
| SEC-9                 | Done   | `admin-auth`, `submission`                                                                                                                                                              |
| SEC-10                | Done   | By design: nothing to build (ADR 0004)                                                                                                                                                  |
| T-5                   | Done   | `db`, `admin-auth`, `sign-in`, `schedule`, `submission`: every route under `src/app/api/` is called by a unit test, against the in-memory MongoDB                                       |
| T-6                   | Done   | `registry`, `transport`                                                                                                                                                                 |
| T-6a                  | Done   | `registry`, `submission`, `transport`; the browser test `tests/e2e/acceptance.spec.ts`                                                                                                  |
| T-7                   | Done   | For Phase 2's journeys and the analysis journey (`tests/e2e/analysis.spec.ts`, #383, #387; `tests/e2e/modules.spec.ts`, #392); the scanner, edit and setup journeys follow with Phase 4 |
| T-8                   | Done   | `offline`, for the scouting client and the analysis page (#390)                                                                                                                         |
| T-10                  | Done   | `executables`; for the built-in executables, as SC-24                                                                                                                                   |
| Q-2                   | Done   | As SC-23 and SC-24 (v6)                                                                                                                                                                 |
| F-1                   | Done   | `scouting-session`                                                                                                                                                                      |
| F-5                   | Done   | `qr`: a 12-character nonce, about 62 bits (DV-18)                                                                                                                                       |
| F-8 to F-10           | Done   | Gone with v5's socket handlers: demo mode is #374, nothing is pruned (RT-29), and every device action has a route (ADR 0001)                                                            |
| F-12                  | Done   | `schedule`                                                                                                                                                                              |
| F-13                  | Done   | Google sign-in is dropped                                                                                                                                                               |
| F-16                  | Done   | As OF-6                                                                                                                                                                                 |
| F-17, F-23            | Done   | `scouting-client`                                                                                                                                                                       |
| F-20 to F-22          | Done   | `registry`                                                                                                                                                                              |

### Documents 02, 17 and the ADRs

| Id       | Status   | Where                                                                                                                                     |
| -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| NF-1     | Done     | The browser tests scout on a Pixel 7 held sideways. The manifest does not lock the orientation (#43)                                      |
| NF-2     | Replaced | by SC-5 (v6)                                                                                                                              |
| NF-3     | Done     | `scouting-clock`                                                                                                                          |
| NF-5     | Done     | The admin page polls every 2.5 s; in the browser test `tests/e2e/admin-page.spec.ts`, one admin's change shows in the other's view        |
| NF-6     | Done     | `schedule`, for matches; `analysis-data`, for the dashboard's TBA data (Phase 3)                                                          |
| NF-7     | Done     | The browser test `tests/e2e/offline.spec.ts` (the manifest and its icons); the favicon and Apple touch icon are in `src/app/layout.tsx`   |
| NF-11    | Done     | For scouting: the registry tests run seven scouters, and the browser tests two phones and two admins. For analysis, see the Phase 3 audit |
| W-1      | Done     | #363: the browser test `tests/e2e/acceptance.spec.ts`                                                                                     |
| ADR 0001 | Done     | `transport`; the browser test `tests/e2e/scouter-stream.spec.ts`. nginx and Cloud Run are tested with their recipes (W-3)                 |
| ADR 0004 | Done     | As SEC-1 to SEC-10; the merge is Phase 4                                                                                                  |
| ADR 0006 | Done     | As RT-12a and RT-24 to RT-36                                                                                                              |

## Phase 3: analysis dashboard (audited 2026-11-27, #393)

**Scope** (document 17 §3): the team view, every built-in module on Plotly, event switching,
search, Compare Team Scores, Filter Teams with configurable bands, CSV in the browser, Simulate
Match and the Auto Pick List behind configuration flags, offline analysis, and extension modules.
Issues #382 to #393, and five older issues closed through them: #90 and #345 (#382), #209 (#383),
#232 (#388) and #299 (#389).

**Exit criterion: met** (#392). The browser tests, run in CI with the rest (T-1), draw the
dashboard on the oracle's two real events, 2025ilch and 2026mnwi, migrated from their v5 exports,
with their recorded TBA data (T-9). Every built-in module draws with data, says No Data without
it, and matches a screenshot in light and dark mode on a phone and a desktop
(`tests/e2e/modules.spec.ts`). The analysis journey of T-7 runs (`tests/e2e/analysis.spec.ts`).
For three teams at each event, every value the team view's Stats show is the golden output's, or
a reviewed divergence accepts the difference (T-4, `tests/e2e/oracle.spec.ts`). Gate W-2 is met.

- `npm test`: 963 tests pass.
- The browser tests: 59 pass, and 4 are skipped by design: two tests that change shared server
  state run in one project only, and the oracle's numbers are checked on the desktop only.
- `npm run oracle:compare` matches all four sets entry by entry, through 22 reviewed rules (two
  added for F-29, #392). `npm run config:check` gives no errors and 8 warnings for the active
  files, and 6 errors and 6 warnings for `config/seasons/2025`, which stays as v4.2.0 shipped it.
- **NF-11, the data volume.** The pipeline runs in the browser on one event at a time. On
  2026mnwi's 413 performances of 48 teams it takes about 0.3 s, migration included, and on
  2025ilch's 407 of 42 about 0.1 s (Node, the same engine); NF-11 expects about 450 per event.
  Each event is kept on the device on its own (OF-3), so six events a season ask nothing more.

### What the audit changed

**Spec text that no longer matched what was built:**

1. The README and document 17 §5 now record Phase 3 as complete and Phase 4 as next.
2. Document 04: CF-14 said "Phase 3"; it is kept, with each module drawn once in the team view
   and once per alliance in Simulate Match.
3. Document 07 said analysis would read the schedule's teams in Phase 3. It needs no team list:
   it lists every team with data, named by TBA (AN-12), and Simulate Match reads the schedule.
4. Document 18's section on #361 said the analysis page would choose where its data lives;
   #390 chose the page's storage, as the section below it says.
5. Document 02: NF-1 said "in Phase 3"; NF-4 and NF-6 gained what v6 does.
6. Document 11's row for `/analysis` named only the team view; it now names the views and
   offline use.
7. Document 22 called the team view "Phase 3".
8. Document 08: AN-8, AN-25 and AN-27 gained their v6 status, and AN-2's views are listed.
9. Document 09: the module reference table is v5's, now marked so, and the Grid's colour is
   drawn over white in both themes (#392).
10. The Configuration Guide said `separate` keeps a module on the page of a team with no data;
    in v6 it changes nothing.
11. Rows above that waited for Phase 3 are updated: DV-12, T-2, D-2, D-5, F-27, TR-10, SEC-1,
    NF-6 and NF-11.

**Decisions made along the way, checked to be in the spec text:** the manual data hooks dropped
(document 03 DM-14, #345); where offline analysis keeps its data (document 18, "v6: offline
analysis"); the Simulate Match and Auto Pick flags (document 08, document 20 CS-13); each event
read with its season's configuration (document 08, CS-17); the rating bands marked in
configuration (CS-13); Plotly loaded as its own file (document 09); missing values as empty CSV
cells (document 08); extension modules and why their files use no hooks (document 09, ADR
0005); and the 2026 files' fixes (document 12 F-29).

**Rules that were only implied, now written down:**

- Document 08: what the address does when it names an event, a team or a view that isn't there,
  and that choosing another event drops the team, since a number names another robot there. A
  browser test checks it.
- Document 08 and the Configuration Guide: `separate` is accepted and changes nothing.
- Document 09: any module may be in either view; PerformanceTimePlot given several teams, and a
  chance of winning with no other alliance, say so instead of drawing.
- Document 08: the analysis page registers the service worker itself (AN-5).

**Tests:** two new browser tests in `tests/e2e/analysis.spec.ts`: the loading message (AN-4),
which nothing checked, and the address rules above. AN-3 and NF-4 joined the names of the tests
that check them, and the offline browser test now names AN-5 and NF-4. Found along the way and
fixed in Phase 3: a race that let two requests at once both read TBA (#405), and a schema that
failed to compile when the modules file was checked before any pipeline file (#392).

**Gaps, each moved on purpose:**

- **AN-8**, records scanned on a device shown in its analysis before they reach the server, goes
  with the QR scanner (OF-4, Phase 4).
- **AN-27**, the DEMO label, comes with demo mode (#374, Phase 4).
- **#44, analysis portrait styles** (Phase 5), looks met: the dashboard is laid out for phones
  held upright, and its browser tests and screenshots run on a Pixel 7 held upright. It stays
  open for the maintainer to close.
- **BL-7, the accessibility pass**, is Phase 5. Each chart already has a table a screen reader
  reads, and the browser tests find the dashboard's controls by their names.
- **The scanner's part of OF-9 and T-7** is Phase 4.

### Document 08: the analysis dashboard

| Id              | Status | Where                                                                                                                |
| --------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| AN-1, AN-2      | Done   | `analysis-dashboard`; the browser test `tests/e2e/analysis.spec.ts`                                                  |
| AN-3            | Done   | `analysis-data`; the browser test `tests/e2e/analysis.spec.ts`                                                       |
| AN-4            | Done   | The browser test `tests/e2e/analysis.spec.ts`: a loading message, then the event                                     |
| AN-5            | Done   | The browser test `tests/e2e/offline.spec.ts`, which opens the analysis page first                                    |
| AN-6            | Done   | `analysis-data`                                                                                                      |
| AN-8            | Later  | The QR scanner, Phase 4 (OF-4)                                                                                       |
| AN-11a          | Done   | `analysis-data`; the browser test `tests/e2e/analysis.spec.ts`                                                       |
| AN-12           | Done   | `analysis-data`, `analysis-dashboard`                                                                                |
| AN-13           | Done   | `analysis-dashboard`; the browser test `tests/e2e/analysis.spec.ts`                                                  |
| AN-14, AN-15    | Done   | `analysis-dashboard`; the browser tests `tests/e2e/analysis.spec.ts` and `tests/e2e/modules.spec.ts`                 |
| AN-16 to AN-18  | Done   | `filter-teams` (Compare's values and bubbles); the browser test `tests/e2e/analysis.spec.ts`                         |
| AN-18a          | Done   | `analysis-data`, `analysis-dashboard`                                                                                |
| AN-19 to AN-21a | Done   | `filter-teams`; the browser test `tests/e2e/analysis.spec.ts`                                                        |
| AN-22           | Done   | The browser test `tests/e2e/analysis.spec.ts`: a card per team, which opens its view                                 |
| AN-23           | Done   | `analysis-data` (the schedule), `win-chance`; the browser test `tests/e2e/analysis.spec.ts`                          |
| AN-24           | Done   | `win-chance`; the browser test `tests/e2e/analysis.spec.ts`                                                          |
| AN-26, AN-26b   | Done   | `csv`; the browser test `tests/e2e/analysis.spec.ts`                                                                 |
| AN-27           | Later  | Demo mode (#374)                                                                                                     |
| CS-17           | Done   | `analysis-data`, `config-load`: the analysis files with their findings, and each event read with its season's (#383) |
| DV-19           | Done   | `analysis-data`, `data-schema`                                                                                       |
| BL-208, A-12    | Done   | As AN-18a                                                                                                            |
| BL-232, A-11    | Done   | As AN-26a                                                                                                            |
| BL-299, A-6     | Done   | As AN-23 and AN-24                                                                                                   |
| A-36, A-37      | Done   | As AN-11a and AN-12                                                                                                  |

### Document 09: modules

| Id          | Status | Where                                                                                                                      |
| ----------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| MO-1, MO-2  | Done   | `modules`, `extension-modules`; every built-in module in the browser test `tests/e2e/modules.spec.ts`                      |
| MO-3        | Done   | `modules`, `chart-modules`                                                                                                 |
| MO-4, MO-4a | Done   | `modules`, `config-preview`                                                                                                |
| MO-5        | Done   | `chart-modules`; each chart in light and dark mode in the browser tests `tests/e2e/analysis.spec.ts` and `modules.spec.ts` |
| A-20        | Done   | `heatmap`; the browser test `tests/e2e/analysis.spec.ts`                                                                   |
| F-18        | Done   | `modules`, `chart-modules`, `heatmap`, `win-chance`                                                                        |

### Documents 02, 17 and 18

| Id   | Status | Where                                                                                                            |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| NF-4 | Done   | `analysis-kept`; the browser test `tests/e2e/offline.spec.ts`: two events viewed online, both open offline       |
| W-2  | Done   | #392: the browser tests `tests/e2e/modules.spec.ts`, `tests/e2e/oracle.spec.ts` and `tests/e2e/analysis.spec.ts` |
