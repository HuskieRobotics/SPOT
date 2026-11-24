# Checking and previewing

Three tools tell you whether a configuration works, before any real match is played:

- `npm run config:check` finds mistakes, and says where and how to fix them.
- `npm run config:preview` shows what the analysis would compute and show.
- The [scouting-screen preview](#the-scouting-screen-preview), a page, draws
  `match-scouting.json` as a scouter will see it, and lets you play a match on it.

The two commands read the three files in `config/` unless you name another folder after `--`:

```sh
npm run config:check -- config/seasons/2025
```

All three are also in VS Code's **Run and Debug** list, where you pick the folder from a list
instead of typing it; see [Or pick a command from a list](README.md#or-pick-a-command-from-a-list).

## `config:check`

```sh
npm run config:check
```

It ends with a summary: `✓ No errors or warnings in config/.`, `✓ No errors in config/, but
2 warnings to look at.`, or `✗ 6 errors and 6 warnings in config/seasons/2025/`. Above it,
each finding looks like this:

```
config/seasons/2025/analysis-pipeline.json:378:5  warning  entry 36 (team averageArray → cycles.algae.averageTime)
    A team that never does this gets null ("No Data") here, so it drops out of the ranking by "cycles.algae.averageTime" in module 11 (team Stats "Team Stats") instead of ranking last.
    Set "ifNone" to the worst value on purpose so such a team ranks last. ...
```

1. **Where**: the file, line and column (Ctrl+click, or Cmd+click on a Mac, to jump there),
   `error` or `warning`, and where in the file in words. Entries are numbered from 1 in the
   order they appear, and so are modules, layers' buttons and list items.
2. **What is wrong.**
3. **What to try**, when there is a suggestion.

**Errors** are mistakes: something is missing, misspelled, or can't work. Fix every error. The
command exits with an error code while there are any, so it can stop a broken configuration
from being used.

**Warnings** are things that are probably mistakes but might be on purpose. Read each one, then
fix it or know why it stays.

### What it checks

**The files can be read.** A JSON mistake comes with its line and a hint for the usual causes: a
comma after the last item, a missing comma, a comment (JSON has none), single quotes instead of
double, or a file that ends too early.

**Each file follows its rules.** A name the file doesn't allow gets a suggestion
(`unknown property "mises"; did you mean "misses"?`), and a value of the wrong kind says what it
should be. These are the same rules VS Code underlines in red.

**`match-scouting.json` fits together.**

- Every layer, button and phase a setting names exists.
- No two layers, phases, segments or kinds share an id.
- Phases and segments are in order, inside the match, and inside their phase.
- Fixed kinds and `alternate` make sense ([Periods](periods.md)).
- Warnings: a button that reaches past the grid, two buttons in the same cell, a layer nothing
  opens, a variable nothing sets.

**The pipeline names things that exist.**

- Every transformer is one SPOT has, with options it knows.
- Every button id an option names is an action button. A label or Undo button records nothing,
  so counting it is a mistake.
- Every phase, segment and kind a filter names exists.
- TBA enrichment names a phase that exists, and lists `knownIds`.
- A made-up match goes into a QR code and comes back unchanged, so scouters without a
  connection can hand matches in. (There is no `qr.json` to set: SPOT works out the QR code
  from `match-scouting.json`.)

**The calculations work.** The check plays 120 made-up matches with your buttons and runs the
whole pipeline on them. One made-up team, 9999, never does anything, to see how the analysis
treats a team with nothing recorded. Then it reports:

- **A path no earlier entry writes.** The hint names what was probably meant: a similar name, the
  same value somewhere else, or the entry that writes it but comes later (entries run in order).
- **An entry that fails**, with the first performance or team it failed on.
- **A module path the pipeline never writes**, so the module would always show No Data.
- **A value that is 0, No Data or empty for every team**, reported once, where it starts. Often
  a button the made-up scouters never saw, because no layer shows it in that period. The hint
  says where the button was recorded.
- **A ranking that a team that never did anything drops out of**, because nothing gives it a
  worst value. See [Worst values](analysis-pipeline.md#worst-values-ranking-teams-that-never-did-something).

The made-up matches show likely mistakes, not proof: the made-up scouters press buttons at
random, within the rules, about as often as real scouts do.

If a file has errors, the checks that compare it with another file wait until it is fixed, so
one typo doesn't bury the report in findings. The report says what it skipped. Fix the errors
and run it again.

`--json` prints the findings for a program to read instead of a person.

## `config:preview`

```sh
npm run config:preview
```

It plays 80 made-up matches, runs the pipeline, and shows the result in three parts.

**1. What the modules show**, for every module, across the made-up teams:

```
What the modules show, across the other 48 teams
                                                                          min      median         max        9999
module 11 (team Stats "Team Stats")
  Algae Accuracy (algaeAccuracy)                                       30.77%      50.00%      80.00%       0.00%
  ...
  Average Coral Misses (averages.missCoral)                      never written by the pipeline
```

Each line shows a module's value as the page would display it, with its formatting: the
smallest, the middle (median) and the largest value over the teams, and in the last column the
value team 9999 gets, the team that never does anything. "never written by the pipeline" is
one of the six errors 2025 shipped with; `config:check` explains it.

**2. What each entry computes**, in order:

```
entry 28 (team ratio → algaeAccuracy)                              0.31 … 0.5 … 0.8
entry 30 (team aggregateArray → cycles.endgame.all)                0 … 4 … 8 items
entry 45 (team average → averages)                                 49 values
```

A number entry shows its smallest … middle … largest value; a list shows how many items; an
entry that writes many values says how many. Add `--all` to list every value of every entry.

**3. Anything that looks wrong** is marked with ⚠, both in the modules and in the entries:

```
    counts.preMatch.Broken  0  ⚠ 0 for every performance
```

`0 for every …`, `No Data for every …`, `empty for every …` and `the same for every …` are often
fine (nobody presses Disabled before the match) but sometimes mean a button is never shown, or a
calculation reads the wrong value. Decide which.

### Options

| Option             | What it does                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `--team 3061`      | Show one made-up team's page as the analysis page would, with ranks.                                                                           |
| `--all`            | List every value of every entry.                                                                                                               |
| `--matches 40`     | Play a different number of matches (80 if left out).                                                                                           |
| `--seed something` | Different made-up matches. The same seed always gives the same matches, so two previews can be compared after a change.                        |
| `--out file.json`  | Where to write the whole made-up dataset (`config-preview.json` if left out). Open it in VS Code to look at any performance or team in detail. |

The last line of the preview says whether `config:check` finds anything; the preview is only as
good as the configuration, so fix errors first.

## The scouting-screen preview

```sh
npm run dev
```

When it says `Ready`, open <http://localhost:3000/scouting-preview> in a web browser. It draws
the screen from `config/match-scouting.json`. To draw another folder, add `?season=` and the
folder's name under `config/seasons/`: <http://localhost:3000/scouting-preview?season=2025>.
The links at the top of the page list every folder SPOT finds.

The page reads the file each time it loads, so leave SPOT running, and after each save reload
the page. To stop SPOT, click in its terminal and press Ctrl+C.

If `match-scouting.json` has errors, the page lists them instead of the screen; they are the
same messages `config:check` prints. Warnings are listed above the screen, folded; click to open
them. The page checks only `match-scouting.json`, so run `config:check` for the other three
files.

Play a match the way a scouter would: press the buttons before the match, then the Start button,
and the clock runs the phases and their screens. Controls above the screen:

| Control                 | What it does                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Alliance**            | The scouted robot's alliance. On Blue, buttons in `"allianceRelativeButtons"` record their partner ([Rules](match-scouting.md#rules)).                            |
| **Field**               | **Flipped** is the field seen from the other side: those buttons swap places and the field map turns around.                                                      |
| **Speed**               | Run the clock 2, 5 or 10 times as fast.                                                                                                                           |
| **Skip to next period** | Jump to the start of the next phase, segment or shift, or to the end of the match.                                                                                |
| **New match**           | Start again before the match.                                                                                                                                     |
| **Screen**              | The shape of a phone or a tablet held sideways.                                                                                                                   |
| **Show grid**           | Number every empty cell by row and column, and show each button's id and `"gridArea"`. Use it to find where a new button goes ([Your first change](tutorial.md)). |

Beside the screen (below it, on a phone), **Recorded actions** lists every action recorded so
far, newest first, exactly as the calculations receive it: the button `id`, `ts` (the time left
in the match, in milliseconds), and the period it was pressed in (`phase`, and for a game with
[segments](periods.md) `segment`, `segmentKind` and `segmentIndex`). Buttons that only switch
screens record nothing. When the match ends, press **Submit Match**: the page says how many
actions a real match would send.

What to look for:

- Every layer can be reached, and each phase shows the screen you expect.
- **Undo** goes back to the screen before the press.
- Each button records the id and the period your pipeline expects.
- Labels fit their buttons on a phone screen.
