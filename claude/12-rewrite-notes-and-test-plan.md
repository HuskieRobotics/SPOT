# 12 — Rewrite Notes: Quirks, Bugs, Dead Code, Decisions, and Test Plan

This document collects everything a rewrite should consciously keep, fix, or decide. Items
labelled **keep** are behaviors users rely on even if odd; **fix** are defects; **decide**
are open design choices.

## Behaviors to keep even though they look odd

- **K-1** Action ids are composed at runtime from the phase/shift display text (SC-23). Pipelines
  and modules reference those composite ids; any change to the prefixing scheme breaks every
  config.
- **K-2** Temp actions (`startGame`, `teleopActive`, `teleopInactive`) never leave the client but
  count toward the undo guard (`minOfQueueLength`) and the last-actions readout.
- **K-3** `ts` counts **down** (milliseconds remaining). `cycle.timeDifferential = start.ts - end.ts`
  is therefore positive. TBA-derived synthetic actions use `ts = 0`.
- **K-4** `countActions(all)` seeds zeros for every id in `match-scouting.json` and adds unknown
  ids on the fly; the hidden catalog layer is how configs make composite ids "known".
- **K-5** A team appears in the analysis sidebar only if it is both in the dataset and in the
  TBA/manual team list.
- **K-6** In demo mode `syncData` returns `[]`, so scouted data is never uploaded through the
  socket; the client still receives the ack, **clears IndexedDB**, reports "Data Sync
  Complete!", and reloads. Demo scouting data is therefore discarded by design.
- **K-7** The setup wizard exits the process after saving; hosting must auto-restart.
- **K-8** Manual schedule and scouter registry are in-memory only.

## Defects observed in the current code (fix in a rewrite)

- **F-1** `climbHighlight.reverse` searches the action queue for ids equal to *button* ids, but
  recorded ids carry a phase prefix, so `.find(...)` can return `undefined` and throw
  (`Cannot read properties of undefined`) when undoing a highlighted button after a prefix is
  active. Match by `baseId` instead.
- **F-2** The tmp variant of `averageArray` does not `return dataset`; using it breaks the
  pipeline.
- **F-3** `finalActionOccurrence` reverses the action array in place, corrupting later
  transformers' view of the queue.
- **F-4** The QR id enumeration (8 bits) covers 237 ids in the 2026 config; a few composite ids
  that can occur are not in the catalog (e.g. `autoAttemptL1`, `autoFallL1`,
  `teleopTransitionAttemptClimb`, `activeShift1AttemptClimb`, and `teleop*` ids when the
  shift button is never pressed). Encoding such an id yields `NaN` bits and a corrupt QR
  payload. A rewrite should encode ids by a stable dictionary (or encode strings) and validate.
- **F-5** QR encoder `encodeValue` uses `2**64-1` for `matchId_rand`, exceeding safe integer
  precision; `matchId_rand` is a 32-bit value so 64 bits are wasted but harmless. `matchNumber`
  is capped at 255.
- **F-6** TBA caches (`tbaResults`, `tbaOPRResults`) are global and not keyed by event; the
  `/:eventID` variants can serve another event's data for up to 5 minutes.
- **F-7** `/analysis/api/csv` duplicates every TMP (fetches the dataset via HTTP and again from
  Mongo) and relies on `removeDuplicates` to collapse them; without that transformer all
  averages are unaffected but `countMatches`-style logic and cycle arrays double.
- **F-8** `GET /admin/api/enterMatch` in demo mode calls `res.json` twice.
- **F-9** `updateScouters` prune loop uses assignment (`x.timestamp = timestamp`) instead of
  comparison, so it never prunes and mutates the fetched list.
- **F-10** `updateScouterID` is emitted by the client but has no server handler.
- **F-11** `analysis-transformers.json` has duplicate `types`/`ignore` keys.
- **F-12** `tempTeams` de-duplication compares numbers to objects and never de-duplicates.
- **F-13** Google sign-in is wired to a hard-coded client id and `process.env.CLIENT_ID`
  (never set); the feature is non-functional.
- **F-14** `initSidebarToggle.updateButtonLayout` calls `className.equals` (not a function);
  unreachable in practice.
- **F-15** The Edit page ignores QR-cached TMPs (merge commented out) while the analysis page
  merges them; the two views can disagree.
- **F-16** Service worker pre-caches CDN URLs (fonts, plotly, unpkg) — install fails entirely if
  any single URL is unreachable at install time.
- **F-17** `Popup` for `connect_error` fires on every reconnect attempt, spamming the UI when
  offline.
- **F-18** `SingleDisplay.formatData` with `wholeMatch` mutates the shared `alliances` array via
  `push("|")` in `setMatchModules`.
- **F-19** Hard-coded 2026 game constants in the scouting client: `autoPhaseEndTime = 140000`,
  `endgameTime = 30000`, `shiftSwitchInterval = 25000`, shift button ids, `AZone`/`OAZone`
  ids, A-Stop detection, and the half-field coordinate transform in `HeatmapScatterPlot`.
  These violate principle P1 and should move into configuration.

## Security concerns (decide)

- **S-1** Everything that reads or writes scouting data is unauthenticated except the admin
  registry/match endpoints and config. **[A-30, A-31]** The server is public and some
  authentication is wanted; at minimum admin must be distinguished from other roles as today.
  Recommendation: an admin password (env-provided, R-32) for admin/edit/setup/schedule, plus a
  per-event **scouting join code** shown on the admin page that scouters enter once; read APIs
  behind the same join code so the dataset is not world-readable.
- **S-2** The access code is a single shared password compared in plain text and echoed back
  by `/setup/api/config` along with all other secrets.
- **S-3** `/setup/api/events` and `/createEventCode` accept an arbitrary MongoDB URL from the
  client and connect to it (SSRF-like). `/setup/api/config` connects to the submitted URL
  before checking anything else once a config exists (it does check the access code first).
- **S-4** `/admin/restart` lets anyone with the code kill the process; `/qrscanner/api/undo`
  lets anyone delete the last QR submission.
- **S-5** `eval` of a server-generated bundle in the CSV route.

## Dead or vestigial code (safe to drop or restore deliberately)

- `src/checklist/**` (unmounted), `BubbleSheetGraph` module (empty), `flashBorder`/`example`
  executables, `conditionalLayerUndo` (duplicate), `Scouter.sync()`/`syncRequest` (never
  triggered), `express-session`, `qrcode` server dependency, `stuff.json`, `temp.ejs`,
  commented-out match view / auto pick list, `autoPick.js` quicksort helpers (broken but
  unused), `manual/*.json` hooks (empty), `_template2` CommonJS path.

## Design decisions a rewrite must make

- **D-1** Keep the JSON configuration formats byte-compatible (so archived year configs still
  load) or define a versioned successor with a converter. The four config files are the
  platform's public interface.
- **D-2** Where game-specific behavior currently lives in code (F-19), define configuration
  hooks: phase/shift model, lock rules, alliance-relative buttons, field-map transforms.
- **D-3** Choose a stable, config-independent id encoding for QR payloads.
- **D-4** Persist the manual schedule and current match (database or file) so restarts and
  multi-instance deployments work.
- **D-5** Replace server self-HTTP calls with direct function calls; run the pipeline in one
  shared implementation for both browser and CSV.
- **D-6** Decide whether to restore Simulate Match and Auto Pick List (requires
  `standardDeviation` and `averageScores.total` in the pipeline).
- **D-7** Normalize robot ids to a single type across TBA/FMS/manual sources.
- **D-8** Consider replacing the marker-based transformer bundling with ES modules and
  explicit registration, while keeping the drop-in-file extension model.
- **D-9** Offline strategy: keep the service worker approach or move to an app-shell with
  explicit data caching; keep IndexedDB buffering and QR fallback either way.
- **D-10** Realtime transport and framework: a Next.js + Tailwind/shadcn rewrite with SSE +
  fetch replacing Socket.IO is under consideration; see document 15 for the message-by-message
  analysis, the conditions (heartbeat, resync on reconnect, session id, kick handling,
  single-instance or shared-store hosting), and the spec items it would change.

## Resolved decisions from maintainer answers (document 14, answered 2026-09-17)

| Decision | Resolution | Where applied |
|----------|------------|---------------|
| D-1 config compatibility | JSON (or equally accessible) config is required for non-programmers; archived configs not required; documented pipeline structure and best practices should be preserved [A-1, A-3] | 01 P2, 04 CF-12a |
| D-2 game constants in code | Move shifts, A-Stop boundary, field orientation, heatmap fold, position lock, filter bands, TBA enrichment mapping into config [A-17, A-18, A-19, A-20, A-21, A-14, A-34] | 04, 05, 08, 09 |
| D-3 QR id encoding | Replace catalog layer with explicit `knownActionIds` [A-23]; composite ids stay compatible [A-22] | 04 CF-9/9a |
| D-4 persistence of schedule/match | Manual schedule low priority; if kept, must match Usage Guide incl. row locks [A-8] | 07 AD-25a |
| D-5 self-HTTP and one pipeline | Confirmed; CSV client-side [A-11, BL-232] | 08 AN-26a |
| D-6 restore Simulate Match / Auto Pick | Yes, toggled by config [A-6, BL-299] | 08 |
| D-7 robot id type | unchanged (normalize) | 03 |
| D-8 extension model | Runtime discovery preferred; a code-updating tool acceptable; must remain usable by non-programmers [A-5, A-49] | 01 P4, 15 |
| D-9 offline | Keep IndexedDB buffering and QR; QR is emergency-only but real (some venues have no connectivity); batch upload when coverage returns [A-25]; add unsynced list BL-93 | 05 |
| D-10 stack/transport | Next.js, Tailwind, MongoDB preferred [A-4]; 2–3 s latency fine, so polling or SSE [A-50]; EC2 bare Node + nginx + Atlas, GCP easy path [A-48, A-43] | 02, 10, 15 |
| Data migration | One-time migration acceptable; old seasons may be left behind [A-2] | 03 |
| Duplicate scouting | Never two scouters on one robot at once; re-scout replaces earlier data [A-29] | 06 RT-14a |
| Admins | 2–3 concurrent admins; start rule configurable [A-28, BL-33, BL-34] | 06 RT-14b |
| Google sign-in, checklist, FMS, AMI/Glitch/Render | Dropped [A-7, A-9, A-10, A-44] | 01, 07, 10 |
| Flagging | Manual flag = re-scout needed; analysis warns; auto-flag later [A-12, BL-208] | 07, 08 |
| Timestamps | Keep countdown [A-33] | 03 DM-3 |
| Units | Milliseconds only [A-40]; `startAction`/`endAction` only [A-41] | 04 |
| Accessibility / branding | Accessibility required, no localization [A-46]; keep name and logo, palette free [A-47] | 02 NF-9/10 |
| Testing data | Real past-season dump can be provided, but a synthetic generator is required for preseason verification [A-45] | T-4 below |
| Security | Public server; some auth wanted; admin must be distinguished from other roles at minimum [A-30, A-31] | S-1/S-2 |

**R-32 Recommendation for a secure yet easy first-run workflow [A-32]:** do not accept a
database URL from the browser. Provide `MONGODB_URI` and `SPOT_ADMIN_PASSWORD` (or an
initial setup token printed to the server log on first boot) as environment variables or a
`.env` file, which the deploy recipes for EC2 and Cloud Run both set. The web wizard then only
edits non-secret settings (event, TBA key stored in the database but never echoed back after
save, OPR keys, toggles) after the admin logs in with the password, and writes them to
MongoDB so no restart is needed. Secrets are write-only in the UI (shown as "set" / "not
set"). This keeps the "visit the URL and fill a form" experience while closing S-2 and S-3.

**R-35 Explanation for question 35 [A-35]:** `TBA_OPR_STRINGS` are the names of TBA
"component OPR" statistics (for example `Hub Total Fuel Count`) that the analysis page
attaches to each team as `opr.<name>`. Today the wizard shows a screenshot of the available
names and free-text boxes; the suggestion was to fetch the list from TBA
(`/event/{key}/coprs`) and offer a multi-select. Treat as a small usability improvement.

## Backlog from GitHub issues

Document 16 classifies all 41 open issues. Items marked **core** there are part of the
rewrite scope; items marked **next** must have their design hooks reserved (dataset
`scouters` collection, TMP `notes`/`tags`/flag metadata, pit-scouting document, tenant
scoping, telemetry toggle).

## Automated testing requirements (added 2026-09-16)

The current repository has no automated tests; every pull request is verified by hand
against the System Test Plan below. The rewrite MUST replace that with an automated suite so
that a new feature can be verified not to break existing behavior. Requirements:

- **T-1** Tests run in CI on every pull request and must pass before merge; a local
  single-command run (`npm test`) executes the fast layers, and a second command runs the
  end-to-end layer.
- **T-2** Unit tests (fast, no browser, no database) cover the pure logic that carries the
  platform's behavioral contract:
  - every transformer in document 09 (options, edge cases: empty TMPs, missing paths,
    divide-by-zero, duplicate TMPs, cycles with unmatched starts/ends);
  - `getPath`/`setPath`;
  - action-id composition from phase/shift text (SC-23) and the shift state machine (SC-22);
  - the undo rules (SC-24) and layer-history stack;
  - QR encode/decode round-trip for every id in the catalog and rejection of unknown ids
    (document 03);
  - the robot assignment algorithm and start rules (RT-9 to RT-13), including disconnects
    and duplicates;
  - TBA/FMS/manual schedule normalization (DM-8 to DM-10) and the linear match numbering;
  - TBA score-breakdown enrichment (DM-11) and OPR attachment (DM-13);
  - Filter Teams predicate rules (AN-21) and Stats/ColumnDisplay ranking (MO-4);
  - CSV column generation (AN-26).
- **T-3** Configuration validation tests load the 2026 configuration and every archived
  year configuration in `config/` and assert they parse, reference only known executables,
  transformers, and modules, and that every id referenced by the pipeline and modules exists
  in the corresponding `match-scouting.json` catalog (this would have caught F-4).
- **T-4** Golden-dataset regression tests run the full pipeline on a fixed set of recorded
  TMPs (real or synthetic, checked into the repo). **[A-45]** A real past-season dump can be
  provided, but because features must be verified before any matches of a new season exist,
  the suite MUST include a **synthetic TMP generator** driven by a `match-scouting.json`
  (random but rule-respecting action queues), and golden expectations for it and compare the derived `counts`,
  `scores`, `cycles`, `averages`, and `averageScores` against stored expected output, so any
  change to a transformer that alters results is visible in the diff.
- **T-5** API/integration tests exercise every endpoint in document 11 against an ephemeral
  MongoDB (in-memory server or a container): auth status codes, demo-mode behavior, TMP
  de-duplication on sync and QR submission, flag/delete, event-scoped datasets, and setup
  validation, with TBA/FMS calls stubbed.
- **T-6** Realtime tests drive the scouter session protocol (document 06, or its SSE
  replacement from document 15) with simulated clients: sign-in, assignment, six-waiting
  auto-start, admin force-start, kick, disconnect pruning, and resync after reconnect.
- **T-7** End-to-end browser tests (for example Playwright, mobile viewport) cover the
  critical user journeys once each: scout a full match and submit online; scout offline and
  produce a QR code, then scan it on the scanner page; admin selects a match and assigns
  scouters; analysis loads a team, the bubble graph, and Filter Teams; edit page flags and
  deletes a TMP; setup wizard saves a configuration. The manual plan below is the source of
  these journeys.
- **T-8** Offline behavior is tested by loading the app, going offline in the browser
  harness, and asserting the scouting and analysis pages still function from cache.
- **T-9** Test fixtures must not require live TBA or FMS credentials; all external calls are
  recorded or stubbed. A small recorded TBA event (matches, teams, coprs) is checked in.
- **T-10** Executables (document 05) are testable in isolation: each `execute`/`reverse`
  pair is exercised against a fake button/layer DOM, and `reverse` after `execute` must
  restore the prior state (this would have caught F-1).

Mapping of the manual System Test Plan to automated layers:

| Manual test | Automated by |
|-------------|--------------|
| Data visualization per team vs TBA | T-4 golden dataset; T-7 smoke render of each module |
| Auto Pick List order | T-2 (if restored) |
| Choose event | T-5 event-scoped endpoints; T-7 |
| Bubble graph axes | T-7 |
| Simulate Match prediction | T-2 probability math (if restored) |
| Side stats sanity | T-4 |
| Offline analysis | T-8 |
| Demo connection and non-persistence | T-5, T-6 |
| Generate event key; schedule matches TBA | T-5 setup API; T-2 schedule normalization |
| Delete TMPs from `/edit` | T-5, T-7 |
| QR scanning and submit | T-2 round-trip; T-5 submission de-dup; T-7 |
| CSV export | T-2 columns; T-5 endpoint |
| Sign in appears on `/admin` | T-6 |
| Go to Analysis | T-7 |
| All buttons appear in readout; undo removes action | T-2 (undo/readout logic); T-10; T-7 |
| Submit creates TMP | T-5, T-7 |
| No two scouters on one robot | T-2/T-6 assignment |
| Manual schedule | T-5, T-7 |
| Offline scouting and QR generation | T-7, T-8 |
| Offline admin scan and later sync | T-5 sync endpoint; T-8 |

## System test plan (from the SPOT System Test Plan, mapped to features)

Analysis
- Data visualization per team makes sense versus TBA for several teams.
- (If restored) Auto Pick List ordering roughly matches qualification rankings.
- Choose Event: pick another official event; attending teams and data match TBA.
- Bubble graph: data visible; all axis options selectable; values plausible.
- (If restored) Simulate Match: predictions roughly match actual results.
- Side stats: no absurd cycle times or percentages.
- Offline analysis: clear site data, load the page several times online, disconnect, reload —
  all features except event switching still work.

Demo
- Connection shows "Connected"; scouting flow behaves as in match scouting with immediate
  entry; data does not change the database (verify in `/analysis` and `/edit`).

Setup
- Generate event key: appears in the event dropdown; robots match TBA; `/admin` schedule
  matches TBA.
- Demo toggle: data is not registered when on.

Admin
- Delete TMPs from `/edit`; reload; gone.
- QR code scanning: choose camera, scan, submit; data appears for that team in `/analysis`
  and `/edit`.
- Export Data downloads a CSV listing all teams for the event.
- Restart server works with the access code.

Match scouting
- Sign in; name appears on `/admin`.
- Settings → Go to Analysis opens the analysis page.
- Connection status shows connected without errors.
- Every action button appears in the last-actions readout; `/analysis` reflects new data;
  undo removes the action from both the readout and the resulting data.
- Submitting a match creates a TMP visible in `/edit`; analysis updates.

Team assignment
- Two scouters are never assigned the same robot (admin panel and device screens agree).

Manual schedule
- Create a manual schedule in `/schedule`; scout matches from it.

Offline scouting
- Clear site data; load the page several times online; disconnect; reload; scout a match;
  a QR code is generated on submit.

Offline admin
- Clear site data; load `/admin` several times online; disconnect; reload; scan a QR code
  (data is cached and synced later).

Other
- Documentation updated; code reviewed for efficiency, no hard-coding, structure, conventions.
