# 08 — Analysis Dashboard (route `/analysis`)

## Page structure

- **AN-1** Fixed sidebar with logo, a toggle button (mobile ≤ 1100 px collapses the sidebar;
  button labels switch between `data-mobile-text` and `data-desktop-text`), navigation
  buttons **Compare Team Scores** and **Filter Teams**, a fuzzy search box, and the team list.
- **AN-2** Dashboard area with views: **welcome** ("SPOT Analysis", DEMO label, "Select a
  Team"), **team view** (main column + side column), **bubble sheet view**, **filter teams
  view**. Match view and Auto Pick List view exist in the template/JS but are commented out.
- **AN-3** An "event dropdown" button (top) lists every `events` document code; selecting one
  sets `?event=<id>` in the URL and reloads.
- **AN-4** A loading bar animates during initial load; the app fades in afterwards.
- **AN-5** Registers the service worker so the page and last dataset are available offline.

## Data loading and pipeline execution (`executePipeline`)

- **AN-6** Fetch TMPs: `/analysis/api/dataset` or `/analysis/api/dataset/<eventId>` when an
  event is selected. Fetch TBA match data (`/analysis/api/blueApiData[/<eventId>]`) and COPRs
  (`/analysis/api/blueApiOPR[/<eventId>]`).
- **AN-7** For each TMP, locate the robot's alliance and slot (1–3) in the TBA qualification
  match with the same `match_number`, then append synthetic actions for the `auto*<slot>` and
  `endGame*<slot>` score-breakdown keys (`id = "<key minus slot>_<value>"`, `ts = 0`). Missing
  breakdowns are skipped.
- **AN-8** Merge QR-cached TMPs from `localStorage.teamMatchPerformances`.
- **AN-9** Create `teams[robotNumber] = {}` for every TMP; attach `opr.<name>` for each
  configured OPR string from the COPR map.
- **AN-10** Load `/config/analysis-pipeline.json`, obtain transformers via `getTransformers()`
  (from `/analysis/transformers.js`), and run each entry in order:
  `dataset = transformers[type][name].execute(dataset, outputPath, options)`.
- **AN-11** Merge manual TMPs/teams (see DM-14). Also fetch the match list
  (`/admin/api/matches[/<eventId>]`) for the (dormant) match view.

## Team list and team view

- **AN-11a** **[A-36]** Confirmed model: scouters always write to the configured event; analysis
  may browse any event during a competition.
- **AN-12** Team names come from `/analysis/api/teams[/<eventId>]` (manual `tempTeams` if
  present, else TBA event teams). Only teams present in **both** the dataset and the team
  list are shown in the sidebar (number + nickname). Default order: by number length then
  lexicographically. **[A-37]** Intentional today but should not be necessary; the rewrite
  may show every team with data and fall back to the number when no nickname is known.
- **AN-13** Search: `fuzzysort` over team numbers with `allowTypo`; matching teams are shown in
  ranked order, others hidden; empty query restores default order.
- **AN-14** Clicking a team: for each team-view module, if the team has no data (its only key
  is `manual`) and the module is not `separate`, hide the module (side modules still receive
  data); otherwise `setData(formatData([team], dataset))`. Then mark the team selected and
  show the team view. Team-view modules are (re)created on every `loadTeams` call.
- **AN-15** Side column enabled only if any module has `position: "side"`.

## Compare Team Scores (bubble graph)

- **AN-16** Three selects (X, Y, Z size) populated with `averageScores.<key>` ("Average
  <Key>") for every key of the first team's `averageScores`, then `opr.<key>` ("OPR <Key>")
  for every key of the first team's `opr`, then `constant`. Defaults: X = first, Y = second,
  Z = third averageScores key.
- **AN-17** Plotly scatter of all teams: x/y from the selected paths (default 0, two
  decimals), marker size `sqrt(z) * 15` (z = 1 when constant), color `#FF6030`, team number as
  label, hover text listing the selected values, y-range `[0, max*1.1]`, theme-aware colors,
  title "Team Scores Scattergram".
- **AN-18** Re-plotted on any select change and whenever the view is opened.

## Filter Teams

- **AN-18a** **[A-12, BL-208]** Flagged TMPs remain in analysis but the UI should warn when a
  team's data includes flagged matches.
- **AN-19** Two dropdown menus with checkboxes: **Action/OPR Key** (every key found in any
  team's `averageScores` or `opr`, sorted, title-cased labels) and **Rating/OPR Score**
  (fixed bands: `Rating4`, `Rating3`, `Rating2`, `Rating1`, `Elite OPR (250+)`,
  `Strong OPR (151-250)`, `Decent OPR (101-150)`, `Low OPR (0-100)`, `Negative OPR`). Only one
  dropdown open at a time; clicking outside closes.
- **AN-20** Selected filters render as removable chips.
- **AN-21** Filtering rules:
  - No filters → all teams.
  - Actions only → team must have a value `> 0` for **every** selected action (value from
    `averageScores[action]`, else `opr[action]`).
  - Ratings only, all numeric (`RatingN`) → threshold = max N; team must have at least one
    positive `averageScores` value and **all** positive values ≥ threshold.
  - Ratings only, otherwise → team matches if **any** `averageScores` or `opr` value falls in
    **any** selected band (`Rating4` = exactly 4; `Rating3` ≥ 3; `Rating2` ≥ 2; `Rating1` ≥ 1;
    OPR bands by range; negative < 0).
  - Both → every selected action must have a positive value that matches at least one
    selected band.
- **AN-21a** **[A-14]** The rating bands and OPR ranges above must be configurable.
- **AN-22** Results render as team cards (number + nickname); team names are fetched per
  render with a version counter to discard stale responses.

## Dormant features preserved in code — **[A-6, BL-299] to be restored, toggled by config**

Disabled deliberately for 2026 because fuel could not be counted individually and scouting
was largely qualitative; expected to return for a typical game.

- **AN-23 Simulate Match**: match dropdown (from the schedule) auto-fills three red and three
  blue team selects; match-view modules are instantiated per alliance; `setMatchModules`
  passes each alliance's teams (and, for `wholeMatch` modules, `[...left, "|", ...right]`).
  Modules hide when their alliance has no selected teams with data.
- **AN-24 Auto Pick List**: ranks teams by average win probability: each team is its own
  "alliance"; every pair of alliances is compared with a normal-distribution model
  (`z = zScore(0, meanDiff, sqrt(sd1²+sd2²))`, `P(win) = 1 - Φ(z)`, using
  `averageScores.total` and `standardDeviation`); probabilities are averaged per team and
  teams sorted descending (bubble sort). The `SingleDisplay` module implements the same
  comparison for `aggrMethod: "percentChanceOfWinning"`.

## CSV export (v5: `GET /analysis/api/csv`, server side; v6: client-side, ADR 0005)

- **AN-25** Re-runs the pipeline on the server (dataset fetched from its own endpoint **plus**
  the same TMPs queried again from MongoDB, so every TMP is duplicated before transformers;
  `removeDuplicates` in the default pipeline collapses them by timestamp).
- **AN-26** Columns: `Team #`, then for the union of keys across teams with data:
  `<key> Average` (from `averages`), `<key> Score Average` (from `averageScores`),
  `<key> Cycle Average Time` and `<key> Cycle Average Time Complete` (from `cycles`). Missing
  or NaN values are written as `0`. Response is `attachment; filename="teams.csv"`.
- **NOTE** No header quoting/escaping; team numbers are the object keys of `dataset.teams`.
- **AN-26a** **[A-11]** The CSV is an escape hatch for ad-hoc analysis in Google Sheets;
  column names and specific values are not relied upon. **BL-232** Generate it client-side
  from the already-computed dataset so the pipeline runs in one place. **[decided 2026-09-17]**
  This is the v6 behavior: the browser builds the file from the dataset it already has, which
  removes the duplicate query (F-7) and the server-side `eval` (S-5), and lets the export work
  offline (ADR 0005).
- **AN-26b** **[SEC-8]** Neither the CSV nor any public analysis view may include scouter
  information: no name, no id, no initials.

## Demo label

- **AN-27** `/analysis/api/isDemo` controls a large "DEMO" label on the welcome view.
