# 05 — Scouting Client (route `/`)

The scouting client is the app scouters use on phones/tablets. It is one HTML document with
four pages (`landing`, `form`, `waiting`, `match-scouting`) plus a persistent status bar.

## Global chrome (all pages)

- **SC-1** Status bar (top): a reload icon (opens a "Warning — Are you sure you want to
  reload?" modal with a Reload action), a socket status text `Not Connected` / `Connected`
  (class `connected`) / `Disconnected` (class `disconnected`), a `scouting-info` label shown
  once assigned (`Match: N | Team: T`, colored `--error` red if the robot is on the red
  alliance of that match, else `--accent` blue), and a `last-actions` readout.
- **SC-2** Last-actions readout: the last three *distinct-run* action ids in the queue,
  oldest→newest, each with `(n)` if repeated consecutively, joined by ` ➔ `. Includes temp
  actions.
- **SC-3** Settings overlay (menu icon on landing; `settingsmenu.js` on all pages): buttons
  "Enable/Disable Dark Mode" (toggles `localStorage.theme` and `data-theme`), "Go To Analysis"
  (opens `/analysis` in a new tab), "Go To Admin" (opens `/admin`). Clicking outside closes it.
- **SC-4** Feedback overlay: "We appreciate your feedback!" with "Create GitHub Issue"
  (opens `https://github.com/HuskieRobotics/SPOT/issues`) and "Email Feedback" (opens a Gmail
  compose to `spot@team3061.org`).
- **SC-5** PWA: registers `/sw.js`; shows install prompt modal once (`beforeinstallprompt`).
- **SC-6** Configs are fetched at load: `/config/config.json`, `/config/match-scouting.json`,
  `/config/qr.json`.

## Landing page

- **SC-7** Shows logo, "SPOT" title, a `DEMO` label (visible only when `/auth/isDemo` returns
  true), a version string (`2026 v5.2.0`), and buttons: "Sign in with Google", "Sign in
  Manually", "Give Feedback".
- **SC-8** Google sign-in: loads `apis.google.com/js/platform.js`, initializes `gapi.auth2`
  with a hard-coded client id, verifies the id token against `GET /auth/verify` (header
  `token`), and on success switches to `waiting`. The Google button is deactivated after
  5 s or on init failure. **This feature is documented as non-functional**; a rewrite may drop
  it or implement it properly (server verifies with `process.env.CLIENT_ID`).
- **SC-9** "Sign in Manually" → prefill form from localStorage and switch to `form`.

## Sign-in form

- **SC-10** Fields: First Name, Last Name (required); Match Number and Robot # are shown
  **only** when the client is in offline mode or currently disconnected.
- **SC-11** Save: persist first/last name to localStorage; `scouterId = firstName + lastName`
  (no separator).
  - Online: send `updateState({ scouterId, status: WAITING })` and switch to `waiting`.
  - Offline: set `matchNumber`, `robotNumber`, `scouterId`, `status: WAITING` locally and go
    straight to `match-scouting`, showing the scouting-info label.

## Waiting page

- **SC-12** Title "Waiting to be assigned...", a spinning gear image, and a rotating hint
  (shuffled list, cross-fades every ~7 s):
  - "If you misclick a button, you can always press UNDO to undo your mistake!"
  - "Show up to scout on time! Try to be there a few minutes in advance."
  - "Stay focused when scouting. Data you collect helps your team greatly."
  - "If you ever have an issue, make sure to notify the scouting team."
  - "Before you leave, let the scouting team know so they can replace you."
- **SC-13** Leaving the waiting page is driven by the server `enterMatch` event (document 06):
  after 100 ms, if the (robot, match) assignment differs from the last one entered and the
  status is not NEW, switch to `match-scouting`, show the scouting-info label, and show a
  modal "Match Information — You have been assigned team T in match N." with an OK button.

## Match-scouting page — grid construction

- **SC-14** The grid is a CSS grid with `gridColumns` × `gridRows` from config. Each button in
  every layer becomes a `div.grid-button` with the configured classes, label, and
  `grid-area`. Buttons from all layers exist in the DOM; visibility is toggled per layer.
- **SC-15** Each button object remembers `configId` (original id), `originalDisplayText`,
  `originalClass`, `originalGridArea`, and its DOM element.
- **SC-16** Press feedback: `pointerdown` adds `.pressed`; `pointerup/leave/cancel` removes it
  after 90 ms.
- **SC-17** Initial state: layer 0 shown; timer not running; match-control buttons read
  "Start Match".
- **SC-18** Variables from `matchScoutingConfig.variables` are initialized as
  `{ current: value, previous: [] }`.

## Button types

| type | Press behavior |
|------|----------------|
| `action` | Push `{ id: prefix + button.id, baseId: button.id, ts: time }`; run executables; update readout; if the button is an A-Stop button and `time > 140000`, engage the A-Stop lock. |
| `undo` | See SC-24. Then run the undo button's own executables. |
| `none` | Push a **temp** action `{ id: button.id, baseId, ts, temp: true }` (never submitted); handle shift toggles (SC-22); run executables. |
| `match-control` | Start the match (SC-19) or, when `time <= 0`, submit (SC-27). |
| `label` | Non-interactive text cell. |

## Timer, phases, and action-id prefixes

- **SC-19** Start: pressing a match-control button while the timer is stopped pushes a temp
  `startGame` action, sends `status: SCOUTING`, records `start = Date.now()`, sets
  `displayText` from the largest transition, runs the button's executables (the default
  config uses `layer [0,1]` to leave the pre-match layer), and starts a 10 ms interval.
- **SC-20** Each tick: `time = totalTime - (Date.now() - start)`; while
  `time <= nextTransitionKey`, apply that transition (set `displayText`, push previous variable
  values and set new ones, `showLayer(layer, conditional, always)`), then drop it. When
  `time <= 0`: every match-control button (all layers) shows "Match Complete" for 2 s then
  "Submit Match", and the interval stops.
- **SC-21** Match-control label while running: `"<seconds with 2 decimals> | <displayTextWithShift>"`.
- **SC-21a** **[A-16]** Real 2026 timing: 160 s total = 20 s auto + 140 s teleop; teleop =
  10 s transition + four 25 s shifts + 30 s endgame. The config's `159999`/`140000`/`130000`
  transitions encode exactly this with no extra time. **BL-298** The field timer also pauses
  for roughly 3 s between auto and teleop; the scouting clock must be able to hold for a
  configurable duration at that transition. **BL-230** A guarded 2× clock control is needed
  for re-scouting from video.
- **SC-22** Shifts (2026 game logic, hard-coded constants): `teleopTime` = smallest transition
  time whose `displayText` contains "teleop" (case-insensitive), default 130000;
  `endgameTime = 30000`; `shiftSwitchInterval = 25000`; `autoPhaseEndTime = 140000`.
  Pressing `teleopActive` / `teleopInactive` (type `none`) sets the current shift to
  active/inactive, increments that shift's counter, records the switch time, and marks
  `shiftButtonPressed`. Thereafter every 25 s of match time the shift toggles and the counter
  for the new shift increments. Display/prefix rules:
  - `time > teleopTime` → `displayText` (e.g. "Auto", "Teleop Transition").
  - `teleopTime > time > endgameTime` → `"Active Shift N"` / `"Inactive Shift N"` if a shift
    button was pressed, else `displayText`.
  - `time <= endgameTime` → `"Endgame"`.
- **SC-23** Recorded action id = `camelCase(displayTextWithShift)` (non-alphanumeric runs
  removed, following char upper-cased, first char lower-cased) + `button.id`. Examples:
  `auto` + `StartShooting` → `autoStartShooting`; `teleopTransition` + `AZone`;
  `activeShift1` + `RatingPassing3`; `endgame` + `Fall`; `auto` + `aStop` → `autoaStop`.
  Before the match starts the prefix is empty (e.g. `preloadFuel`).

## Undo semantics

- **SC-24** Undo is allowed only when `actionQueue.length > variables.minOfQueueLength`.
  When allowed:
  1. Pop the last action; resolve its button by `baseId`.
  2. If that button is `match-control` (undoing "Start Match"): reset `time = totalTime`,
     clear the A-Stop lock, send `status: WAITING`, clear the interval, relabel "Start Match",
     `timerActive = false`, `showLayer(0)`.
  3. If it was an A-Stop button: clear the A-Stop lock.
  4. If currently in teleop (`time < teleopTime`) and both the auto layer (from the transition
     whose text contains "auto") and the teleop layer (target of `teleopActive`'s `layer`
     executable) are known, replace any snapshot in the layer history that equals the auto
     layer with the teleop layer; if the oldest snapshot equals the teleop layer, show it.
  5. Call `reverse` on each executable of the undone button, in order.
  Regardless of whether anything was undone, run the undo button's executables and update
  the readout and A-Stop state.
- **SC-25** Layer history (`previousLayers`) is a stack of rendered button sets pushed by
  `showLayer`, `layer`, and `conditionalLayer`; `layer.reverse` pops and re-shows the new top;
  `conditionalLayer.reverse` pops twice (if possible) and re-shows the top.

## Layer rendering

- **SC-26** `showLayer(index, conditional = {}, always = [])`: hide every button; if
  `conditional` is non-empty, show a button in the target layer only if it is listed in
  `always` or if, for some variable, the button is listed under a value equal to that
  variable's current value; otherwise show all buttons in the layer. Push the rendered set.
  An out-of-range index falls back to layer 0 with a console warning.

**[A-17]** These are real 2026 rules; the maintainer considers the shift model to be
configured through `match-scouting.json`, but the 25 s interval, endgame boundary, and
`teleopActive`/`teleopInactive` ids are constants in code today. The rewrite must move them
into configuration.

## A-Stop lock

- **SC-27a** A button is an A-Stop button if any of its label/id strings, lower-cased with
  spaces and hyphens removed, contains `astop`.
- **SC-27b** Pressing it while `time > 140000` sets the lock. While locked (`time > 140000`),
  every button except `undo` and `match-control` types gets `.disabled` (pointer-events none,
  60% opacity), the page root gets `.a-stop-active`, and a centered banner reads: "You pressed
  the A-Stop button, all the buttons will be disabled until Auto ends. If this is a mistake
  then press the Undo button". The lock releases automatically once `time <= 140000`, or on
  undo of the A-Stop action, or on match restart. **[A-18]** The intent is "until the end of
  auto"; derive the boundary from the auto→teleop transition in config instead of a constant.

## Alliance zone buttons

- **SC-28** For each layer containing buttons with `configId` `AZone` and `OAZone`:
  - If `SWAP_ZONE_BUTTON_LOCATIONS` is true, swap their grid areas.
  - If the scouted robot is on the **blue** alliance of the current match (from
    `/admin/api/matches`), swap their ids and display texts (so the physical left/right
    position maps to the red/blue end of the field, while the recorded id stays relative to
    the scouted robot's own alliance).
  Re-applied whenever scouting state updates (`spot:scouting-state-updated` event).
  **[A-19]** Purpose: the team's seating side changes between events and even between days,
  so the blue alliance may be on the left or the right. The admin sets the field orientation
  once so that what scouters see in SPOT matches what they see on the field; the setting
  should therefore be a single "field orientation" that drives zone-button placement, the
  position-capture map rotation, and (module option) the heatmap.

## Executables (client behaviors)

- **SC-29 `layer [from, to]`**: hide all, show layer `to`, push snapshot. Reverse: pop, show top.
- **SC-30 `conditionalLayer [from, to, always, conditional]`**: like `showLayer` with
  conditional filtering. Reverse: pop (twice if >1), show top.
- **SC-31 `setVariable [name, value]`**: create or update `variables[name]`, pushing the old
  value to `previous`. Reverse: pop `previous` into `current`.
- **SC-31a** **[A-21, BL-60]** Position lock explained: after a scouter taps the field map, any
  further position-requiring button pressed within the lock window (1 s today) reuses that
  position instead of showing the map again, on the assumption the robot has not moved. The
  window must be configurable.
- **SC-32 `position []`**: if within 1000 ms of the last captured position (position lock),
  attach the locked position to the last action, flash all position-capable buttons' borders
  `#00ffa5` (0.5vw) for the lock duration, and refresh the lock. Otherwise overlay a
  full-screen white container with `/img/field.svg` (`object-fit: contain`, black background,
  rotated 180° when `SWAP_ZONE_BUTTON_LOCATIONS` is true). On click: compute x,y as integer
  percentages of the rendered image (clamped 0–100, inverted when rotated), store into the
  last action's `other.pos`, show a 500 ms blue "click indicator" dot at the click point,
  start the position lock (border flash), and remove the overlay. Reverse: no-op.
- **SC-33 `constantPosition [pos]`**: set last action's `other.pos = pos`.
- **SC-34 `climbHighlight`**: remove `.highlight` from every button that has a `climbHighlight`
  executable, add it to this button. Reverse: remove from this button; re-highlight the
  button of the most recent remaining action whose id is a highlightable button id.
  (**NOTE**: matches on the *prefixed* action id versus un-prefixed button id, so the reverse
  lookup only works when the prefix is empty; see document 12.)
- **SC-35 `clearHighlight`**: remember whether highlighted, remove it. Reverse: restore.
- **SC-36 `hide`**: `display:none`. Reverse: `display:flex`.
- **SC-37 `multiplier [n]`**: push `n-1` copies of `{ id: button.id, ts }` (un-prefixed id).
  Reverse: pop `n-1`. Warns if used on non-action buttons.
- **SC-38** Executables run in array order; an exception is logged and rethrown as
  `Error occured within <type> executable!`.

## Submission

- **SC-39** When the timer has expired, pressing a match-control button: disable all buttons,
  show notice "Submitting Data...", build the TMP (filter out temp actions, clamp `ts >= 0`,
  generate `matchId_rand`, set `timestamp`, `clientVersion = config.VERSION`, `scouterId`,
  `robotNumber` (Number), `matchNumber` (Number), `eventNumber = config.EVENT_NUMBER`,
  `flagged: false`), store it in IndexedDB, then `ScoutingSync.sync()`.
- **SC-40** If sync succeeds: send `status: COMPLETE` and reload the page (returning to
  landing).
- **SC-41** If sync fails or offline: render the QR code (document 03 format) full-screen with
  a "Tap to Dismiss" button; tapping removes it and reloads the page. The TMP remains in
  IndexedDB and will be offered on the next successful connection.
- **SC-42** Sync popups: "Syncing Data..." (notice, 5 s), "Data Sync Complete!" (success, 2 s),
  "failed to sync data!" (error, on 5 s timeout).

## Connection handling (client side of document 06)

- **SC-43** On connect: `offlineMode = false`, `connected = true`, emit full state, update the
  status label, run `sync()`. A 1 s fallback checks `socket.connected` and runs the connect
  handler if the event was missed; otherwise shows "failed to connect!".
- **SC-44** On disconnect: `connected = false`, label "Disconnected".
- **SC-45** On `adminDisconnect`: switch to landing, status `DISCONNECTED_BY_ADMIN`.
- **SC-46** On incoming `updateState`: merge into local state, dispatch
  `spot:scouting-state-updated`, refresh the scouting-info label.
- **SC-47** On `syncRequest`: run `sync()`.
- **SC-48** `updateState` (outgoing) resolves only after the server acknowledges.

## Backlog items affecting this page (document 16)

BL-93 unsynced-matches list with per-entry retry and QR; BL-54 surface assignment changes to
scouters who have not started; BL-43 orientation handling; BL-7 accessible names; BL-35
optional end-of-match notes; BL-193 optional end-of-match tags.

## Developer affordances

- `devEnd()` (global) jumps the clock to the final millisecond for testing.
- `window.currentTime` mirrors the remaining time.
- A hidden "debug-switcher" page selector exists in the template (commented out).
