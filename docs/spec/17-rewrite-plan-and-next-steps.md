# 17 — How to Start the Rewrite: Preparation, Repository Strategy, Next Steps

Written 2026-09-17. Assumes the decisions in document 12 ("Resolved decisions") and the stack
in document 15. Calendar constraint: FRC kickoff is early January 2027 and the first events
are late February, so the rewrite must be configurable for the 2027 game by kickoff, roughly
15 weeks from now.

## 1. Repository and branching strategy

**Recommendation: same repository, a long-lived `v6` integration branch, `main` stays v5
until cutover, and the old code is preserved as a `v5` branch plus a tag, not as a folder.**

- Keep one repository (`HuskieRobotics/SPOT`) so stars, issues, documentation links, and
  other teams' bookmarks stay valid. A second repository fragments the community.
- Do the rewrite on a branch named `v6` whose tree is **replaced**, not edited in place: the
  first commit on `v6` deletes `src/`, `config/*.js`-era files, and `package.json`, and
  scaffolds the new app. Feature work happens in short-lived branches with pull requests
  targeting `v6`, reviewed and CI-tested like normal work.
- `main` keeps running the current app for the rest of the 2026 off-season. Bug fixes needed
  at off-season events land on `main` as today and are cherry-picked into the spec if they
  change behavior.
- Before cutover: tag `main` as `v5.2.0-final` and create a `v5` maintenance branch. Then merge
  `v6` into `main` (the tree replacement is intentional; do it with a merge commit so history
  stays linear for both lines). Anyone needing the old code checks out `v5` or the tag; the
  full history remains in the repository.
- Do **not** keep the old app in a `legacy/` subfolder of the new tree: it confuses tooling
  (two `package.json`s, two lockfiles, two Docker contexts), students, and search results.
  The one exception is assets that carry over unchanged (logo, field SVGs, icons, archived
  year configs, tutorial videos), which are copied into the new tree.
- Move this `claude/` folder to `docs/spec/` (done 2026-09-17) in the `v6` tree (and leave a copy on `main`),
  add a root `CLAUDE.md` that points at it, and treat it as the living requirements document.
  Every pull request references the requirement ids it implements (`SC-23`, `BL-298`, …) and
  tests are named by those ids so coverage is traceable.

## 2. Preparation that makes the rewrite efficient (Phase 0, about two weeks)

Do these before writing application code. Each one removes a class of rework later.

1. **Build the behavioral oracle from the legacy app.** This is the single highest-value step.
   - Obtain the MongoDB dump offered in answer 26 (one 2026 event is enough) and record the
     matching TBA responses (`/event/2026mnwi/matches`, `/teams`, `/coprs`) as JSON fixtures.
   - Run the _current_ pipeline headlessly in Node against those fixtures (the CommonJS
     `transformers2.js` path already exists) and save the resulting `dataset.teams` and
     derived `tmps` as golden expected output.
   - The rewrite's pipeline is done when it reproduces this output byte-for-byte (allowing
     for the known defects listed in document 12, which get their own expected values).
     **Status 2026-09-17: the oracle exists.** `tools/oracle/run.js` (no dependencies) with
     fixtures and golden outputs checked into the working tree (not yet committed):

   | Season | Run                                                                                                 | Result                                                                                                                                           |
   | ------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
   | 2025   | `2025ilch_official`, code `v4.2.0`, its default configs, enrichment off                             | 407 TMPs, 42 teams, 46 pipeline entries, 0 transformer errors, **0 unknown action ids** (so the `countActions` divergence has no effect on 2025) |
   | 2026   | `2026mnwi_official`, legacy v5 code (`main` commit `902db06`), its configs, TBA enrichment + OPR on | 435 TMPs, 48 teams, 74 entries, 0 errors, **32 unknown action ids** (see below)                                                                  |

   Golden files: `tools/oracle/golden/<event>-<checkout>/{teams,tmps,report}.json` (3 MB and
   9 MB). Regenerate with `tools/oracle/run-all.sh <v4.2.0 worktree> <v5 worktree>`; see
   `tools/oracle/README.md`. The TBA fixtures for `2025ilch` and `2026mnwi` are recorded under
   `tools/oracle/fixtures/tba/`.

   Findings from the real data that feed the spec:
   - 2026 unknown ids (present in TMPs but absent from `match-scouting.json`):
     TBA-synthetic `autoTowerRobot_None` (409) and `endGameTowerRobot_None` (399); phase
     combinations the catalog layer never listed, e.g. `autoAttemptL1` (16),
     `endgameAttemptClimb` (16), `teleopTransitionAttemptClimb` (3), `autoFallL1` (1);
     **third shifts** `activeShift3*` / `inactiveShift3*` (about 20 actions across 7 TMPs,
     the shift counter exceeded 2); and un-prefixed `teleop*` ids from scouters who never
     pressed a shift button (3 TMPs). Every one of these would have produced a corrupt QR
     payload had the device been offline (document 12, F-4, now evidenced). `knownActionIds`
     must therefore be derived (phase × button) rather than enumerated by hand, or the id
     encoding must not depend on an enumeration.
   - 2025 output contains 27 `"N/A"` strings from the `timePerGamePiece` divide-by-zero typo
     and 96 `NaN` averages (teams without a value); 2026 contains 715 `NaN` rating averages
     (phase/metric combinations with no ratings) and 21 `undefined`s. The rewrite must decide
     how missing values are represented (document 12) and the golden files record the legacy
     representation.

   **Two-season oracle (decided 2026-09-17).** The oracle MUST cover **both 2026 and 2025**:
   2026 is atypical (qualitative ratings, shifts, `sumAverage`/`zoneActionRatingGroupings`),
   while 2025 exercises the typical path (`weightedSum` point scoring, `ratio` accuracy,
   `cycle` times, `countMatches`, `standardDeviation`, `averageScores.total` feeding Simulate
   Match and Auto Pick). Feasibility and what it takes:

   - The oracle is **pipeline-only** (TMPs in, dataset out). The 2026 phase-prefix composition
     was added to the scouting client in #250 and does not affect replaying stored 2025 TMPs,
     whose ids are explicit (`autoScoreCoral`, `teleopl4`, …).
   - **Decision (2026-09-17): generate the 2025 oracle from `v4.2.0`.** Changes made for 2026
     alter transformer semantics, so current code cannot reproduce what 2025 users saw; the
     oracle must come from a 2025-era checkout. Findings from the git history:

     | Ref          | Date       | What it is                                                                                                                                                                                                                                                                                                                      |
     | ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
     | `v4.1.0`     | 2025-01-29 | 2025 kickoff release; `eventNumber: Number`; no headless path                                                                                                                                                                                                                                                                   |
     | `a08dcbd`    | 2025-04-13 | last in-season commit on `main` (post-Midwest fixes #183–#186)                                                                                                                                                                                                                                                                  |
     | **`v4.2.0`** | 2025-10-07 | post-season release; `eventNumber` is an ObjectId (#202) matching the **migrated 2025 database**; default configs are the cleaned-up 2025 set (`match-scouting2025v2`, the documented `analysis-pipeline` with `scores.*`, `cycles.*`, `standardDeviation`, `averages`, `averageScores`); has the `transformers2` headless path |

     `git diff a08dcbd v4.2.0 -- src/analysis/transformers` touches **no transformer logic**
     (only `_template2` and event-selection plumbing in `analysisPipeline.js`/`util.js`), so
     `v4.2.0` executes exactly the semantics that ran at 2025 events. Combined with the
     matching schema, the documented pipeline (the one the Configuration Guide describes),
     and the headless path, it is the best 2025 baseline. The in-season pipeline config
     (`analysis-pipeline-2025.json`, archived at HEAD) can optionally be run through the same
     `v4.2.0` code for a second golden set, since only the config differs.

   - **No config edits are needed** when running at the tag: each tag's own default
     `match-scouting.json` and `analysis-pipeline.json` are the 2025 files with the option
     names its `cycle.js` expects (`pickups`/`scores`/`misses`). The rename to
     `startAction`/`endAction` (#260, 2026) is therefore irrelevant to the 2025 oracle.
   - **Schema matches.** The 2025 database was migrated to ObjectId event numbers (#202) and
     `v4.2.0` expects ObjectIds, so `v4.2.0` can even be run as a real server against that
     database for a manual cross-check. The harness still reads TMPs from a `mongoexport`
     JSON file so runs are reproducible and CI never needs a database.
   - **The 2025-era client pipeline had no TBA enrichment** (score-breakdown synthetic actions
     arrived in #240 and OPR attachment in #257, both February 2026). The 2025 golden output
     therefore tests the transformer pipeline in isolation; the rewrite must run it with
     enrichment disabled (empty TBA mapping, no OPR strings). The 2026 oracle covers
     enrichment. TBA fixtures for 2025 are still recorded, for module smoke tests and for the
     restored Simulate Match feature, but are not oracle inputs.
   - **Harness design (version-independent).** A standalone Node script kept outside the
     legacy tree (`tools/oracle/`), given a checkout path, a season config directory, a TMP
     export file, and optional TBA fixtures. It reimplements the marker extraction that
     `analysis.js` performs (`__TMP__`/`__TEAM__` blocks evaluated with `DataTransformer`,
     `getPath`, `setPath`, `actionIds`, `matchScoutingConfig` in scope), runs the pipeline
     entries in order, optionally applies 2026-style enrichment, and writes normalized golden
     JSON (`teams`, derived `tmps`) per season and checkout. The same harness produces the
     2026 oracle from a v5 worktree, so both seasons use one tool. The legacy code needs no server,
     database, or Node 16; the transformers are plain JavaScript.
   - **Semantic divergences between `v4.2.0` and current transformers** (verified with
     `git diff v4.2.0 HEAD -- src/analysis/transformers`). The rewrite implements the
     _current_ semantics; the 2025 golden file records any expected difference.
     1. `countActions` with `all: true` (changed in #254, 2026-02-20): 2025 code counted only
        ids present in `match-scouting.json` and silently dropped any other id; current code
        also counts unknown ids (`out[id] = (out[id] || 0) + 1`). The 2025 pipeline uses
        `countActions(all)` for both `tmp` and `team`, so this **can** affect the 2025 golden
        output, but only if the exported 2025 TMPs contain ids outside the 53 in the config
        (for example from a mid-season button rename). The harness reports every unknown id
        it encounters; if there are none, the outputs are identical.
     2. `actionTime` (changed in the v5.0 merge #237): 2025 code treated a legitimate `ts` of
        `0` as "not found" (`!getPath(tmp, outputPath, false)`) and wrote the default; current
        code accepts an array of ids and uses a found-flag. The 2025 pipeline does **not** use
        `actionTime`, so no effect on the 2025 golden output.
     3. `ratio` divide-by-zero default (`Infinity` → `"N/A"`, #165) landed **before** `v4.2.0`,
        so it is not a divergence for this baseline. Note the 2025 pipeline's
        `timePerGamePiece` entry places `divByZero: 150000` **outside** `options` (the
        Configuration Guide reproduces the same typo), so teams with no scored game pieces get
        the string `"N/A"` at that path; the oracle captures this as-is and the rewrite's
        config validation (T-3) should flag unknown top-level keys.
        Renames only (`cycle` option names) and cosmetic changes (`standardDeviation` logging,
        `aggregateArray` comment) carry no semantic difference. New in 2026 and absent from the
        2025 pipeline: `removeDuplicates`, `averageTime`, `deepAverage`, `multiply`, `sumAverage`,
        `weightedSumAverage`, `zoneActionRatingGroupings`.

   Per-season oracle inputs:

   | Input                   | 2026                                                   | 2025                                                                                                    |
   | ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
   | Code checkout           | legacy v5 code (`main` commit `902db06`, v5.2.x)       | `v4.2.0`                                                                                                |
   | TMP export              | `mongoexport` of event `2026mnwi_official`             | `mongoexport` of the chosen 2025 event (e.g. `2025ilch_official`)                                       |
   | Configs                 | tag defaults                                           | `v4.2.0` defaults (documented 2025 pipeline); optionally also `analysis-pipeline-2025.json` (in-season) |
   | TBA fixtures            | `/event/2026mnwi/{matches,teams,coprs}` — oracle input | recorded for smoke tests only; not an oracle input                                                      |
   | Enrichment              | on (`TBA_OPR_STRINGS` as configured)                   | off                                                                                                     |
   | Expected-output caveats | F-2/F-3 if triggered                                   | divergence 1 above, only if unknown ids exist                                                           |

   **What the maintainer confirms for the 2025 run** (reduced checklist):
   1. Baseline is `v4.2.0` with its default configs (decided). Optionally also produce a golden
      set from the in-season `analysis-pipeline-2025.json` on the same code.
   2. The 2025 event to export from the migrated database.
   3. ~~That `countActions(all)` should count unknown ids in the rewrite~~ **Confirmed
      2026-09-17: keep today's behavior**; the harness lists any unknown ids found in the 2025
      export.

2. **Write the synthetic TMP generator** (required by T-4 and answer 45): given a
   `match-scouting.json`, produce rule-respecting random action queues for N teams × M matches,
   with a seed for reproducibility. Also run it through the legacy pipeline to extend the
   oracle beyond real data.
3. **Close the open decisions** that block the data model and config schema (each is one
   short discussion):
   - ~~composite action-id scheme vs. `{ id, phase, shift }` fields (A-22)~~ **decided
     2026-09-17**: actions carry `phase` and `segment` fields and the composite id stays
     derivable from them (document 20 §2.1); implement in step 5 and Phase 1;
   - start rules for entering a match (A-28, BL-34);
   - keep or drop the manual schedule (A-8);
   - security model: adopt R-32 and the per-event scouting join code, or a lighter variant;
   - extension mechanism details (runtime-served `extensions/` folder, document 15).
4. **Done 2026-09-17 (document 20).** **Write the configuration schema v2 as JSON Schema** before any UI: `match-scouting`,
   `analysis-pipeline`, `analysis-modules`, `qr`, and the new settings document. Include
   `knownActionIds`, `pauseMs`, explicit colors, configurable shift/A-Stop/filter bands, and
   the TBA enrichment mapping. Write a converter from the 2026 config and validate the
   archived configs to see how far they convert. JSON Schema also gives editor autocomplete,
   which directly serves the "students without programming experience" requirement.
5. **Write the data model v2 and the v5→v6 migration script** (document 03 hooks: flag
   metadata, `notes`, `tags`, no per-action `_id`, tenant/event scoping, `scouters`), including
   the `phase`/`segment` fields on each action and the split of legacy composite ids
   (document 20 §2.1).
6. **Scaffold the `v6` branch**: Next.js (App Router, TypeScript), Tailwind + shadcn with a
   tweakcn theme seeded from the current palette, ESLint/Prettier, Vitest, Playwright,
   MongoDB memory server for tests, GitHub Actions running all of it on every PR,
   `.env.example`, `deploy/aws` and `deploy/gcp` placeholders. No Docker (decided 2026-09-17). Merge this as the first PR so
   every later PR is tested from day one (NF-8).
7. **Record architecture decisions** as short ADR files in `docs/adr/` for: transport
   (SSE/polling), extension model, config storage, auth model, hosting. These are the
   decisions in document 15; writing them down prevents relitigating them in PR review.
8. **Set up the work tracking**: a `v6` label and milestone on GitHub, a project board with
   the phases below, and the backlog ids from document 16 mapped onto issues.

## 3. Build order (phased, each phase independently testable)

| Phase                         | Scope                                                                                                                                                                                                           | Exit criterion                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1. Core engine (no UI)        | Config loader + JSON Schema validation + converter; pipeline engine and all built-in transformers as pure TypeScript; synthetic generator; extension loader                                                     | Oracle tests pass on the real dump and synthetic data; T-2/T-3/T-4 green                                                  |
| 2. Scouting vertical slice    | Scouting client (landing, sign-in, waiting, grid, timer with hold and 2×, undo, executables, submission, IndexedDB, QR), session/assignment service (SSE or polling), admin match selection and scouter monitor | Playwright: two simulated scouters get assigned, scout, submit; data lands in MongoDB; offline path yields a scannable QR |
| 3. Analysis dashboard         | Team view, all built-in modules on Plotly, event switching, search, Compare, Filter Teams with configurable bands, client-side CSV, Simulate Match and Auto Pick behind config flags                            | Renders the oracle dataset; screenshot and smoke tests per module                                                         |
| 4. Operations                 | Edit page (flags, delete, unscouted), QR scanner, settings UI replacing the wizard (R-32), deploy recipes for EC2 and Cloud Run, migration script run against the real dump                                     | End-to-end suite green; deployed to a staging EC2 instance                                                                |
| 5. Hardening and backlog core | BL-93, BL-54, BL-116, BL-33, BL-7, BL-43, accessibility pass, docs (Quickstart, Configuration Guide, Usage Guide rewritten from this spec)                                                                      | Configure the 2027 game from the schema alone after kickoff                                                               |
| 6. Cutover                    | Parallel run at an off-season event or scrimmage with the v5 app; compare datasets; tag `v5.2.0-final`; merge `v6` to `main`                                                                                    | First 2027 event scouted on v6                                                                                            |

Phases 1 and 3 can proceed in parallel with phase 2 once the config schema and data model are
fixed, which is why Phase 0 items 4 and 5 come first.

## 4. Working practices that keep it efficient

- **Spec-driven pull requests.** PR description lists requirement ids implemented and tests
  added; reviewers check the spec, not the old code.
- **Legacy code is reference, not template.** Read `v5` to answer "what did it do", never
  port a file line by line; the spec already extracted the behavior, and much of the old code
  is duplicated per feature.
- **Keep the oracle honest.** When the rewrite deliberately diverges from legacy output
  (fixing F-1 to F-19), update the expected fixture in the same PR with a note citing the
  defect id.
- **Students first.** Assign phase 1 (pure TypeScript, heavily tested) and phase 3 modules to
  students; keep the session service and auth to whoever owns operations.
- **Time-box the stack decision.** If SSE proves awkward in the first week of phase 2, fall
  back to polling (answer 50 allows it) rather than adding a custom server.

## 5. Immediate next steps (this week)

1. Request `mongoexport` JSON of one 2026 event **and one 2025 event**, record the TBA
   fixtures for both; the 2025 baseline is `v4.2.0` (section 2.1).
2. Decide the five open items in section 2.3 and record them in document 12.
3. Create the `v6` branch, move the spec to `docs/spec/`, add `CLAUDE.md`, and land the
   scaffold PR with CI.
4. Start the oracle: legacy pipeline run against the fixtures, golden outputs committed.
5. ~~Draft the JSON Schema for `match-scouting.json` v2 and convert the 2026 config as the
   first test.~~ Done: all four schemas, converter, tests, and the converted 2026 config as
   the active `config/*.json` (document 20).
