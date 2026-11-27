# 18 — Offline Operation (cross-cutting requirement)

Added 2026-09-17 at the maintainer's request. Offline operation is one of SPOT's defining
features and a major source of its complexity: **once a device has loaded the app while
online, scouting must work with no connection to the server at all, and analysis should
work against the last data it saw.** Principle P3 (document 01) states it; this document
makes it testable. It supersedes the scattered notes in AR-11 to AR-16, SC-5, SC-39 to SC-42,
AN-5, and NF-4, which remain as implementation detail of the current app.

## What "offline" covers today

Three distinct situations, all supported:

| Situation                                                                                                       | Scouting                                                                                                                                                    | Analysis                                                                                            | Admin / QR                                                                                   |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **O-1 Never connected to the server on this device** (app opened from cache, e.g. a venue with no connectivity) | Sign-in form asks for match and robot number; scouting runs entirely locally; submit shows a QR code                                                        | Renders from the cached dataset and cached config; event switching and live TBA fetches unavailable | QR scanner page loads from cache; scanned TMPs are stored in `localStorage` and synced later |
| **O-2 Connected earlier, disconnected now** (spotty coverage)                                                   | Scouting continues; submitted TMPs accumulate in IndexedDB; the next successful connection uploads all of them at once (a scouter can walk outside to sync) | Same as O-1                                                                                         | Same as O-1                                                                                  |
| **O-3 Connected**                                                                                               | Live assignment and sync                                                                                                                                    | Live                                                                                                | Live                                                                                         |

Answer 25 (document 14) confirms QR codes are used when there is no wifi or cell coverage
at all, and batch upload after walking to coverage is a routine workflow.

## How the current app achieves it (from `src/scouting/public/sw.js`)

The service worker pre-caches an explicit URL list at install. Crucially, the list is not
only static files; it includes **server-generated bundles** and **data endpoints** whose
responses are JSON or JavaScript assembled at request time. Without those cached responses
the pages cannot even initialize offline.

| Category                    | Cached URLs                                                                                                                                                                                                                                              | Why it is needed offline                                                                                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App shell (scouting)        | `/`, `/css/*`, `/js/*`, `/js/lib/*`, `/manifest.json`, icons, images                                                                                                                                                                                     | Pages and scripts                                                                                                                                                                                      |
| App shell (analysis)        | `/analysis/`, `/analysis/css/*`, `/analysis/js/*`                                                                                                                                                                                                        | Pages and scripts                                                                                                                                                                                      |
| App shell (QR scanner)      | `/qrscanner/`, its CSS/JS, `html5-qrcode.min.js`                                                                                                                                                                                                         | Scanner works offline, storing to `localStorage`                                                                                                                                                       |
| **Generated bundles**       | `/executables.js`, `/analysis/modules.js`, `/analysis/modules.css`, `/analysis/transformers.js`                                                                                                                                                          | Assembled by the server from folders (AR-6 to AR-9); the client cannot build them itself                                                                                                               |
| **Configuration endpoints** | `/config/config.json`, `/config/match-scouting.json`, `/config/qr.json`, `/config/analysis-modules.json`, `/config/analysis-pipeline.json`                                                                                                               | The scouting grid, QR encoder, and pipeline are all config-driven; nothing renders without them                                                                                                        |
| **Data endpoints**          | `/analysis/api/dataset`, `/analysis/api/teams`, `/analysis/api/events`, `/analysis/api/manual`, `/analysis/api/blueApiData`, `/analysis/api/blueApiOPR`, `/analysis/api/blueApiOPRStrings`, `/analysis/api/isDemo`, `/auth/isDemo`, `/admin/api/matches` | The analysis pipeline and the scouting client fetch these at load; a cached copy lets the pipeline run and lets the scouting client know the match schedule (alliance colors, zone-button orientation) |
| External                    | Plotly, Font Awesome, Google Fonts, simple-statistics, fuzzysort from CDNs                                                                                                                                                                               | Charts and fonts; install fails if any is unreachable (F-16)                                                                                                                                           |

Fetch strategy: `/analysis/api/dataset` is network-first (so edits are not masked by a
stale copy); everything else is cache-first with a background refresh that updates the
cache only for URLs in the list. The setup page unregisters all service workers so
configuration edits are not hidden by stale caches.

**Manual data hooks (revised answer 13).** `/analysis/api/manual` returns the contents of
`src/analysis/manual/teams.json` and `tmps.json`. Beyond being a server self-call target, it
is in the precache list because the pipeline unconditionally fetches it: a stable, cacheable
endpoint for optional hand-entered data is part of what makes the pipeline runnable offline.
Any replacement must preserve "every input the pipeline needs can be kept on the device" (OF-5).
**v6:** the hooks are dropped (DM-14, #345), so this input is gone; the analysis page's inputs
are the dataset, the TBA data and the configuration files (document 08, "v6: the data the
dashboard reads").

## Requirements for the rewrite

- **OF-1** After one online load of the scouting page, a device MUST be able to sign in,
  receive no assignment, enter match and robot number manually, scout a full match with the
  full configured grid (all layers, executables, field map image, timer), and produce a QR
  code, with the server unreachable and the page reloaded.
- **OF-2** TMPs submitted while disconnected MUST be retained locally (IndexedDB today) until
  the server acknowledges them, MUST survive page reloads and browser restarts, and MUST be
  uploaded in one batch on the next successful connection with server-side de-duplication.
  The user MUST be able to see what is pending and trigger a retry or a QR code per entry
  (BL-93).
- **OF-3** After one online load of the analysis page, the dashboard MUST render from the last
  cached dataset, configuration, team list, and TBA data, with all modules functional. Each
  event's dataset, team list, and TBA data are cached under that event whenever it is viewed
  online, so every event viewed on the device while online MUST also open offline (decided
  2026-11-20; v5 kept only the last dataset). Opening an event never viewed on the device,
  and refreshing TBA data, are allowed to fail gracefully. Whenever the dashboard shows cached
  data it MUST say so with a visible "offline, showing data from <time>" indicator for the
  event shown.
- **OF-4** The QR scanner page MUST work offline: scanned TMPs are cached locally and synced
  when the page next loads online, with de-duplication.
- **OF-5** Every input a page needs at startup MUST be kept on the device after one online
  load, or bundled: configuration, generated code, and the data snapshots listed above. The
  service worker or the page itself may keep an input (reworded 2026-11-26, #361; the earlier
  text required runtime caching rules in the worker for every endpoint).
  - **Code**, the build's hashed assets, is precached by the service worker from an injected
    manifest of the build output.
  - **Data** is kept by the page in the device's storage (`localStorage`, IndexedDB) or by
    runtime caching rules in the worker. The dataset is read from the network first, so an
    edit is never masked by a stale copy. A configuration carries a version stamp, so a
    change replaces stale copies (OF-8).
  - A kept copy is found by everything its reply depends on, such as the event a join code
    selects, not by its URL alone.
  - The page MUST be able to tell a kept copy from a fresh reply, so it can say what it is
    showing (OF-3, OF-7).
  - Extension bundles served from the `extensions/` folder (document 15) MUST be kept too.
- **OF-6** Third-party assets (charts, fonts, icons) MUST be self-hosted so cache install
  cannot fail on an unreachable CDN and so the app works on networks that block CDNs (F-16).
- **OF-7** The user MUST always see connection state (today's `Connected` / `Disconnected` /
  `Not Connected` label) and the app MUST never block on a network call; every fetch has a
  timeout and a cached fallback.
- **OF-8** Configuration changes MUST propagate to cached devices on the next online load (a
  version stamp in `/config/*` responses, or cache busting by config hash), and the setup
  page's "unregister service worker" escape hatch (or an equivalent "reset app data" control
  in the scouting settings menu) MUST remain available.
- **OF-9** Offline behavior is part of the automated suite (T-8): load online, go offline in
  the browser harness, reload, and assert OF-1, OF-3 (including switching to an event viewed
  earlier while online), and OF-4.

**v6 (#360):** OF-2 is built: finished matches wait in IndexedDB until the server acknowledges
them, are sent in batches with server-side de-duplication by nonce, and are listed with a retry
and a QR code each (document 05, "v6: the scouting client"; document 06, "v6: submission and
sync").

**v6 (#361):** for the scouting client, OF-1, OF-5 to OF-8 and the scouting part of OF-9 are
built (document 05, "v6: offline").

- **What the worker caches.** A hand-written service worker (`src/offline/service-worker.ts`)
  caches the build's shell at install, an injected manifest read from the build output:
  `.next/static/`, the images in `public/`, the manifest and `/`.
- **Why not Serwist.** Its Turbopack integration adds esbuild and SWC as build-time
  dependencies; the worker needed here is about 100 lines, and it is tested from the exact text
  `/sw.js` sends.
- **Where the data lives.** The scouting client's data (configuration, roster, schedule,
  settings) is kept in the device's own storage rather than by runtime caching rules in the
  worker, which never answers an `/api/` request. The page knows when a read failed and when
  its copy was taken, a copy is stored with its event, and a match keeps the configuration it
  was scouted with. The analysis page's network-first data and per-event copies (OF-3) chose
  the page's storage too (#390, "v6: offline analysis" below). The scanner (OF-4, Phase 4)
  chooses for its own data.
- **OF-6** Fonts are self-hosted by `next/font` at build time; icons are bundled. Plotly (#385)
  is bundled too, as its own 4.7 MB file that only a chart loads. The worker keeps every built
  file, so it keeps Plotly as well, ready for offline analysis (#390). **Decided 2026-11-26:**
  scouting phones keep it too (1.5 MB compressed, once per build). Scouters rarely open the
  analysis pages, but the build gives Plotly's file a hashed name with nothing in it to tell it
  apart, and leaving it out would mean serving Plotly outside the build: not worth it.
- **OF-9 test.** `tests/e2e/offline.spec.ts` loads online once, goes offline (the worker's own
  network included), reloads, signs in and scouts a typed 2026 match. It reads the QR code back
  from a screenshot with a decoder, then checks that the match is stored once after
  reconnecting and that a stale configuration is replaced on the next online load.

**v6: offline analysis (#390).** OF-3 and the analysis part of OF-5, OF-7 and OF-9 are built.

- **The page.** `/analysis` is in `OFFLINE_PAGES`, so the worker keeps it and answers it from
  the network first, then from its copy, whatever the address's `?event=` and `&team=`. The
  analysis page registers the worker too, so a device that never opens the scouting page still
  gets it. Plotly, the field pictures and the fonts are built files or images, which the worker
  keeps already.
- **Where the data lives (decided 2026-11-27).** The page keeps it, in IndexedDB, as the
  scouting client does; the worker still answers no `/api/` request. Each event viewed online is
  kept under its code, in a database of its own, `spot-analysis`
  (`src/components/analysis/kept.ts`). It holds the event's inputs: its performances, TBA data,
  three configuration files with their findings, and schedule. The page runs the pipeline on a
  kept copy as on a fresh one. The list of events is kept too. Several events outgrow
  `localStorage`; a browser that refuses IndexedDB keeps them for the page's life only.
- **Network first.** Every load asks the server first, so an edit is never hidden by an old
  copy, and a fresh answer replaces the copy. When a required input can't be read (no
  connection, or the server refuses it), the kept copy is shown. TBA's data and the schedule may
  fail on their own: the kept ones stand in, and TBA's notice says why.
- **OF-3, OF-7 notice.** A kept copy shows "Offline, showing data from <time>" for the event
  shown. When the server answered but refused, it shows the server's message and the time
  instead.
- **Graceful failure.** An event never viewed on the device fails at once with "No connection,
  and <event> has not been opened on this device while online", and a Try again button.
  Refreshing TBA's data with no connection shows the kept data.
- **Reset app data** in the scouting menu forgets the kept events too.
- **OF-9 test.** `tests/e2e/offline.spec.ts` views two events online, one with a team's charts,
  then goes offline and reloads. It sees both with the notice, draws a team's charts with Plotly
  from the worker's cache, and finds that an event never viewed says so. Back online, the server's
  data returns with no notice. Unit tests (`analysis-kept`) cover the same rules without a
  browser.

## Implications for the technology direction (document 15)

- The transport choice is unaffected: polling and SSE both degrade to "disconnected" and the
  offline paths never depend on them.
- Server-rendered pages are a liability offline; the scouting, analysis, and scanner pages
  should be fully client-rendered so the cached shell can boot without the server.
- Moving configuration from files into MongoDB (document 15) is fine as long as the
  `/config/*` responses remain cacheable JSON with a version stamp.
- The synthetic-data and oracle work (document 17) also gives the offline tests a realistic
  cached dataset.
