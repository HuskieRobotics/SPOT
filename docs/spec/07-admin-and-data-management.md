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

**[A-9]** FMS practice-match fallback: not used; may be dropped.

## Checklist page (`/checklist`, not mounted) — **[A-10] dropped**

Renders a toggleable list of team buttons from the dataset and TBA team names. Its API
references `ScoutingSync` without importing it. Treat as an abandoned pick-list prototype.
