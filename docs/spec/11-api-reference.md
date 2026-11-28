# 11 — API Reference

The sections below describe v5. v6's routes, as they are built, are in [v6 routes](#v6-routes)
at the end.

Auth column: **code** = requires `Authorization: <ACCESS_CODE>` header (bypassed when no code
is configured, and for admin routes when `DEMO` is true); **none** = unauthenticated.

## Configuration and bundles

| Method | Path                             | Auth | Response                                         |
| ------ | -------------------------------- | ---- | ------------------------------------------------ |
| GET    | `/config/config.json`            | none | `config.json` without `secrets`                  |
| GET    | `/config/match-scouting.json`    | none | file                                             |
| GET    | `/config/qr.json`                | none | file                                             |
| GET    | `/config/analysis-modules.json`  | none | file                                             |
| GET    | `/config/analysis-pipeline.json` | none | file                                             |
| GET    | `/executables.js`                | none | concatenated executables (JS)                    |
| GET    | `/analysis/modules.js`           | none | concatenated modules + `moduleClasses` map       |
| GET    | `/analysis/modules.css`          | none | concatenated module CSS                          |
| GET    | `/analysis/transformers.js`      | none | browser `getTransformers()` bundle               |
| GET    | `/analysis/transformers2.js`     | none | CommonJS `getTransformers()` bundle (server use) |

## Scouting

| Method | Path                                          | Auth | Behavior                                         |
| ------ | --------------------------------------------- | ---- | ------------------------------------------------ |
| GET    | `/`                                           | none | Scouting SPA                                     |
| GET    | `/auth/verify` (header `token`)               | none | Verifies a Google id token → `{ status, user? }` |
| GET    | `/auth/isDemo`                                | none | `true`/`false`                                   |
| GET    | `/sw.js`, `/manifest.json`, `/css/*`, `/js/*` | none | static                                           |

## Admin (`/admin`)

| Method | Path                                       | Auth                        | Behavior                                                                                                              |
| ------ | ------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin`                                   | none (client-side gate)     | Admin page                                                                                                            |
| GET    | `/admin/restart`                           | code (400 if wrong)         | `process.exit(0)`                                                                                                     |
| *      | `/admin/api/*`                             | —                           | 503 "Scouting Sync not initialized yet!" until ScoutingSync is ready                                                  |
| GET    | `/admin/api/auth`                          | —                           | `{status: 2}` if DEMO or no code; `1` if header matches; else `0`                                                     |
| GET    | `/admin/api/isDemo`                        | none                        | boolean                                                                                                               |
| GET    | `/admin/api/scouters`                      | code (not in DEMO)          | scouter registry array; `{error:"Not Authorized"}` otherwise                                                          |
| GET    | `/admin/api/data`                          | none                        | all TMPs (every event)                                                                                                |
| GET    | `/admin/api/enterMatch`                    | code (not in DEMO)          | Force WAITING→SCOUTING and emit `enterMatch` to all; `true`. In DEMO: emits to waiting scouters (double response bug) |
| GET    | `/admin/api/disconnectScouter/:scouterId`  | code (no response if wrong) | Kick scouter(s); `true`                                                                                               |
| POST   | `/admin/api/setMatch` (body: match object) | code (not in DEMO)          | Set current match, reassign; `true`                                                                                   |
| POST   | `/admin/api/flagMatch` `{ id, flagged }`   | none                        | Update `flagged`; `{ success, flagged }`; 400/404/500                                                                 |
| GET    | `/admin/api/matches`                       | none                        | `{ allMatches, currentMatch }` (manual schedule if present, else TBA/FMS)                                             |
| GET    | `/admin/api/matches/:eventID`              | none                        | Same for the event whose code prefix is the TBA key                                                                   |
| GET    | `/admin/api/checkMigration`                | none                        | `{ needsMigration }`                                                                                                  |

## Analysis (`/analysis`)

| Method | Path                                   | Auth | Behavior                                                                                              |
| ------ | -------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/analysis`                            | none | Analysis page                                                                                         |
| GET    | `/analysis/api/blueApiOPRStrings`      | none | `config.TBA_OPR_STRINGS` or `{ None: "None" }`                                                        |
| GET    | `/analysis/api/blueApiData[/:eventID]` | none | TBA `/event/{key}/matches` (5-min cache)                                                              |
| GET    | `/analysis/api/blueApiOPR[/:eventID]`  | none | TBA `/event/{key}/coprs` (5-min cache)                                                                |
| GET    | `/analysis/api/dataset`                | none | TMPs where `eventNumber == config.EVENT_NUMBER`                                                       |
| GET    | `/analysis/api/dataset/:eventID`       | none | TMPs for that event                                                                                   |
| DELETE | `/analysis/api/dataset/:id`            | none | Delete TMP by `_id` ("Deleted"); refused in DEMO                                                      |
| GET    | `/analysis/api/isDemo`                 | none | boolean                                                                                               |
| GET    | `/analysis/api/teams[/:eventID]`       | none | Manual `tempTeams` if any (no-event form only), else TBA `/event/{key}/teams`; `[]` without a TBA key |
| GET    | `/analysis/api/manual`                 | none | `{ teams: {}, tmps: [] }` from `src/analysis/manual/*.json`                                           |
| GET    | `/analysis/api/csv`                    | none | `teams.csv` attachment                                                                                |
| GET    | `/analysis/api/events`                 | none | all `events` documents                                                                                |

## QR scanner (`/qrscanner`)

| Method | Path                                             | Auth | Behavior                                                                                    |
| ------ | ------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------- |
| GET    | `/qrscanner`                                     | none | Scanner page                                                                                |
| POST   | `/qrscanner/api/teamMatchPerformance` (TMP body) | none | 204 if `matchId_rand` exists; else save → 201; 400 on bad body; 500 on save failure         |
| POST   | `/qrscanner/api/undo`                            | none | Delete the TMP with the last submitted `matchId_rand`; 200                                  |
| POST   | `/qrscanner/api/sync` (TMP[] body)               | none | Save each TMP unless an equivalent exists (robot, event, match, identical id sequence); 200 |

## Manual schedule (`/schedule`)

| Method | Path                                   | Auth               | Behavior                                        |
| ------ | -------------------------------------- | ------------------ | ----------------------------------------------- |
| GET    | `/schedule`                            | none (client gate) | Page                                            |
| GET    | `/schedule/api/auth`                   | —                  | status 0/1/2                                    |
| POST   | `/schedule/api/matches` (match[] body) | none               | Replace in-memory schedule and `tempTeams`; 200 |
| GET    | `/schedule/api/matches`                | none               | schedule array (`[]` if none)                   |
| GET    | `/schedule/api/tempTeams`              | none               | `[{ team_number, nickname: "temp team" }]`      |

## Edit (`/edit`)

| Method | Path    | Auth                                     | Behavior                        |
| ------ | ------- | ---------------------------------------- | ------------------------------- |
| GET    | `/edit` | none (client gate via `/admin/api/auth`) | Page (uses analysis/admin APIs) |

## Setup (`/setup`, or `/` when unconfigured)

| Method | Path                                                      | Auth               | Behavior                                                                |
| ------ | --------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------- |
| GET    | `/setup`                                                  | none (client gate) | Wizard                                                                  |
| GET    | `/setup/api/auth`                                         | —                  | status 0/1/2 (2 when no config file / no code)                          |
| GET    | `/setup/api/events` (header `database-url`)               | none               | event codes sorted desc                                                 |
| POST   | `/setup/api/createEventCode` `{ databaseURL, eventCode }` | none               | 201 / 409 / 400 / 500                                                   |
| GET    | `/setup/api/config`                                       | code               | `{ config }` with `EVENT_NUMBER` as code string; `{}` when unconfigured |
| POST   | `/setup/api/config` `{ ACCESS_CODE, config }`             | code (in body)     | Validate, write, `{ success }`, then exit                               |

## Socket.IO (namespace `/`)

| Direction       | Event                   | Payload                                               |
| --------------- | ----------------------- | ----------------------------------------------------- |
| client → server | `updateState`           | partial scouter state; ack `()`                       |
| client → server | `updateScouterID`       | scouter id (emitted by client; **no server handler**) |
| client → server | `teamMatchPerformances` | TMP[]; ack `(true)`                                   |
| client → server | `syncData`              | `matchId[]`; callback `(requestedIds[])`              |
| server → client | `updateState`           | partial state                                         |
| server → client | `enterMatch`            | —                                                     |
| server → client | `syncRequest`           | —                                                     |
| server → client | `adminDisconnect`       | —                                                     |
| server → client | `err`                   | message (client ignores)                              |

## External APIs used

| API             | Endpoint                                                                                             | Auth                                            |
| --------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| TBA v3          | `/event/{key}/matches`, `/event/{key}/teams`, `/event/{key}/coprs`, `/team/frc3061` (key validation) | header `X-TBA-Auth-Key`                         |
| FRC Events v3.0 | `/{year}/schedule/{eventCode}?tournamentLevel=practice`                                              | HTTP basic (`FMS_API_USERNAME` / `FMS_API_KEY`) |
| Google Identity | `apis.google.com/js/platform.js`, id-token verification                                              | client id (non-functional)                      |

## v6 routes

Auth column: **admin** = the `spot-admin` session cookie, checked by `src/proxy.ts` for
everything under `/admin` and `/api/admin` (SEC-4a, SEC-5a); **open** = no admin session
needed (the scouter routes check the device's session instead, ADR 0001); **join code** = the
active event's join code in `X-SPOT-Join-Code`.
Errors are JSON `{ error, message }`, with a message a person can act on.

| Method | Path                                                                 | Auth      | Behavior                                                                                                                                                                                                                                                                                                   |
| ------ | -------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/sign-in?next=<path>`                                         | open      | Sign-in page; returns to `next` (a path on this site) afterwards                                                                                                                                                                                                                                           |
| GET    | `/admin`                                                             | admin     | Admin page (#357): the event and join code with its QR code, the match and start, scouter cards, the roster (doc 07)                                                                                                                                                                                       |
| GET    | `/api/admin/session`                                                 | open      | `{ signedIn, configured }`                                                                                                                                                                                                                                                                                 |
| POST   | `/api/admin/session` `{ password }`                                  | open      | 204 and the cookie; 401 wrong password (after 500 ms); 503 no `SPOT_ADMIN_PASSWORD` set                                                                                                                                                                                                                    |
| DELETE | `/api/admin/session`                                                 | open      | 204, cookie cleared                                                                                                                                                                                                                                                                                        |
| GET    | `/api/admin/events`                                                  | admin     | Every event, with its join code (SEC-3)                                                                                                                                                                                                                                                                    |
| POST   | `/api/admin/events` `{ tbaKey, label }`                              | admin     | 201 with the new event and a fresh join code; 400 not a TBA key or label; 409 code in use                                                                                                                                                                                                                  |
| POST   | `/api/admin/events/:id/join-code`                                    | admin     | Rotate the join code → `{ joinCode, joinCodeRotatedAt }`; 404                                                                                                                                                                                                                                              |
| GET    | `/admin/schedule`                                                    | admin     | The match schedule page (#355)                                                                                                                                                                                                                                                                             |
| GET    | `/api/admin/schedule`                                                | admin     | `{ schedule }`: the schedule in use and its source per level (AD-8a), TBA's status and error, the typed schedule, the current match, every team; re-reads TBA when its copy is over five minutes old                                                                                                       |
| POST   | `/api/admin/schedule` `{ action, ... }`                              | admin     | `refresh` (read TBA now), `save-manual` `{ matches: [{ level, number, red, blue, locked? }] }` (a level with no typed matches uses TBA's) → `{ schedule }`; 400 with the match and slot; 409 no active event                                                                                               |
| GET    | `/api/admin/registry`                                                | admin     | `{ snapshot }`: event, current match, start rules, every entry with its name and `connected`; null with no active event. Admin views poll it every 2 to 3 s                                                                                                                                                |
| POST   | `/api/admin/registry` `{ action, ... }`                              | admin     | `set-match` `{ match: { level, number } \| null }` (RT-16), `start` (RT-12a), `release` `{ scouterId, to? }` (RT-31), `remove` `{ scouterId }` (RT-29) → `{ snapshot }`; 400, 404 no such match, 409 refused with a message                                                                                |
| GET    | `/api/admin/settings`                                                | admin     | `{ settings, event }`: the settings (DV-13) and the active event with its join code, or null                                                                                                                                                                                                               |
| POST   | `/api/admin/settings` `{ activeEvent?, startRules?, fieldFlipped? }` | admin     | Any of: the active event by code or null (DV-12b; devices sign in again), `{ quorum?, startOnFirstScouter? }` (RT-12a), the field orientation (A-19; sent to every device) → `{ settings, event }`; 400; 404 unknown code                                                                                  |
| GET    | `/api/admin/scouters`                                                | admin     | `{ scouters: [{ id, name }] }`: the roster, by name                                                                                                                                                                                                                                                        |
| POST   | `/api/admin/scouters` `{ action: "rename", scouterId, name }`        | admin     | Correct a name (SEC-6a) → `{ scouter: { id, name } }`; 400; 404 no such scouter                                                                                                                                                                                                                            |
| GET    | `/api/admin/performances?event=<id>`                                 | admin     | `{ event, rows }`: the event's records for the edit page (#410, AD-10 to AD-12), superseded included, newest first, each with its scouter's name and alliance and without its actions; no `event` is the active event; 400, 404, 409 no active event                                                       |
| GET    | `/api/admin/performances/:id`                                        | admin     | `{ actions }`: the record's actions in order (AD-13); 404                                                                                                                                                                                                                                                  |
| POST   | `/api/admin/performances/:id` `{ action, reason? }`                  | admin     | `flag` with an optional public reason of at most 300 characters (AD-13a, AD-14), `unflag` (no rule flags it again), `promote` (the record analysis uses, RT-35) → `{ ok: true }`; 400; 404                                                                                                                 |
| DELETE | `/api/admin/performances/:id`                                        | admin     | Delete the record (AD-15), kept apart so a copy sent again is a duplicate (DV-20); the robot's other records are settled again → `{ ok: true }`; 404                                                                                                                                                       |
| GET    | `/api/admin/scanner`                                                 | admin     | What the QR scanner reads codes with (#411, AD-19): `{ events: [{ id, code, season }], seasons: { <season>: match-scouting config } }`; a season whose file has errors is left out                                                                                                                         |
| GET    | `/api/health`                                                        | open      | 200 `{ status: "ok", database: "ok", build }`; 503 with `database` `"unreachable"` or `"not set"` and a message (#412). `build` is the running build's id, null under `next dev`                                                                                                                           |
| GET    | `/api/scouter/stream/check?seconds=70&every=25`                      | open      | A test stream for a server's proxy (#412): a comment at once and every `every` s (1 to 60) for `seconds` (1 to 300), then `event: done`; `npm run deploy:check` reads it                                                                                                                                   |
| POST   | `/api/admin/scanned` `{ records: [{ eventId, ...record }] }`         | admin     | Scanned records (#411, AD-20, AD-21), at most 50, each filed at the event its code names, with source `qr` → `{ results }` as `/api/scouter/performances` answers, `id` on each record stored; `invalid` for an event this server lacks; 400, 413                                                          |
| POST   | `/api/scouter/sign-in` `{ scouterId, deviceId, joinCode, name? }`    | open      | `{ view, name }`, binding the session to the device; `name` adds a scouter not on the roster (SEC-7a); 403 wrong join code; 404 not on the roster; 409 no active event                                                                                                                                     |
| GET    | `/`                                                                  | open      | The scouting client (#359, document 05): landing and sign-in, waiting, match scouting; `/?join=CODE` fills in the join code (SEC-3b)                                                                                                                                                                       |
| GET    | `/scouting-preview?season=<name>`                                    | open      | The scouting-screen preview (#322, K-5): draws the active `match-scouting.json`, or a season under `config/seasons/`, with its config:check errors when it has any (document 05)                                                                                                                           |
| GET    | `/sign-in`                                                           | open      | Redirects to `/`, keeping `?join=` (the sign-in screen moved into the client in #359)                                                                                                                                                                                                                      |
| GET    | `/analysis?event=<code>&team=<team>`, `&view=<view>`                 | open      | The analysis dashboard (#383, document 08): the event's teams, search, one team's view, or a view: `compare`, `filter`, `simulate` or `pick` (#387, #389); works offline for an event viewed online (#390)                                                                                                 |
| GET    | `/api/config/match-scouting`                                         | open      | `{ version, config }`: the active `match-scouting.json` (CS-17); `?season=<name>` reads another season's (#383); `ETag` is the version, `Cache-Control: no-cache`, 304 for a matching `If-None-Match`; 503 when the file has errors                                                                        |
| GET    | `/api/config/analysis-pipeline`, `/api/config/analysis-modules`      | open      | `{ version, config, findings }` for the analysis dashboard (#382, CS-17); `?season=<name>` reads another season's file (#383), 404 for an unknown name: the version is the `ETag` (304 when unchanged), and `findings` is what config:check finds in the file; 503 only when the file can't be used at all |
| GET    | `/api/analysis/events`                                               | open      | `{ events: [{ code, tbaKey, label, active, season }] }`, newest code first, with no join code (#382, SEC-3, DV-12b); `season` names the configuration that reads the event (#383, CS-17)                                                                                                                   |
| GET    | `/api/analysis/dataset?event=<code>`                                 | open      | `{ event, performances }`: the event's current performances, without scouter ids (#382, SEC-1, SEC-8); the active event when `event` is absent; 404 with a message for an unknown code or no active event                                                                                                  |
| GET    | `/api/analysis/tba?event=<code>`                                     | open      | `{ event, tba, error }`: `tba` is `{ matches, coprs, teams, fetchedAt }`, kept per event and read from TBA again after five minutes (#382, DV-19, NF-6), or null when never read; `error` says why TBA could not be read just now                                                                          |
| GET    | `/api/analysis/schedule?event=<code>`                                | open      | `{ event, matches: [{ level, number, key, red, blue }] }`: the matches assignment uses (AD-8), from TBA or typed by an admin, for Simulate Match (#389, AN-23); never asks TBA; 404 with a message for an unknown code or no active event                                                                  |
| GET    | `/api/scouter/roster`                                                | join code | `{ scouters: [{ id, name }] }` by name (SEC-7a, SEC-8a)                                                                                                                                                                                                                                                    |
| GET    | `/api/scouter/schedule`                                              | join code | `{ eventId, matches: [{ level, number, red, blue }] }`: the active event and its schedule as stored (AD-8; never asks TBA), kept on the device for a match typed offline (#361, OF-1, SC-28)                                                                                                               |
| GET    | `/sw.js`                                                             | open      | The service worker (#361), with the build's file list; `Cache-Control: no-cache`. Under `next dev`, a worker that removes itself                                                                                                                                                                           |
| GET    | `/manifest.webmanifest`                                              | open      | The web app manifest (SC-5)                                                                                                                                                                                                                                                                                |
| POST   | `/api/scouter/roster` `{ scouters: [{ id, name }] }`                 | join code | Adds scouters a device added offline → `{ results: [{ id, status, name, message? }] }`, `status` `created`, `exists` or `conflict`                                                                                                                                                                         |
| POST   | `/api/scouter/action` `{ scouterId, deviceId, action }`              | open      | `accept`, `start`, `finish`, `ready`, `sign-out` → `{ view }`; 401 when this device does not hold the session                                                                                                                                                                                              |
| POST   | `/api/scouter/performances` `{ eventId, records }`                   | join code | Finished matches (#360): `{ results: [{ nonce, status, message?, id? }] }`, one per record, `stored`, `duplicate` or `invalid`; at most 50 records; 403 with the reason for a join code that does not open `eventId` (null: the active event), 404 for an unknown event                                    |
| GET    | `/api/scouter/stream?scouter=&device=`                               | open      | Server-sent events: `state` first, then `settings` (`fieldFlipped` and the active `eventId`, also sent when they change), `assigned`, `enter-match`, `unassigned`, `signed-out`; heartbeat every 20 s; 401 JSON for a session this device does not hold (ADR 0001)                                         |

Without a session, an admin page redirects to the sign-in page and an admin route answers 401
`{ error: "admin-sign-in" }`. A submission carries the join code in `X-SPOT-Join-Code`; a
refusal is 403 `{ error: "join-code", reason, message }` (SEC-3a).
