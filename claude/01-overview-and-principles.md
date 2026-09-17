# 01 — Overview, Principles, and Glossary

## What SPOT is

SPOT (Scouting Platforms On Time) is an open-source, configuration-driven match-scouting
platform for FIRST Robotics Competition (FRC). A team hosts one SPOT server; scouters use
phones/tablets to record what a robot does during a match as a timestamped **action queue**;
the data is stored in MongoDB; a strategy team views per-team statistics, charts, and
comparisons on an analysis dashboard; and admins coordinate scouters live at the event.

- Author/owner: Team 3061 Huskie Robotics (contact `spot@team3061.org`).
- License: Apache 2.0.
- Version strings in the code base: landing page shows `2026 v5.2.0`; `package.json` says
  `1.0.0`; `config.json` `VERSION` is a team-chosen client data version (setup form sets `1.0`).
- Database schema generation: "SPOT v5" (incompatible with v4 and earlier; see document 10).

## Target users (personas)

The README defines four tiers a rewrite must continue to serve:

1. **New-to-scouting team** — deploys the preconfigured app with minimal setup; wants a
   working scouting UI and useful analysis out of the box for the current game.
2. **Configurer** — modifies JSON configuration (buttons, pipeline, modules) without code.
3. **Extender** — writes custom analysis transformers / modules / scouting executables as
   drop-in files without modifying core code.
4. **Forker** — treats SPOT as a documented, extensible code base to build a custom system.

Operational roles inside one team:

- **Scouter** — signs in by name on a device, waits for an assignment, scouts one robot per
  match, submits.
- **Admin / scouting lead** — selects the current match, assigns scouters, monitors
  connections, scans QR codes from offline devices, edits/flags/deletes data, exports CSV,
  restarts the server, edits config.
- **Strategy / drive team** — uses the analysis dashboard.

## Guiding principles (from README and CONTRIBUTING)

- **P1. Game-agnostic platform.** SPOT must work with any past or future FRC game by changing
  configuration only. Core code and transformer/module names avoid game terminology.
- **P2. No code required** to configure, set up, or use SPOT. **[A-1, A-5]** Confirmed as a hard
  requirement: students (and other teams) without programming experience must be able to
  customize the scouting interface and analysis pipeline through JSON (or an equally
  accessible format). The extension model is the feature that differentiates SPOT.
- **P3. Offline-capable for core features** (scouting and analysis) once the app has been
  loaded online at least once. This is a defining feature and a major source of complexity;
  document 18 states it as testable requirements OF-1 to OF-9.
- **P4. Extensibility by drop-in files**: transformers, analysis modules, and scouting
  executables are discovered from folders and compiled into client bundles at request time.
  **[A-5, A-49]** The mechanism may change, but runtime discovery of drop-in files is
  preferred; a tool that updates code on behalf of the user is acceptable.
- **P5. Works on all platforms** (iOS, Android, desktop web) as an installable PWA.

## High-level feature inventory

- Scouting UI: configurable button grid, layered screens, match timer with phase
  transitions, undo, position capture on a field map, per-button executables, A-Stop lock,
  alliance-aware zone buttons, last-actions readout, connection status, hints while waiting.
- Live coordination: Socket.IO-based scouter registry; admin selects the match; automatic
  robot assignment ensuring no two active scouters share a robot; auto-start when six
  scouters are waiting or when anyone is already scouting; admin force-start; admin
  disconnect of a scouter.
- Data capture: TeamMatchPerformance (TMP) documents; local IndexedDB buffering; sync with
  de-duplication; QR-code fallback (bit-packed binary) and a QR scanner page to ingest it.
- Schedule sources: The Blue Alliance (TBA) API, FRC Events (FMS) API for practice matches,
  or a manually entered schedule.
- Analysis: client-side pipeline of configurable transformers producing per-TMP and per-team
  derived values; enrichment with TBA score breakdowns (auto/endgame robot results) and TBA
  component OPRs; pluggable Plotly-based chart modules; team search; Compare Team Scores
  bubble graph; Filter Teams; CSV export; event switching; offline analysis via service
  worker cache.
- Data management: Edit page listing TMPs with filters, expandable action queues, flagging,
  deletion, and "NOT SCOUTED" placeholders per match derived from TBA.
- Setup: first-run wizard writes `config/config.json` after validating MongoDB and TBA key;
  event-code management; demo mode; zone-button swap; OPR key list; server restart.
- Deployment: local Node, Docker, Google Cloud Run script (config persisted in a GCS bucket);
  historical guides for Glitch, AWS AMI, Render.

## Glossary

| Term | Meaning |
|------|---------|
| **TMP / TeamMatchPerformance** | One scouter's record of one robot in one match: metadata plus an action queue. |
| **Action** | `{ id, ts, other? }` — a button id (possibly prefixed with the match phase/shift), the match time remaining in milliseconds when pressed, and optional extra data (e.g. field position). |
| **Action queue** | Ordered list of actions in a TMP. Temporary actions (`temp: true`) exist only client-side and are stripped on submit. |
| **Action id** | String identifier for a button; at runtime the recorded id is `<phasePrefix><buttonId>` (see document 05). |
| **Layer** | One screen of buttons in the scouting grid. Layers are switched by time transitions or by executables. |
| **Executable** | A named client-side behavior attached to a button (`layer`, `position`, `setVariable`, …) with `execute` and `reverse` (undo) hooks. |
| **Variable** | Named client-side state in the scouting UI (`variables` in `match-scouting.json`), used for conditional layer rendering and the undo guard. |
| **Transformer / DataTransformer** | A named function `(dataset, outputPath, options) => dataset` of type `tmp` or `team`, run in order from `analysis-pipeline.json`. |
| **Dataset** | `{ tmps: TMP[], teams: { [teamNumber]: object } }`; transformers add paths to tmps and teams. |
| **Module** | A frontend analysis widget class (`Stats`, `Bar`, `Pie`, …) configured in `analysis-modules.json`. |
| **Path** | Dot-separated key path (`averageScores.total`) resolved with `getPath` / created with `setPath`. |
| **Event code** | Human string `<tbaEventKey>_<label>` stored in the `events` collection; each has an ObjectId. |
| **EVENT_NUMBER** | In `config.json`, the ObjectId hex string of the active event; every TMP stores it as `eventNumber`. (Legacy v4 stored an integer.) |
| **TBA** | The Blue Alliance API v3 (matches, teams, score breakdowns, component OPRs). |
| **FMS / FRC API** | FIRST Events API (used only for practice-match schedules). |
| **OPR / COPR** | Offensive Power Rating and TBA component OPRs (`/event/{key}/coprs`), keyed by human strings configured in `TBA_OPR_STRINGS`. |
| **Match string** | TBA match key, e.g. `2026mnwi_qm12`; manual schedule uses `2023temp_qN`; FMS practice uses `<eventKey>_pmN`. |
| **Access code** | Single shared secret (`secrets.ACCESS_CODE`) sent as the `Authorization` header for admin/edit/setup/schedule pages. |
| **Demo mode** | `DEMO: true` — disables auth on admin pages, prevents deletes and sync writes, auto-enters matches immediately. |
| **Scouter status** | `NEW(0)`, `WAITING(1)`, `SCOUTING(2)`, `COMPLETE(3)`, `DISCONNECTED_BY_ADMIN(4)`. |
| **Shift** | 2026-game concept: teleop alternates 25 s "active"/"inactive" shifts; the client prefixes action ids with `activeShift1`, `inactiveShift2`, etc. |

## Page map (routes mounted by the server)

| Route | Purpose | Auth |
|-------|---------|------|
| `/` | Scouting client (landing → form/waiting → match scouting) | none |
| `/analysis` | Analysis dashboard | none |
| `/admin` | Admin dashboard | access code (unless DEMO or no code set) |
| `/edit` | Edit/flag/delete scouting data | access code |
| `/qrscanner` | Scan QR codes from offline scouters | none |
| `/schedule` | Manual match schedule entry | access code |
| `/setup` | Configuration wizard (also mounted at `/` when no config exists) | access code once one exists |
| `/config/*.json` | Serves configuration files to clients (secrets stripped) | none |
| `/executables.js`, `/analysis/modules.js`, `/analysis/modules.css`, `/analysis/transformers.js` | Server-generated client bundles | none |
| `/checklist` | Present in source but **not mounted** in `app.js` (dead code) | — |

**[A-7, A-10]** Google sign-in and the checklist page are dropped from the rewrite.
**[A-9]** The FRC Events (FMS) practice-match fallback is not used and may be dropped.
