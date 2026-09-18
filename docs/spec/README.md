# SPOT — Feature and Requirements Specification

This folder (`docs/spec/`, moved from `claude/` on 2026-09-17 when the `v6` branch was created) captures the features, behaviors, data contracts, and requirements of SPOT
(Scouting Platforms On Time), the FRC scouting platform built by Team 3061 Huskie Robotics,
as implemented in this repository (2026 season, landing page version string `2026 v5.2.0`).

Maintainer answers to the clarifying questions (document 14, answered 2026-09-17) have been
folded into the requirements; every folded decision is listed in document 12 under
"Resolved decisions" and marked **[A-n]** (answer number) where it changed a requirement.

The purpose of these documents is to allow a **from-scratch rewrite** of SPOT that preserves
its behavior and configurability without requiring the reader to reverse-engineer the existing
code. Every document is derived from the actual source in `src/` and `config/`, plus the
attached Configuration Guide, Quickstart, Usage Guide, and System Test Plan. Where the docs
and the code disagree, the code wins and the discrepancy is called out.

Architecture decisions and their rationale live in [`docs/adr/`](../adr/README.md); the
requirements they produce are folded into the documents below.

## How to read these documents

| #   | File                                                                             | What it covers                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | [01-overview-and-principles.md](01-overview-and-principles.md)                   | Product goals, personas, guiding principles, glossary, page map                                                                                                                                                                                      |
| 02  | [02-architecture.md](02-architecture.md)                                         | Runtime, boot sequence, module layout, client architecture, offline model, theming, non-functional requirements                                                                                                                                      |
| 03  | [03-data-model.md](03-data-model.md)                                             | Database collections, TeamMatchPerformance schema, action-queue semantics, event codes, client-side storage, in-memory server state, QR binary format                                                                                                |
| 04  | [04-configuration.md](04-configuration.md)                                       | Every configuration file and every field: `config.json`, `match-scouting.json`, `qr.json`, `analysis-pipeline.json`, `analysis-modules.json`, `analysis-transformers.json`                                                                           |
| 05  | [05-scouting-client.md](05-scouting-client.md)                                   | The scouter-facing app: landing, sign-in, waiting, match scouting grid, timer/phases/shifts, button types, executables, undo, A-Stop lock, zone buttons, position capture, submission, QR fallback, PWA/offline, status bar, settings                |
| 06  | [06-realtime-sync.md](06-realtime-sync.md)                                       | Socket.IO protocol, scouter lifecycle/states, robot assignment algorithm, data sync and de-duplication, admin disconnect, demo-mode behavior                                                                                                         |
| 07  | [07-admin-and-data-management.md](07-admin-and-data-management.md)               | Admin dashboard, access-code auth, match schedule (TBA / FRC API / manual), scouter monitoring, Edit Data page (flag/delete/unscouted), QR scanner page, manual schedule page, server restart                                                        |
| 08  | [08-analysis.md](08-analysis.md)                                                 | Analysis dashboard: pipeline execution, TBA enrichment (score breakdown + component OPRs), event switching, team view, Compare Team Scores bubble graph, Filter Teams, search, CSV export, offline analysis, dormant Simulate Match / Auto Pick List |
| 09  | [09-transformers-and-modules-catalog.md](09-transformers-and-modules-catalog.md) | Reference catalog of every data transformer (options and exact semantics) and every analysis module (options and rendering)                                                                                                                          |
| 10  | [10-setup-and-deployment.md](10-setup-and-deployment.md)                         | First-run setup wizard, config validation, event-code creation, restart semantics, local/Docker/Cloud Run deployment, migration from v4                                                                                                              |
| 11  | [11-api-reference.md](11-api-reference.md)                                       | Every HTTP endpoint and every Socket.IO event, with auth rules and payloads                                                                                                                                                                          |
| 12  | [12-rewrite-notes-and-test-plan.md](12-rewrite-notes-and-test-plan.md)           | Known quirks, bugs, dead code, security concerns, decisions a rewrite must make, and the system test plan                                                                                                                                            |
| 13  | [13-reference-2026-game-config.md](13-reference-2026-game-config.md)             | Walkthrough of the shipped 2026 REBUILT configuration as a worked example of the configuration system                                                                                                                                                |
| 14  | [14-clarifying-questions.md](14-clarifying-questions.md)                         | Questions for the SPOT maintainers whose answers will refine this specification (scope, features in use, game-specific constants, operations, security, data semantics, doc discrepancies)                                                           |
| 15  | [15-rewrite-technology-direction.md](15-rewrite-technology-direction.md)         | Proposed rewrite stack (Next.js, Tailwind, shadcn/tweakcn) and analysis of replacing Socket.IO with SSE, with the spec changes each choice would trigger                                                                                             |
| 16  | [16-github-issue-backlog.md](16-github-issue-backlog.md)                         | The 41 open GitHub issues classified as core / next / covered / drop for the rewrite, with backlog requirement ids `BL-<issue>`                                                                                                                      |
| 17  | [17-rewrite-plan-and-next-steps.md](17-rewrite-plan-and-next-steps.md)           | Repository/branch strategy, Phase 0 preparation (behavioral oracle, synthetic data, schema v2, scaffold), phased build order, working practices, and **live status** (section 5)                                                                     |
| 18  | [18-offline-requirements.md](18-offline-requirements.md)                         | Offline operation as a first-class requirement: the three offline situations, what the service worker must cache (including generated bundles and data endpoints), OF-1 to OF-9                                                                      |
| 19  | [19-model-fit-guide.md](19-model-fit-guide.md)                                   | Which Claude model (Opus vs Fable 5.1) suits which kind of rewrite work, by phase and work item                                                                                                                                                      |
| 20  | [20-config-schema-v2.md](20-config-schema-v2.md)                                 | Configuration schema v2 (JSON Schema, decisions CS-1..15), the v1 → v2 converter mapping, and the T-3 tests                                                                                                                                          |

## Behavioral oracle

`tools/oracle/` holds the legacy-pipeline golden outputs the rewrite must reproduce (2025 from
`v4.2.0`, 2026 from the legacy v5 code (`main` commit `902db06`)), the recorded TBA fixtures, and the harness that regenerates them.
See `tools/oracle/README.md` and document 17.

## Requirement identifiers

Requirements are numbered per document (for example `SC-12` in the scouting client document,
`RT-4` in the real-time sync document) so a rewrite can trace coverage. Statements marked
**MUST** are behaviors the current app exhibits and that users/configs depend on. Statements
marked **SHOULD** are behaviors that exist but are incidental, and **NOTE** flags quirks
a rewrite may deliberately change (collected again in document 12).

## Source-of-truth map

| Area                   | Primary source files                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Server entry / routing | `src/app.js`, `src/configRouter.js`                                                                                                       |
| Database               | `src/lib/db.js`, `src/lib/databaseMigrator.js`                                                                                            |
| Scouting client        | `src/scouting/**` (server: `scouting.js`, `scouting-sync.js`, `routes/auth.js`; client: `public/js/*.js`, `executables/*.js`, `views/**`) |
| Admin                  | `src/admin/**`                                                                                                                            |
| Analysis               | `src/analysis/**` (transformers in `transformers/`, modules in `modules/`)                                                                |
| Edit data              | `src/edit/**`                                                                                                                             |
| QR scanner             | `src/qrscanner/**`                                                                                                                        |
| Manual schedule        | `src/schedule/**`                                                                                                                         |
| Setup wizard           | `src/setup/**`                                                                                                                            |
| Checklist (unmounted)  | `src/checklist/**`                                                                                                                        |
| Configuration          | `config/*.json`, `config/configInfo.md`, `TRANSFORMERS_README.md`                                                                         |
| Deployment             | `deploy/gcp/**`, `.vscode/launch.json`, `package.json`                                                                                    |
