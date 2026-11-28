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
  breakdowns are skipped. v6: the prefixes, their phases and the ids started at 0 are configuration;
  see document 03 DM-11a to DM-11c and DM-13a (#315).
- **AN-8** Merge QR-cached TMPs from `localStorage.teamMatchPerformances`. **v6 (#411, decided
  2026-11-27, maintainer):** records the QR scanner holds on its device, not yet sent, show in
  that device's analysis too: rare, but at an event with no connection at all, it is the only
  place scanned matches can be seen. A record the server already has (same nonce) is not added
  twice, and when the server has a current record for the same robot and match, the later
  submitted one counts (RT-14a; the device cannot apply RT-35, which needs the registry). The
  page says how many it includes. `withUnsent` in `src/scanner/scan.ts`.
- **AN-9** Create `teams[robotNumber] = {}` for every TMP; attach `opr.<name>` for each
  configured OPR string from the COPR map.
- **AN-10** Load `/config/analysis-pipeline.json`, obtain transformers via `getTransformers()`
  (from `/analysis/transformers.js`), and run each entry in order:
  `dataset = transformers[type][name].execute(dataset, outputPath, options)`.
- **AN-11** Merge manual TMPs/teams (see DM-14). Also fetch the match list
  (`/admin/api/matches[/<eventId>]`) for the (dormant) match view. **v6:** the manual data is
  dropped (DM-14, #345); the match list comes with Simulate Match (#389).

**v6: the data the dashboard reads (#382).** Anyone may read it (SEC-1), and the browser runs
TBA enrichment and the pipeline on it (TR-9), so the server never calls its own routes (D-5,
#90). Routes in document 11:

- **AN-3, AN-11a** `GET /api/analysis/events`: every event by its code, saying which is active,
  with no join code (SEC-3).
- **AN-6** `GET /api/analysis/dataset?event=<code>`: an event's current performances (RT-14a)
  without scouter ids (SEC-8). Flagged and partial records are included, so the dashboard can
  say so (AN-18a).
- **AN-6, AN-9** `GET /api/analysis/tba?event=<code>`: the event's matches with score
  breakdowns, its component OPRs and its teams' nicknames, kept per event (DV-19) and read from
  TBA again after five minutes (NF-6). When TBA can't be read, the last copy serves, with a
  message saying why.
- **CS-17** `GET /api/config/analysis-pipeline` and `/api/config/analysis-modules`: the files
  with a version as the `ETag`, and what `config:check` finds in them. A file is refused only
  when it can't be used at all (not JSON, or no list of entries): one bad entry must not take the
  dashboard down, and the engine skips a bad entry itself (TR-10).
- **AN-11, AN-23** `GET /api/analysis/schedule?event=<code>`: the event's matches, for
  Simulate Match (#389).
- **AN-12, A-37** The team list is every team with data, in team order, with TBA's nickname
  when TBA knows the team (`src/analysis/teams.ts`). A team TBA doesn't know, such as a B robot,
  is listed by its number.
- **OF-3, AN-5, NF-4 (#390)** The dashboard keeps what these routes answer on the device, under
  each event, and opens an event viewed online with no connection, switching between such events
  too (document 18, "v6: offline analysis"). The analysis page registers the service worker
  itself, so a device that never opens the scouting page works offline as well.

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

## v6: the dashboard (`/analysis`, #383)

The page is drawn in the browser only (`src/components/analysis/`), and its logic is plain
TypeScript tested without a page (`src/analysis/dashboard.ts`, `search.ts`, `teams.ts`; tests
`analysis-dashboard` and `tests/e2e/analysis.spec.ts`). Decided 2026-11-26:

- **AN-1, AN-2, AN-4** A header with the logo, "SPOT Analysis" and the event; a team list with
  its search, under the views (Compare Team Scores, Filter Teams, Simulate Match and Auto Pick
  List when the season turns them on, and Download CSV); and the event's page (the welcome view),
  one team's view, or one of the views. The welcome view gives the event, how many
  scouting records and teams it has, and what is wrong with the analysis configuration. A loading
  message shows while data arrives. At 1100 px or narrower, as in v5, the team list opens from a
  **Teams** button and takes the screen; choosing a team closes it.
- **AN-3, AN-11a, DV-12b, #209** A standard select lists the events by code, the active one
  marked "scouting now" and opened first. The address keeps the event and the team
  (`/analysis?event=2025ilch_official&team=3061`), or the event and a view (`&view=compare`,
  `filter`, `simulate` or `pick`), so a reload or a shared link opens the same view.
- **The address, when it names what is not there** (written down in the Phase 3 audit, #393). An
  event no one created opens the active event, else the newest, with no team or view. A team with
  no data at the event, or a view its season leaves off (AN-23, AN-24), opens the event's page.
  Choosing another event opens its page: a team number names another robot at another event. With
  no events at all, the page says an admin creates one on the admin page; when an event can't be
  loaded, it says why, with **Try again**.
- **CS-17: an event's season.** Each event is read with the configuration of the season named
  for its year (`config/seasons/2025` for 2025ilch), or with the active one when there is no such
  folder. v5 had one configuration at a time, so a past season's event read with the new game's
  files showed nonsense.
- **AN-7, AN-9, AN-10, TR-9** The browser enriches the performances with TBA's data and runs the
  pipeline, exactly as `npm run oracle:compare` does (a test compares every team's values). TBA's
  data is optional: when it can't be read, a note says why and how old the copy is, and the
  dashboard shows scouting data without TBA's results and OPRs.
- **TR-10** What config:check finds in the season's analysis files, and what the pipeline could
  not run, are listed on the welcome view for an admin. A problem never hides the page.
- **AN-12, AN-13** The list is every team with data, number and nickname. Search ranks the exact
  number, numbers starting with the query, names starting with it, words starting with it, then
  anywhere, and forgives one typo or letters in order, as v5's `fuzzysort` did. It is written in
  SPOT rather than added as a dependency.
- **AN-14, AN-15** The team view shows the team modules in a main column and, when a module asks
  for it, a side column. v5 hid a team's modules when the team had no data, but v6 lists only
  teams with data, so that rule has nothing to hide, and a module's `separate`, which kept it on
  such a team's page, is accepted and changes nothing. Every built-in module is drawn: the text
  modules (#384), the charts (#385) and the heatmap (#386). A module whose options config:check
  finds errors in says so instead of drawing, and a name that is no module says so too.
- **AN-18a, RT-34, RT-36** The team view says how many of its matches are flagged for review or
  cover only part of the match.
- The scouting client's menu and the admin page link to the dashboard.

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

**v6 (#387, decided 2026-11-27):** `src/analysis/compare.ts`, drawn by
`src/components/analysis/compare-view.tsx`; the address is `?event=…&view=compare`.

- The choices are every team's values, not only the first team's: averages, then OPRs, each
  by name ("Average Auto Shooting Rating", "OPR Minor Foul Count"), then Constant.
- A team missing a value chosen is left out and listed, where v5 drew it at 0 (F-27). So the
  values first shown are the three that the most teams have; v5's first three left 30 of
  2026mnwi's 48 teams off the chart.
- A bubble's area follows its value, the largest 40 px across; v5's `√z × 15` px made an OPR
  of 200 a bubble over 200 px wide. A value of 0 or less is the smallest bubble, and Constant
  draws every bubble at 14 px. The y axis starts at 0 or below, so a negative OPR still shows.
- The colour is the theme's `--chart-2` (v5's `#FF6030`); the hover names the team and each
  value. The view's heading replaces Plotly's title.

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

**v6 (#387, decided 2026-11-27):** `src/analysis/filter-teams.ts`, drawn by
`src/components/analysis/filter-view.tsx`; the address is `?event=…&view=filter`.

- **AN-21, AN-21a** The rules are v5's. v5 knew its rating bands by their ids (Rating1 to
  Rating4); v6 marks them in the configuration, `"rating": true` on a band (CS-13). Picking only
  rating bands uses the every-rating rule, with the highest band's lowest value as the
  threshold; any other choice of bands uses the any-value rule. As in v5, that rule checks every
  band against every value, averages and OPRs alike, so an average of 0 is in "Low OPR (0-100)".
- **AN-21a** v5's bands were written for 2026 (v5 #279; v4.2.0 had no Filter Teams), and the
  converter gives every season them. 2025 was scouted without ratings and asks TBA for no OPRs,
  so its archived configuration has no rating bands and three point bands instead, "60+", "40+"
  and "20+ points", `"min"` bands on its averages (decided 2026-11-27, #408).
- **AN-19, AN-20** The lists are "Value" (every team's averages and OPRs, by name, as in
  Compare) and "Band" (the configuration's, in its order). One opens at a time, and a click
  outside or Escape closes it. Each pick is a chip whose × removes it.
- **AN-22** The names are the event's TBA nicknames, already loaded with the dashboard, so
  there is nothing to fetch per render. A card opens the team's view. The page says how many
  teams match.
- A missing value, or one that is not a number, is no value (F-27).

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

**v6 (#389, decided 2026-11-27):** both return, each turned on by a field of
analysis-modules.json, `simulateMatch` and `autoPickList` (off when left out; CS-13). The
converter writes both as `false`. 2025's configuration turns both on, as v4.2.0 shipped, and
leads its match-view modules with a chance of winning; 2026's leaves them off. A view a season
leaves off has no button, and an address naming it opens the event.

- **AN-11, AN-23 Simulate Match** (`src/components/analysis/simulate-view.tsx`,
  `?view=simulate`). The match list is the event's schedule, the matches assignment uses (AD-8),
  from a public route, `GET /api/analysis/schedule?event=`. It holds only which teams play in
  which match, as TBA publishes and the event's scouting data already shows. A match fills the
  six choices, leaving empty a team with no data, and choosing a team clears the match, as in
  v5. Each alliance's column shows the match-view modules for its teams; a `wholeMatch` module
  is also given the other alliance. An alliance with no team chosen shows no modules. v5 changed
  the alliances it was given when it added the other one (F-18); v6 changes nothing it is given.
- **The chance of winning** (`src/analysis/win-chance.ts`, AN-23 and AN-24 alike) is v5's
  model: an alliance scores the sum of its teams' totals, with deviation √(Σ sd²). The chance is
  Φ((a − b) / max(0.01, √(sdₐ² + sd_b²))). Φ is computed, good to 1.5 × 10⁻⁷, and exactly
  0.5 at 0. v5 looked z up in simple-statistics' table, rounded to 0.01, so a chance can differ
  from v5's in the third decimal place. A team without a total does not count, where v5 counted
  0 (F-27), and an alliance with no team that has one shows No Data. A team without a standard
  deviation counts 0, as in v5. SingleDisplay shows the chance as a percentage, two decimals
  unless `decimals` says otherwise.
- **AN-24 Auto Pick List** (`src/components/analysis/auto-pick-view.tsx`, `?view=pick`). Each
  team with a total, ranked by its average chance against each other such team, highest first;
  a tie keeps team order, by a sort rather than v5's bubble sort. v5 had no 0.01 floor here, so
  two teams with no deviation divided by 0. Teams without a total are listed after the ranking,
  and with fewer than two teams with a total, nobody is ranked. A team opens its view, where v5
  drew the team's modules beside the list.

## CSV export (v5: `GET /analysis/api/csv`, server side; v6: client-side, ADR 0005)

- **AN-25** (v5; **v6: replaced** by AN-26a) Re-runs the pipeline on the server (dataset fetched from its own endpoint **plus**
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

**v6 (#388, decided 2026-11-27):** `src/analysis/csv.ts`, from **Download CSV** in the
dashboard's sidebar. The file is named for the event (`2026mnwi_official.csv`).

- **AN-26** v5's columns, for every key any team has, in the order the teams have them. v6
  counts each action per period, so `averages` nests, and each value inside gets its own column
  named by its path (`auto.StartShooting Average`). 2026mnwi's file has 793 columns. 477 of them
  are 0 or empty for every team, such as an action counted in a period where it can't happen.
  They stay, so the file holds every value the dataset has.
- **Missing values** are empty cells, as the page shows No Data (F-27). v5 wrote 0, which a
  spreadsheet can't tell from a real 0, and which counted in a column's average.
- **Quoting** A field holding a comma, a quote or a line break is quoted, quotes doubled
  (RFC 4180); v5 quoted nothing. A header starting with `=`, `+`, `-` or `@` gets a `'` first,
  so a spreadsheet never reads a key (some come from TBA) as a formula. Lines end in CRLF.
- **AN-26b** Only team values are written, never a performance, so no scouter appears. A team
  missing one of the groups gets empty cells, where v5's route failed.

## Demo label

- **AN-27** `/analysis/api/isDemo` controls a large "DEMO" label on the welcome view. **v6:**
  comes with demo mode (#374, Phase 4).
