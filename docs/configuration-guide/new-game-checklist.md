# New-game checklist

Everything to do for a new game, from kickoff to Week 0, in order. Each item says which
file it changes, how to check it, and links to the part of this guide that explains it.
[Starting a new season](new-season.md) is the same path told as a story; this page is the list
to tick off.

At kickoff, copy this page into a new GitHub issue ("2027 configuration") so the team can tick
items off as they go and see who is doing what.

You need no real matches for any of this: `npm run config:check` and `npm run config:preview`
work on made-up ones ([Checking and previewing](checking-and-preview.md)). **After every change,
run `npm run config:check` and fix every error.**

## 1. Kickoff day: set up

- [ ] **Put last season away.** Copy `config/*.json` (the three files) to
      `config/seasons/<last year>/`, named exactly the year (`2026`): the analysis pages read
      last season's events with it. In each copy change the `"$schema"` line to start
      `"../../../src/config/schema/`.
      _Check:_ `npm run config:check -- config/seasons/<last year>` finds what it found in
      `config/` before. [How](new-season.md#1-put-last-season-away)
- [ ] **Remove the drift test** (a mentor): the test in `tests/unit/config-active.test.ts` that
      keeps `config/` equal to the converter's output, since you are about to edit by hand.
      _Check:_ `npm test` passes.
- [ ] **Start from the closest game.** For a typical game, copy `config/seasons/2025/*.json` into
      `config/` and change each `"$schema"` line back to start `"../src/config/schema/`.
      _Check:_ `npm run config:check` reports 2025's six module errors (paths the 2025 pipeline
      never wrote); delete or fix those lines as you rebuild the modules (step 4).
      [How](new-season.md#2-start-from-the-closest-game)

## 2. First week: the scouting screen

File: `match-scouting.json` ([Match scouting](match-scouting.md)).

- [ ] **Match timing.** From the game manual: the match length in milliseconds (`"totalMs"`),
      and each phase's start as time remaining (`"startMs"`). Add `"pauseMs"` if the field
      pauses between auto and teleop. Add an endgame phase if you want endgame analyzed on its
      own. Don't trust numbers copied from last season: check each against the manual.
      _Check:_ `config:check` (phases in order and inside the match). [Timing](match-scouting.md#timing)
- [ ] **Periods inside a phase**, only if the game has them, like 2026's shifts: segments with
      `"repeat"`, kinds with a toggle button each (type `"none"`), `"alternate"` if the kinds
      take turns, and fixed kinds for periods that always count as one kind. Leave every
      `"prefix"` empty (`""`).
      _Check:_ `config:check`. [Periods](periods.md)
- [ ] **Screens and buttons.** Sketch each screen on paper (auto, teleop, endgame, and any screen
      a button opens), then write the layers and buttons: ids that say what they are, the right
      type, a place in the grid, colors, and what each button opens. Decide per scoring button
      whether it is one button for every phase or one per phase.
      _Check:_ `config:check` (overlapping buttons, buttons past the grid, screens nothing
      opens); `config:preview --all` (every button you will analyze is counted somewhere, with no
      ⚠ `0 for every performance`). [Buttons](match-scouting.md#buttons)
- [ ] **Field positions**, if a heatmap will show where things happened: a `position` executable
      on those buttons, and the new game's field picture in `public/img/`, named in
      `"rules"` → `"fieldMap"` → `"image"`.
      [Executables](match-scouting.md#executables-what-else-a-button-does)
- [ ] **Rules.** Undo's limit (`"minQueueLength"`), the A-Stop lock (its trigger button and the
      phase that releases it), buttons that swap sides for the blue alliance, the position lock.
      _Check:_ `config:check` (every button and phase a rule names exists). [Rules](match-scouting.md#rules)
- [ ] **Walk through the screens** in the
      [scouting-screen preview](checking-and-preview.md#the-scouting-screen-preview)
      (`npm run dev`, then `/scouting-preview`): play a whole match on each alliance. Every
      screen reachable, Undo goes back, each phase shows the right screen, and each button
      records the id and period the pipeline expects.

## 3. First two weeks: the calculations

File: `analysis-pipeline.json` ([The analysis pipeline](analysis-pipeline.md)). Keep the
2025 order: performance (`"tmp"`) entries first, team entries after.

- [ ] **Count every button**: the first entry, `countActions` with `"all": true`. Keep it.
- [ ] **Points per match**: a `weightedSum` per phase with the manual's point values
      (`scores.auto`, `scores.teleop`, `scores.endgame`), and `scores.total` adding them. Keep
      scores under `scores`. [Step 2](analysis-pipeline.md#2-points-per-match-needed)
- [ ] **Per-match totals you want averaged**, such as all misses of one game piece: a `"tmp"`
      `sum`, because the team averages average per-match values.
- [ ] **Cycles** for each kind of game piece: pickups (`"startAction"`), scores
      (`"endAction"`) and misses, with output paths under `cycles`. **Set `"capacity"`** if a
      robot can hold more than one piece of the same kind at once (2022's cargo); leave it out
      for one. [Cycles](analysis-pipeline.md#cycles)
- [ ] **Team counts**: the first team entry, `countActions` with `"all": true`.
- [ ] **Team totals and accuracy**: `sum` and `ratio` entries.
- [ ] **Worst values**: `"divByZero"` on each `ratio`, `"ifNone"` on each average, wherever
      "never did it" should rank a team last.
      _Check:_ `config:check` warns at each ranking a team that never did anything would drop
      out of, and names the worst value to use.
      [Worst values](analysis-pipeline.md#worst-values-ranking-teams-that-never-did-something)
- [ ] **Cycle times per team**: `aggregateArray` and `averageArray` for each cycle.
- [ ] **Time per game piece**, if you show it: `countMatches` with `"weight"` set to **the new
      game's match length** in milliseconds (2025: 150000), and the `ratio`'s `"divByZero"` the
      same.
- [ ] **Averages and spread**: `standardDeviation` of `scores.total`, and `average` of `counts`
      into `averages` and of `scores` into `averageScores`. Keep these paths: match prediction,
      the pick list and the score comparison graph read them.
      [Step 9](analysis-pipeline.md#9-averages-and-spread-needed)
- [ ] **Ratings**, if scouters rate actions: `weightedSumAverage` with each rating's value,
      `sumAverage` with its `"countPaths"` written out, and the `"ratings"` map of
      `zoneActionRatingGroupings`. [Ratings](analysis-pipeline.md#ratings)
- [ ] **One period at a time**, where you need it: [filters and grouping](periods.md#analyzing-one-phase-at-a-time),
      not separate ids per period.
- [ ] _Check:_ `config:check` (paths no entry writes, values 0 for every team, rankings without
      a worst value); `config:preview` (every value varies and has the right unit).

## 4. With the drive team: what the pages show

File: `analysis-modules.json` ([Analysis modules](analysis-modules.md)).

- [ ] **Decide what to show**, with the drive team and strategy students, then add the modules:
      `"main"` for charts, `"side"` for the Team Stats table. Replace or delete the 2025 modules
      you started with.
- [ ] **Format and rank** each number: `"multiplier"`, `"decimals"`, `"unit"`, and `"sort"` for
      a ranking. [Showing a number](analysis-modules.md#showing-a-number)
- [ ] **Heatmap**, if you have one: a team `aggregateArray` of `actions` into
      `aggregatedActions`, the buttons with positions, and the field picture (`"imgPath"`): the
      picture scouters tap, or a picture of half the field with `"foldHalfField"`.
      [HeatmapScatterPlot](analysis-modules.md#heatmapscatterplot-where-on-the-field)
- [ ] **Simulate Match and the Auto Pick List**: decide whether they suit the game, and set
      `"simulateMatch"` and `"autoPickList"`. Both need `averageScores.total` and
      `standardDeviation` from the pipeline. [Simulate Match and the Auto Pick List](analysis-modules.md#simulate-match-and-the-auto-pick-list)
- [ ] **Match page modules**, if Simulate Match is turned on: the `"match"` modules, and a chance
      of winning.
- [ ] **Filter Teams bands** (`"filterTeams"` → `"ratingBands"`): match the game's rating scale,
      with `"rating": true` on each band of that scale, and OPR ranges that suit the new game's
      scores. A game scouted without ratings has no rating bands; copied from 2025, the bands
      are points sized to 2025's scores, so resize them once the new game's scores are known.
      [Filter Teams](analysis-modules.md#filter-teams)
- [ ] _Check:_ `config:check` (every path a module shows exists); `config:preview` (each line
      varies, has the right unit, and lands where its module expects it; don't judge the size
      of made-up numbers); `config:preview -- config --team 3061` (one team's page, with
      ranks).

## 5. A few weeks after kickoff: TBA data

The Blue Alliance publishes a new game's score-breakdown fields and component-OPR names some
weeks after kickoff. File: `analysis-pipeline.json`, `"enrichment"` → `"tba"`
([TBA data](analysis-pipeline.md#tba-data)).

- [ ] **Score-breakdown prefixes**: the start of the field names that are per robot station
      (2026: `auto`, `endGame`), and the phase each one's actions belong to.
- [ ] **`"knownIds"`**: every result those fields can have, such as `endGameTowerRobot_Level3`,
      so a count shows 0 instead of No Data at an event where nobody achieved it.
- [ ] **`"componentOprs"`**: TBA's names for the new game's component OPRs, exactly as TBA
      writes them.
- [ ] _Check:_ `config:check` (its warning about empty `"knownIds"` goes away);
      `config:preview` (TBA-based counts and OPRs have values).

## 6. Week 0: scout real matches

Week 0 events are unofficial events held about a week before the season's first official ones,
and many stream their matches online. Scouting one from its webcast tests the configuration on
real play, with a week left to fix what it shows.

- [ ] **`npm run config:check` is clean**: no errors, and a reason for every warning left.
- [ ] **`npm run config:preview` is plausible** for every module.
- [ ] **A database and an event** for the Week 0 event, with its TBA key if The Blue Alliance
      lists it, set up the way your SPOT deployment does it.
- [ ] **Scout Week 0 from the webcast**: students scout its matches on tablets, one robot each,
      as they will at an event.
      _Check:_ each team's page shows what its scouters recorded, and points per match look
      right next to the scores on the webcast.
- [ ] **Fix what Week 0 showed**, before week 1: buttons scouters couldn't find, needed but
      didn't have, or pressed by mistake, and values that look wrong. Run `config:check` after
      each fix.
