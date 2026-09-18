# 06 — Real-Time Coordination (ScoutingSync)

Socket.IO connects every scouting client to the server. The server keeps an in-memory
registry of scouters and the currently selected match, assigns robots, tells clients when to
enter a match, and receives TMPs.

## Scouter statuses

| Value | Name                  | Meaning                                                        |
| ----- | --------------------- | -------------------------------------------------------------- |
| 0     | NEW                   | Connected, has not signed in (no state sent beyond connection) |
| 1     | WAITING               | Signed in, on the waiting page (or offline-form flow)          |
| 2     | SCOUTING              | Pressed Start Match                                            |
| 3     | COMPLETE              | Submitted successfully (client reloads immediately after)      |
| 4     | DISCONNECTED_BY_ADMIN | Kicked by admin                                                |

## Server events (received from client)

- **RT-1 `updateState(stateUpdate, ack)`** — merge into `scouter.state`; run `assignScouters()`;
  call `ack()`.
- **RT-2 `teamMatchPerformances(tmps[], ack)`** — `TeamMatchPerformance.create(tmps)`;
  `ack(true)`. No validation, no auth, not gated by DEMO.
- **RT-3 `syncData(clientMatchIds[], reply)`** — if not DEMO: load all server TMP `matchId`s;
  reply with the subset of client ids that are absent on the server, also excluding ids whose
  `<match>-<robot>-qrcode-<rand>` twin exists. If DEMO: reply `[]` (never request uploads).
- **RT-4 `disconnect`** — mark `connected = false`, run `assignScouters()`; 60 s later remove the
  scouter from the registry if still disconnected.

## Server events (emitted to client)

- **RT-5 `updateState(stateUpdate)`** — partial state pushed by the server (assignment:
  `{ matchNumber, robotNumber }`; admin force: `{ status: SCOUTING }`).
- **RT-6 `enterMatch`** — instructs a waiting client to open the match-scouting page.
- **RT-7 `syncRequest`** — ask the client to run its sync routine (used by `Scouter.sync()`,
  currently not triggered by any route).
- **RT-8 `adminDisconnect`** — followed by a forced socket disconnect.

## Assignment algorithm (`assignScouters`, runs on every state update and disconnect)

- **RT-9** Build the set of robots in the current match (red then blue).
- **RT-10** Remove any robot that a _connected_ scouter with status SCOUTING is already on.
- **RT-11** For each _connected_ WAITING scouter (in registry order): if the pool is empty,
  refill it with all six robots (allowing duplicates only after every robot has a scouter);
  take the first robot from the pool and push `updateState({ matchNumber, robotNumber })`
  to that scouter.
- **RT-12** Start rule (non-demo): let W = connected WAITING scouters whose `matchNumber`
  equals the current match. If any scouter (connected or not) is SCOUTING the current match,
  emit `enterMatch` to all of W. Else if `|W| >= 6`, emit `enterMatch` to all of W.
- **RT-13** Start rule (demo): emit `enterMatch` to every W immediately.
- **RT-12a** **[decided 2026-09-17, ADR 0006]** The rewrite offers exactly three start rules:
  - **Admin force-start**, always available, and scoped to the scouters assigned to the current
    match rather than broadcast to everyone connected as in RT-15.
  - **Quorum start**, configurable, counting only connected WAITING scouters on the current
    match. Default six, which reproduces today's behavior; a team with fewer scouters can lower
    it instead of relying on force-start every match.
  - **Start on first scouter**, the RT-12 behavior where one person pressing Start pulls in
    everyone waiting. Configurable and **off by default**: it is the behavior reported in
    issue 34, and F-22 shows a stale entry can trigger it.

  A disconnected scouter never counts toward the quorum and never triggers a start.

- **RT-14** Robot numbers from TBA are strings; from FMS are numbers; the client compares with
  `==`. Assignment uses `Set` insertion order, which follows the schedule order red 1-3 then
  blue 1-3.
- **NOTE** Re-assignment on every update means a WAITING scouter's robot can change until they
  press Start; the client shows the assignment modal only when the (robot, match) pair changes
  after `enterMatch`.
- **RT-14a** **[A-29]** The same robot must never be scouted by two scouters at the same
  time (today the pool refills and allows duplicates once all six robots are taken; the
  rewrite must not). Re-scouting a match later is required, and the newer TMP replaces the
  earlier one for that robot/match in analysis.
- **RT-14b** **[A-28, BL-34]** Admin duties are shared by 2–3 students, so multiple concurrent
  admin sessions must work (BL-33). Whether auto-start on six waiting scouters or
  admin-only force-start is better is undecided; make the start rule configurable.
- **RT-14c** **[A-50]** A 2–3 s notification delay is acceptable, so short polling is a
  valid transport for this protocol (document 15).

## Scouter identity, sessions and reconnection (decided 2026-09-17, ADR 0006)

Dropping and reconnecting is the single most common failure at an event, and v5 handles it
badly (F-20 to F-23). These requirements replace the connection-keyed registry.

- **RT-24** The registry MUST be keyed by **scouter identity** (the student ID of SEC-6), not
  by socket or connection time. A reconnecting scouter resumes their existing entry. One person
  MUST NEVER occupy two rows in the admin view.
- **RT-25** A scouter's assignment MUST be retained while they are disconnected. Their robot is
  not returned to the pool and MUST NOT be offered to anyone else, so the never-two-scouters
  rule (RT-14a) holds across a disconnect and the scouter returns to the robot they were on.
  An admin MAY release an assignment explicitly when someone is not coming back.
- **RT-26** Session state MUST survive a page reload and a device restart, not just a socket
  blip. The client persists enough to resume: identity, match, robot and status. Today only the
  name is persisted (F-23).
- **RT-27** On reconnect a scouter returns to the status they left: SCOUTING resumes the same
  match and robot; WAITING returns to waiting. Reconnection MUST NOT re-prompt the assignment
  modal for an assignment the scouter already accepted.
- **RT-28** Buffered performances MUST survive the round trip. Reconnection triggers the
  existing sync exchange (RT-20), and nothing in the buffer is dropped because the socket
  changed.
- **RT-29** A disconnected scouter MUST remain visible to admins, marked as disconnected,
  rather than disappearing after a timeout. Entries persist for the event; an admin can remove
  one. This replaces the 60 s pruning of RT-4, which exists only because entries are keyed by
  connection.
- **RT-30** Every rule that counts or filters scouters MUST state whether it includes
  disconnected ones. Quorum and start triggers count connected scouters only (F-22); robot
  retention (RT-25) and the admin view (RT-29) deliberately include the disconnected.
- **RT-31** **[decided 2026-09-17]** An admin MUST be able to **release** an assigned scouter's
  robot and have someone else take it. This is the dead-phone case: the scouter is not coming
  back and their robot would otherwise go unscouted, because assignments are retained (RT-25).
  Release is always explicit. The system MUST NOT reclaim an assignment on its own, since a
  scouter on a flaky connection has to keep their place.
- **RT-32** On release the robot re-enters the pool and is assigned by the normal algorithm, or
  the admin names the replacement. The admin view MUST make an assignment held by a
  disconnected scouter obvious, because that is the cue to release it (RT-29).
- **RT-33** A released scouter who reconnects MUST NOT resume the released assignment. They
  return to WAITING and are assigned like anyone else. This is what keeps RT-14a true across a
  replacement: the robot has exactly one holder at any moment.
- **RT-34** Release after the match has started is allowed, but the replacement joins late and
  their performance covers only the remainder of the match. It MUST be marked as partial so
  analysis and the edit page can tell (flag metadata, BL-208), rather than silently appearing
  to be a full scouting record.
- **RT-35** **[proposed 2026-09-17, confirm]** If both the released scouter and their
  replacement submit for the same robot and match, the record from whoever **held the
  assignment at the end of the match** wins. The other is retained and marked superseded, and
  an admin can promote it. The winner MUST NOT be chosen by submission time: today
  `removeDuplicates` keeps the latest timestamp, so an abandoned device that syncs hours later
  would overwrite a complete record with a partial one. Deliberate re-scouting is unaffected
  and still replaces the earlier record (RT-14a).

## Admin-driven actions (HTTP, document 07)

- **RT-15 `GET /admin/api/enterMatch`** — for every scouter: if WAITING set status SCOUTING via
  `updateState`; then emit `enterMatch` to **every** scouter (including non-waiting).
- **RT-16 `POST /admin/api/setMatch`** — replace the current match object and run
  `assignScouters()`.
- **RT-17 `GET /admin/api/disconnectScouter/:scouterId`** — emit `adminDisconnect` then
  `socket.disconnect()` for every scouter with that `scouterId`.
- **RT-18 `GET /admin/api/scouters`** — registry snapshot (sockets removed).

## Client sync routine (`ScoutingSync.sync`)

- **RT-19** Returns `false` immediately in offline mode.
- **RT-20** Otherwise: read all TMPs from IndexedDB; emit `syncData` with their `matchId`s; on
  reply send `teamMatchPerformances` with the requested subset; on ack clear IndexedDB and
  resolve `true`. A 5 s timeout resolves `false` with an error popup.
- **RT-21** Sync runs on every connect, on `syncRequest`, and after each submission.

## Match data source at boot

- **RT-22** `getMatches(eventKey = config.TBA_EVENT_KEY)`: if no `TBA_API_KEY` return `[]`;
  GET TBA `/event/{key}/matches`; on failure, if FMS credentials exist GET
  `https://frc-api.firstinspires.org/v3.0/{year}/schedule/{code}?tournamentLevel=practice`
  with basic auth and format practice matches; else `[]`.
- **RT-23** Warns on startup if `TBA_API_KEY` is missing.

## Demo mode summary (across the system)

| Behavior                             | Non-demo                                           | Demo                                                          |
| ------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------- |
| Waiting scouters enter match         | when 6 waiting or someone scouting, or admin force | immediately on assignment                                     |
| `syncData` reply                     | missing ids                                        | `[]` (nothing uploaded; client still clears its local buffer) |
| `teamMatchPerformances` create       | yes                                                | yes (unchanged)                                               |
| Admin/setup/edit auth                | required if code set                               | not required (`status: 2`)                                    |
| Delete TMP                           | allowed                                            | refused with message                                          |
| Landing/admin/analysis "DEMO" labels | hidden                                             | shown                                                         |
| `GET /admin/api/enterMatch`          | force-start                                        | emits `enterMatch` to waiting scouters, responds twice (bug)  |
