# 11 — API Reference

Auth column: **code** = requires `Authorization: <ACCESS_CODE>` header (bypassed when no code
is configured, and for admin routes when `DEMO` is true); **none** = unauthenticated.

## Configuration and bundles

| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | `/config/config.json` | none | `config.json` without `secrets` |
| GET | `/config/match-scouting.json` | none | file |
| GET | `/config/qr.json` | none | file |
| GET | `/config/analysis-modules.json` | none | file |
| GET | `/config/analysis-pipeline.json` | none | file |
| GET | `/executables.js` | none | concatenated executables (JS) |
| GET | `/analysis/modules.js` | none | concatenated modules + `moduleClasses` map |
| GET | `/analysis/modules.css` | none | concatenated module CSS |
| GET | `/analysis/transformers.js` | none | browser `getTransformers()` bundle |
| GET | `/analysis/transformers2.js` | none | CommonJS `getTransformers()` bundle (server use) |

## Scouting

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| GET | `/` | none | Scouting SPA |
| GET | `/auth/verify` (header `token`) | none | Verifies a Google id token → `{ status, user? }` |
| GET | `/auth/isDemo` | none | `true`/`false` |
| GET | `/sw.js`, `/manifest.json`, `/css/*`, `/js/*` | none | static |

## Admin (`/admin`)

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| GET | `/admin` | none (client-side gate) | Admin page |
| GET | `/admin/restart` | code (400 if wrong) | `process.exit(0)` |
| * | `/admin/api/*` | — | 503 "Scouting Sync not initialized yet!" until ScoutingSync is ready |
| GET | `/admin/api/auth` | — | `{status: 2}` if DEMO or no code; `1` if header matches; else `0` |
| GET | `/admin/api/isDemo` | none | boolean |
| GET | `/admin/api/scouters` | code (not in DEMO) | scouter registry array; `{error:"Not Authorized"}` otherwise |
| GET | `/admin/api/data` | none | all TMPs (every event) |
| GET | `/admin/api/enterMatch` | code (not in DEMO) | Force WAITING→SCOUTING and emit `enterMatch` to all; `true`. In DEMO: emits to waiting scouters (double response bug) |
| GET | `/admin/api/disconnectScouter/:scouterId` | code (no response if wrong) | Kick scouter(s); `true` |
| POST | `/admin/api/setMatch` (body: match object) | code (not in DEMO) | Set current match, reassign; `true` |
| POST | `/admin/api/flagMatch` `{ id, flagged }` | none | Update `flagged`; `{ success, flagged }`; 400/404/500 |
| GET | `/admin/api/matches` | none | `{ allMatches, currentMatch }` (manual schedule if present, else TBA/FMS) |
| GET | `/admin/api/matches/:eventID` | none | Same for the event whose code prefix is the TBA key |
| GET | `/admin/api/checkMigration` | none | `{ needsMigration }` |

## Analysis (`/analysis`)

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| GET | `/analysis` | none | Analysis page |
| GET | `/analysis/api/blueApiOPRStrings` | none | `config.TBA_OPR_STRINGS` or `{ None: "None" }` |
| GET | `/analysis/api/blueApiData[/:eventID]` | none | TBA `/event/{key}/matches` (5-min cache) |
| GET | `/analysis/api/blueApiOPR[/:eventID]` | none | TBA `/event/{key}/coprs` (5-min cache) |
| GET | `/analysis/api/dataset` | none | TMPs where `eventNumber == config.EVENT_NUMBER` |
| GET | `/analysis/api/dataset/:eventID` | none | TMPs for that event |
| DELETE | `/analysis/api/dataset/:id` | none | Delete TMP by `_id` ("Deleted"); refused in DEMO |
| GET | `/analysis/api/isDemo` | none | boolean |
| GET | `/analysis/api/teams[/:eventID]` | none | Manual `tempTeams` if any (no-event form only), else TBA `/event/{key}/teams`; `[]` without a TBA key |
| GET | `/analysis/api/manual` | none | `{ teams: {}, tmps: [] }` from `src/analysis/manual/*.json` |
| GET | `/analysis/api/csv` | none | `teams.csv` attachment |
| GET | `/analysis/api/events` | none | all `events` documents |

## QR scanner (`/qrscanner`)

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| GET | `/qrscanner` | none | Scanner page |
| POST | `/qrscanner/api/teamMatchPerformance` (TMP body) | none | 204 if `matchId_rand` exists; else save → 201; 400 on bad body; 500 on save failure |
| POST | `/qrscanner/api/undo` | none | Delete the TMP with the last submitted `matchId_rand`; 200 |
| POST | `/qrscanner/api/sync` (TMP[] body) | none | Save each TMP unless an equivalent exists (robot, event, match, identical id sequence); 200 |

## Manual schedule (`/schedule`)

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| GET | `/schedule` | none (client gate) | Page |
| GET | `/schedule/api/auth` | — | status 0/1/2 |
| POST | `/schedule/api/matches` (match[] body) | none | Replace in-memory schedule and `tempTeams`; 200 |
| GET | `/schedule/api/matches` | none | schedule array (`[]` if none) |
| GET | `/schedule/api/tempTeams` | none | `[{ team_number, nickname: "temp team" }]` |

## Edit (`/edit`)

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| GET | `/edit` | none (client gate via `/admin/api/auth`) | Page (uses analysis/admin APIs) |

## Setup (`/setup`, or `/` when unconfigured)

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| GET | `/setup` | none (client gate) | Wizard |
| GET | `/setup/api/auth` | — | status 0/1/2 (2 when no config file / no code) |
| GET | `/setup/api/events` (header `database-url`) | none | event codes sorted desc |
| POST | `/setup/api/createEventCode` `{ databaseURL, eventCode }` | none | 201 / 409 / 400 / 500 |
| GET | `/setup/api/config` | code | `{ config }` with `EVENT_NUMBER` as code string; `{}` when unconfigured |
| POST | `/setup/api/config` `{ ACCESS_CODE, config }` | code (in body) | Validate, write, `{ success }`, then exit |

## Socket.IO (namespace `/`)

| Direction | Event | Payload |
|-----------|-------|---------|
| client → server | `updateState` | partial scouter state; ack `()` |
| client → server | `updateScouterID` | scouter id (emitted by client; **no server handler**) |
| client → server | `teamMatchPerformances` | TMP[]; ack `(true)` |
| client → server | `syncData` | `matchId[]`; callback `(requestedIds[])` |
| server → client | `updateState` | partial state |
| server → client | `enterMatch` | — |
| server → client | `syncRequest` | — |
| server → client | `adminDisconnect` | — |
| server → client | `err` | message (client ignores) |

## External APIs used

| API | Endpoint | Auth |
|-----|----------|------|
| TBA v3 | `/event/{key}/matches`, `/event/{key}/teams`, `/event/{key}/coprs`, `/team/frc3061` (key validation) | header `X-TBA-Auth-Key` |
| FRC Events v3.0 | `/{year}/schedule/{eventCode}?tournamentLevel=practice` | HTTP basic (`FMS_API_USERNAME` / `FMS_API_KEY`) |
| Google Identity | `apis.google.com/js/platform.js`, id-token verification | client id (non-functional) |
