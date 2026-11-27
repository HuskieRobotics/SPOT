# 07 — Admin, Data Management, QR Scanner, Manual Schedule

## Access-code authentication (shared pattern)

- **AD-1** On load, the page calls `GET <feature>/api/auth`. If `status !== 2` it shows a
  non-closable "Sign In" modal with a password input (Enter or Submit) and re-calls the
  endpoint with `Authorization: <code>`; `status === 1` builds the app, otherwise popup
  "Wrong Access Code". Status 2 (no code configured, or DEMO for admin) skips sign-in.
- **AD-2** The entered code is kept in memory and attached as `Authorization` to subsequent
  requests from that page.

## Admin dashboard (`/admin`)

Layout: a collapsible top menu (chevron icon toggles `expanded`) with links **Edit Config**
(`/setup`), **Export Data** (`/analysis/api/csv`, downloads `teams.csv`), **Scan QR Code**
(`/qrscanner`), **Edit Data** (`/edit`), **Restart Server**; a "Demo" label when in demo
mode; a two-panel body: **Scouters** and **Matches**.

- **AD-3** Migration check on load: `GET /admin/api/checkMigration`; if the first TMP lacks
  `eventNumber`, show a modal explaining the database is from SPOT v4 or earlier with a link
  to the migration guide.
- **AD-4** Scouters panel: polls `GET /admin/api/scouters` every 2.5 s. Each scouter is a card
  showing match number badge, scouter id, robot number, and status text. Colors: NEW hidden;
  WAITING orange `#ffa500`; SCOUTING accent; COMPLETE green; disconnected (not COMPLETE) red
  with text `DISCONNECTED`; admin-disconnected red with `ADMIN DISCONNECT`. Cards for COMPLETE
  or disconnected scouters are removed after 15 s; cards for scouters no longer in the
  registry are removed.
- **AD-4a** **BL-116** Disconnect must be an explicit, labelled control on the card.
- **AD-4b** **[decided 2026-09-17, RT-31/RT-32]** A scouter card MUST show whether the scouter
  is connected and which robot they hold, and MUST offer **Release robot** so an admin can hand
  an abandoned assignment to someone else. A disconnected scouter holding a robot is the case
  this exists for, so the card has to make that state obvious rather than hiding it behind a
  status colour.
- **AD-5** Clicking a scouter card opens "Do you want to Disconnect <id>?" with Yes/No; Yes
  calls `GET /admin/api/disconnectScouter/<id>` and shows "Scouter <id> Disconnected!".
- **AD-6** "Assign Scouters" button calls `GET /admin/api/enterMatch` (force-start; see RT-15).
- **AD-7** Matches panel: polls `GET /admin/api/matches` every 2.5 s and rebuilds the list.
  Each match shows `<number> - <EVENTKEY>-<MATCHCODE>` (from `match_string` split on `_`,
  upper-cased), a checkbox, and red/blue team lists. The checkbox is checked for the current
  match. Clicking an unchecked box POSTs the match object to `/admin/api/setMatch`; on `true`
  shows "Match N - KEY Selected!" and moves the check; clicking the checked box does nothing.
- **AD-8** Match source precedence (server): if a manual schedule has been posted
  (non-empty), it is used; otherwise TBA (or FMS practice) via `ScoutingSync.getMatches()`.
- **AD-9** Restart Server: modal "Are you sure you want to restart the server?" with a
  password input and Yes/No; Yes calls `GET /admin/restart` with the code; the server exits
  with code 0 (process manager restarts it); wrong code → "Wrong Access Code!".

**v6 (#357, decided 2026-11-24).** The admin page at `/admin`, behind the admin password
(SEC-5a). It replaces AD-3 to AD-7; AD-9's restart button is not carried over (a deployment
restarts the process, docs/spec/10).

- **Polling** (AD-4, RT-14c): the page reads the settings and the registry every 2.5 s, and the
  schedule, the event list and the roster every 30 s and after each change made on it. A change
  one admin makes shows in every admin's view within seconds (BL-33, RT-14b).
- **Event** (DV-12a, DV-12b, SEC-3, SEC-3b): the active event by its code; **Choose an event**
  and **Make active**, which asks first when scouters are signed in, because they are signed out
  and sign in again to the new event; **New event** from a TBA key and a label, made active at
  once. The join code is shown as large text and as a QR code of `<address>/?join=<code>`, drawn
  in the browser with the `qrcode` library (OF-6), with the link under it. **Make a new join
  code** asks first; devices that entered the old one keep their records and must enter the new
  one to sign in or send them (SEC-9).
- **Match** (AD-7, RT-16, DV-17): the current match and its teams; **Previous match**, **Next
  match** (or **First match**) and **No match**; the schedule with **Choose** on each match.
  Matches come from the schedule page's sources (AD-8a); with none, the page links there.
- **Start match** (AD-6, RT-12a) sends in the connected scouters waiting on the current match.
  **Quorum** (1 to 6) and **Start on first scouter** sit beside it and apply at once (RT-14b).
- **Field orientation** (A-19, SC-28): **Normal** or **Flipped**, one setting for every device.
  The server sends it to each device's stream when the stream opens and whenever it changes.
- **Scouters** (AD-4, AD-4a, AD-4b, RT-29, RT-32): one card per person, in sign-in order, with
  the name from the roster, student ID, robot and match, status, and **Connected** or
  **Disconnected**. A disconnected scouter holding a robot of the current match gets a red
  border and says to release the robot if they are not coming back. Cards are not removed after
  a time, unlike AD-4's 15 s (RT-29).
- **Release robot** opens **Give Team N to**: the next scouter waiting (the normal assignment), or
  a connected scouter without a robot in this match (RT-32). The card's other control is
  **Sign out** for a connected scouter and **Remove** for a disconnected one: one action for the
  registry (docs/spec/06), labelled for the case (AD-5, BL-116). Both ask first.
- **Roster** (SEC-6a): collapsed by default; search by name or student ID, and **Correct name**.
  The roster is read again when the panel opens and when a scouter who just added themselves is
  signed in.

Tests: `tests/unit/admin-page.test.ts`, `tests/e2e/admin-page.spec.ts` (its own Playwright
project, run after the others, because it drives the registry every test shares).

## Edit Data page (`/edit`)

- **AD-10** Requires access code (via `/admin/api/auth`). Loads `/analysis/api/dataset`
  (cache-busted, `cache: "no-store"`), i.e. all TMPs for the active event.
- **AD-11** Three filter inputs: scouter name (substring, case-insensitive), match number,
  robot number. List is sorted by `timestamp` descending and re-rendered on input.
- **AD-12** Each TMP row: expand arrow (► / ▼) toggling the action list, `Match: N`,
  `Robot: R`, `Scouter: S`, a flag button, and an `X` delete button. Border is red
  (`#ff6666`) if the robot was on the red alliance in TBA qualification data for that match,
  otherwise default.
- **AD-13** Expanded content: numbered list of every action id in order, followed by
  `Actions of <id>: <count>` lines for each distinct id; or "No actions recorded".
- **AD-13a** **[A-12]** Flag semantics: a flag tells scouting admins the data is suspect and the
  match should be re-scouted. Analysis may ignore flags but should show a visual warning.
  **BL-208** Future: automatic flagging when an alliance's scouted total deviates from TBA.
- **AD-14** Flagging: optimistic toggle; POST `/admin/api/flagMatch { id, flagged }`; on
  failure roll back. Flagged rows show a flag image; unflagged show "Flag Match".
- **AD-15** Delete: `confirm("Are you sure you want to delete this match performance?")` then
  `DELETE /analysis/api/dataset/:id`; the row is removed on success. Refused in demo mode.
- **AD-16** Unscouted placeholders: for every match number present in the filtered list, using
  TBA qualification alliances, render a `⚠️ Match: N Robot: R NOT SCOUTED` row for each robot
  in that match that has no TMP (respecting match/robot filters).
- **AD-17** QR-cached TMPs in localStorage are read but **not** merged (merge line commented
  out).

**v6 (#410, decided 2026-11-27).** The edit page is `/admin/edit`, behind the admin password
(SEC-5), and its actions are route handlers under `/api/admin/performances` (SEC-5a, document
11). It replaces AD-10 to AD-15:

- **AD-10, AD-11** It opens on the active event, and any event can be chosen. Every record is
  listed, newest first, and filtered by part of a scouter's name or student ID, a match number
  (Qual 12 and Playoff 12 both match "12"), and a team as an admin types it (`3061`, `frc3061`,
  `2338b`).
- **AD-12** Each record shows the match by its name ("Qual 12", "Final 2"), the team, its alliance
  from the event's schedule (the left edge red or blue, and the word), the scouter's name (or the
  id of a scouter not on the roster, such as a migrated v5 name), and when it was submitted. It
  also says when it was scanned from a QR code or imported, when it covers only part of the match
  (RT-34), and when another record for the robot replaced it (superseded, RT-14a, RT-35).
  Superseded records are shown, so an admin can see why one was replaced and promote it.
- **AD-13** The actions are read when a record is opened, not with the list, so a phone at an event
  loads a few hundred rows, not every press: each action in order, then a count of each.
- **AD-13a, AD-14** **Flag** asks for an optional reason. The flag is public, as every flag is, so
  the page says not to name a scouter (SEC-8); analysis counts flagged records on the team's page
  (AN-18a). A machine flag (RT-36) says it was set automatically. **Clear flag** keeps the record
  marked as an admin's decision (`flagged: false`, source `"human"`), so no rule flags it again
  (document 06). Each edit waits for the server and then reads the list again (v5 toggled first and
  rolled back), because one record's edit can change which of the robot's others counts.
- **AD-15** **Delete** asks first, naming the match, team and scouter. The record moves to
  `deletedPerformances` (DV-20), so a phone that still holds it, or its QR code scanned later, is
  answered "duplicate" and it does not come back. If it was the record analysis used, the rules
  pick one of the robot's others (RT-14a, RT-35).
- **RT-35's promotion** **Use this record** on a superseded record makes it the one analysis uses,
  and supersedes the one that was. It stands until a record submitted after it arrives.
- **AD-16, SEC-6a** Unscouted robots, merging scouters, and correcting a record's team or match are
  #414. **AD-17** goes with the QR scanner (#411).

Tests: `tests/unit/edit-page.test.ts`, `tests/e2e/edit-page.spec.ts`.

## QR Scanner page (`/qrscanner`)

- **AD-18** On load, if `localStorage.teamMatchPerformances` exists, POST the parsed array to
  `/qrscanner/api/sync`; on success remove the cache.
- **AD-19** Renders an `html5-qrcode` scanner (`fps: 30`, `qrbox: 250`) with camera selection.
  On a successful scan, decode the payload (document 03) using `/config/qr.json` and
  `/config/match-scouting.json`, and display: Timestamp, Client Version, Scouter ID, Event
  Number, Match Number, Robot Number, then the Action Queue as `ID`/`TS` pairs.
- **AD-20** Submit: POST the decoded TMP to `/qrscanner/api/teamMatchPerformance`. `201` →
  notification "Successfully uploaded scouting data to database" and Undo becomes a server
  undo (`POST /qrscanner/api/undo`, deletes the last submitted `matchId_rand`). `204`
  (duplicate `matchId_rand`) is treated as ok by the client. On network failure → notification
  "Failed to connect to database, storing TMP data in cache", append the TMP JSON string to
  localStorage (if not already present), notify "Data has been successfully stored in cache",
  and Undo pops the last cached entry.
- **AD-21** Server `sync` de-dup: a synced TMP is skipped if an existing TMP has the same
  robot, event, match number, and an action queue of the same length whose ids match
  position-by-position.

## Manual Schedule page (`/schedule`)

- **AD-22** Requires access code (`/schedule/api/auth`). Loads the current manual schedule.
- **AD-23** "Number of matches" input; pressing Enter grows/shrinks the in-memory list to that
  size, new matches being `{ number: i, match_string: "2023temp_q<i>", robots: { red: ["0","0","0"], blue: ["0","0","0"] } }`.
- **AD-24** Each match renders as a header `<n> - MANUAL-QM<n>` and six `contentEditable`
  cells (red 1–3, blue 1–3). Any input re-reads all cells and POSTs the whole schedule to
  `/schedule/api/matches`.
- **AD-25** Server stores the schedule in memory and derives `tempTeams`
  (`{ team_number, nickname: "temp team" }` for every distinct robot) which the analysis
  `/teams` endpoint prefers over TBA when non-empty. Not persisted across restarts.
- **AD-25a** **[A-8]** Manual schedule is low priority (few events lack TBA) and could be
  dropped; if kept it must work as the Usage Guide documents, including per-row lock/unlock.
- **NOTE** The Usage Guide describes lock/unlock buttons per row; the current implementation
  has no locks and saves on every input. `tempTeams` de-dup compares numbers against objects
  and therefore never de-duplicates.

**v6 (#355, decided 2026-11-24).** The manual schedule is kept (D-4) and lives at
`/admin/schedule`, behind the admin password (SEC-5). It replaces AD-22 to AD-25:

- An admin types matches only when TBA does not have them: an event TBA does not cover, or a
  server that cannot reach TBA. When TBA has the event, playoff matches appear as TBA adds them.
- **AD-8a** **[decided 2026-11-24, maintainer]** Precedence is per level: typed qualifications
  are used instead of TBA's qualifications, and typed playoffs instead of TBA's playoffs. Typing
  the playoffs at an event whose qualifications TBA has keeps TBA's qualifications. (AD-8 was
  all or nothing.)
- The page says, for qualifications and for playoffs, where scouters are assigned from (typed,
  TBA's, or none yet), when TBA's was last read, and why it could not be, with a button to read
  it now.
- **Qualification matches** and **Playoff matches** each have a **Number of matches** and
  **Set** that grow or shrink that level; each match has six boxes, red 1 to 3 then blue 1 to 3,
  and is named as the field names it ("Qual 3", "Playoff 5", "Final 1" for playoff 14, RT-22a).
  Teams are typed as an admin reads them (`3061`, `frc3061`, `2338b`) and a box may stay empty
  while the schedule is being typed.
- **Save** stores the whole schedule in MongoDB, so a restart keeps it (v5 kept it in memory).
  A team that is not a team number, a team twice in one match, or a match twice is refused with
  the match and slot, and nothing is saved. Setting a level's count to 0 and saving goes back to
  TBA's for that level.
- Each row has **Lock** and **Unlock** (AD-25a): a locked row cannot be edited until unlocked, and
  the lock is saved with the schedule.
- The schedule's teams, once each, replace `tempTeams` (F-12). Analysis needs no team list: it
  lists every team with data, named by TBA (AN-12, A-37), and Simulate Match reads the schedule
  (#389).

Tests: `tests/unit/schedule.test.ts`, `tests/e2e/admin-schedule.spec.ts`.

**[A-9]** FMS practice-match fallback: dropped in v6 (RT-23a).

## Checklist page (`/checklist`, not mounted) — **[A-10] dropped**

Renders a toggleable list of team buttons from the dataset and TBA team names. Its API
references `ScoutingSync` without importing it. Treat as an abandoned pick-list prototype.
