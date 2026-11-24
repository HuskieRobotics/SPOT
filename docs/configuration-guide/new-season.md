# Starting a new season

At kickoff the new game is revealed, and within days you can start writing its configuration.
You don't need any real matches: `config:check` and `config:preview` work on made-up ones.

The full list of what a new game needs, in order and with when each item can be done, is the
[new-game checklist](new-game-checklist.md). This chapter tells the same path as a story.

## 1. Put last season away

The files in `config/` are the season SPOT is using. Before changing them for the new game:

1. Copy the three files to a new folder `config/seasons/<last year>/`, such as
   `config/seasons/2026/`.
2. In each copy, change the start of the `"$schema"` line from `"../src/config/schema/` to
   `"../../../src/config/schema/`, because the copy is two folders deeper. VS Code then checks
   and completes it as before.
3. Check the copy: `npm run config:check -- config/seasons/2026`. It should find what it found
   in `config/` before.

A mentor also removes the test that keeps `config/` equal to what the converter made from the
2026 files (in `tests/unit/config-active.test.ts`), because you are about to edit them by hand.

## 2. Start from the closest game

Most games look like 2025: an auto phase and a teleop phase, a few game pieces, and buttons for
picking up, scoring and missing each. Copy the three files from `config/seasons/2025/` into
`config/` and change them, rather than starting from nothing. In each, change the start of the
`"$schema"` line back from `"../../../src/config/schema/` to `"../src/config/schema/`. The 2025 files have six module
paths that point at values the pipeline never wrote (`config:check` reports them); fix or
remove those lines as you go.

## 3. The scouting screen: `match-scouting.json`

From the game manual:

1. **Timing.** The match length (`"totalMs"`, in milliseconds) and when each phase begins, as
   time remaining. Add an endgame phase if you want to analyze it on its own.
2. **Screens and buttons.** Sketch each screen on paper first: what the scouter needs to press
   in auto, in teleop, at the end. Then write the layers and buttons. Give buttons ids that say
   what they are (`teleopScoreAmp`), and decide whether a scoring button is per phase or one
   button for all phases ([Periods](periods.md)).
3. **Rules.** Undo's limit, the A-Stop lock (rename its phase if yours differ), the field map.

Check after each screen: `npm run config:check`. Then look at it in the
[scouting-screen preview](checking-and-preview.md#the-scouting-screen-preview), which draws your
layers as the scouter will see them, and play a match on it. **Show grid** numbers the cells, so
you can find each button's `"gridArea"` ([the tutorial](tutorial.md#3-find-the-teleop-buttons)
explains the numbers).

## 4. The calculations: `analysis-pipeline.json`

Follow [the 2025 steps](analysis-pipeline.md#the-2025-pipeline-step-by-step):

1. Count every button.
2. Points per match, from the manual's point values, and the total.
3. Cycles for each kind of game piece. Set `"capacity"` if a robot can hold more than one piece
   of a kind.
4. Team counts, totals, accuracy, cycle times.
5. Averages and standard deviation, which SPOT's predictions use.

Give every accuracy and time a [worst value](analysis-pipeline.md#worst-values-ranking-teams-that-never-did-something)
where "never did it" should rank a team last. `config:check` points at each one.

## 5. What the pages show: `analysis-modules.json`

Decide with the drive team and strategy students what they want to see for each team, then add
the modules ([Analysis modules](analysis-modules.md)). `npm run config:preview` shows every
module's values on made-up matches; `--team 3061` shows one team's page.

## 6. TBA data, a few weeks later

The Blue Alliance publishes a new game's score-breakdown fields and component-OPR names some
weeks after kickoff. Then fill in `"enrichment"` → `"tba"`: the score-breakdown prefixes and the
phase each belongs to, `"knownIds"`, and `"componentOprs"` ([TBA data](analysis-pipeline.md#tba-data)).

## 7. Week 0

Week 0 events are unofficial events about a week before the first official ones, and many stream
their matches online. Before Week 0:

- `npm run config:check` has no errors, and you know why each warning stays.
- `npm run config:preview` shows plausible numbers for every module.

Then students scout a Week 0 event's matches from its webcast, as they will at an event, and
check that the analysis pages show what they recorded. Fix what it shows before week 1.
