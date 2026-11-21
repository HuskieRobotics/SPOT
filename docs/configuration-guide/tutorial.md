# Your first change

In this walk-through you add a **Defense** button to the scouting screen of the 2025 game, then
add a line to the analysis page that shows how often each team played defense. You work on a
copy of the 2025 files, so you can't break anything. It takes about 20 minutes.

You need VS Code with the SPOT folder open, and a terminal (**Terminal → New Terminal**). See
[What you need](README.md#what-you-need).

## 1. Make a practice copy

Copy the folder `config/seasons/2025` to a new folder `config/seasons/practice`. Either:

- **In VS Code:** in the Explorer on the left, right-click `config/seasons/2025` and choose
  **Copy**. Right-click `config/seasons` and choose **Paste**. VS Code names the copy
  `2025 copy`; right-click it, choose **Rename**, and call it `practice`.
- **In the terminal** (Windows):

  ```sh
  Copy-Item -Recurse config/seasons/2025 config/seasons/practice
  ```

  or on a Mac or Linux:

  ```sh
  cp -r config/seasons/2025 config/seasons/practice
  ```

Git ignores `config/seasons/practice`, so nothing you do there can be committed by accident.

## 2. Check the copy

In the terminal, type:

```sh
npm run config:check -- config/seasons/practice
```

It takes a few seconds, then lists what it found and ends with:

```
✗ 6 errors and 6 warnings in config/seasons/practice/
```

Those are real problems the 2025 files had when the team used them. The 2025 folder is kept
exactly as it was, so the problems are still there. Each finding looks like this:

```
config/seasons/practice/analysis-modules.json:320:13  error  module 11 (team Stats "Team Stats") › options.list › item 13 › path
    analysis-pipeline.json never writes the team value "averages.missCoral", so this module would always show No Data.
    "averages" has no "missCoral", but there is a team value "counts.missCoral".
```

- The first line says **where**: the file, the line and column (hold Ctrl, or Cmd on a Mac, and
  click it to jump there), whether it is an `error` or a `warning`, and where in the file's
  structure, in words.
- The second line says **what is wrong**.
- The third line, when there is one, says **what to try**.

Remember "6 errors and 6 warnings". After your change, the count should be the same: nothing
new means your change is valid.

## 3. Find the teleop buttons

Open `config/seasons/practice/match-scouting.json`. The buttons are grouped into **layers**,
each one screen of buttons. Press Ctrl+F (Cmd+F on a Mac) and search for `"layer-2"`: that is
the screen a 2025 scouter sees during teleop.

The screen is a grid of 6 rows and 9 columns (`"rows"` and `"columns"` near the top of the
`"layout"` section). Each button covers a rectangle of cells. Here is layer-2, with a letter for
each button and `.` for an empty cell:

```
            column: 1 2 3 4 5 6 7 8 9
  row 1             B B . A A A . G G      A  startGame (Start)        G  undo (Undo)
  row 2             C C . . . . . H H      B  broken (Disabled)        H  teleopGroundPickupAlgae
  row 3             C C F F . J J H H      C  teleopGroundPickupCoral  I  teleopReefPickupAlgae
  row 4             D D F F . J J I I      D  teleopStationPickupCoral J  teleopScoreAlgae (Algae)
  row 5             D D . . . . . I I      E  teleopCoralDrop          K  teleopAlgaeDrop
  row 6             E E . L L L . K K      F  teleopScoreCoral (Coral) L  barge (Barge)
```

Row 2 is empty from column 3 to column 7. The Defense button goes there, under the Start
button, covering columns 4, 5 and 6.

A button's place is its `"gridArea"`: four numbers, `[row start, column start, row end, column
end]`. They count the **lines between cells**, not the cells, so a button one row tall ends one
line after it starts. The Barge button, `"gridArea": [6, 4, 7, 7]`, starts at row line 6 and
column line 4, and ends at row line 7 and column line 7: row 6, columns 4 to 6.

For the Defense button, in row 2 and columns 4 to 6, that is `[2, 4, 3, 7]`.

## 4. Add the button

In layer-2, find the Barge button, the last button of the layer. Its end looks like this:

```json
            "label": "Barge",
            "color": "#707070",
            "legacyClass": "gray"
          }
        ]
      },
      {
        "id": "layer-3",
```

The `}` closes the Barge button, and the `]` closes layer-2's list of buttons. Put a comma after
the `}`, then the new button, so it reads:

```json
            "label": "Barge",
            "color": "#707070",
            "legacyClass": "gray"
          },
          {
            "id": "teleopDefense",
            "type": "action",
            "gridArea": [2, 4, 3, 7],
            "executables": [],
            "label": "Defense",
            "color": "#3b82f6"
          }
        ]
      },
```

What each line means:

| Line            | Meaning                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"id"`          | The name SPOT records when the button is pressed. Letters, digits, `_` and `-` only. 2025 starts each teleop id with `teleop`, so this one does too.                        |
| `"type"`        | `"action"`: pressing it records an action. Other types are the Start button, Undo, and buttons that only switch screens ([Match scouting](match-scouting.md#button-types)). |
| `"gridArea"`    | Where it goes, from step 3.                                                                                                                                                 |
| `"executables"` | Extra things the button does when pressed, such as switching to another layer. This one does nothing extra, so the list is empty.                                           |
| `"label"`       | The text on the button.                                                                                                                                                     |
| `"color"`       | The button's color, as a web color code. `#3b82f6` is blue.                                                                                                                 |

Save the file (Ctrl+S, or Cmd+S on a Mac).

## 5. Check again

```sh
npm run config:check -- config/seasons/practice
```

It should still end with `6 errors and 6 warnings`. Nothing new: your button is valid.

If you see more, read the new finding. The most common one is a missing comma:

```
config/seasons/practice/match-scouting.json:353:11  error  (whole file)
    match-scouting.json is not valid JSON: Expected ',' or ']' after array element.
    A comma is probably missing between two items, at the end of the line before.
```

Click the location to jump to it, add the comma, save, and check again. If the button overlaps
another one, the check says which; look at the picture in step 3 again.

## 6. See it in the preview

The preview plays 80 made-up matches. The made-up scouters press whatever buttons are on
screen, including yours, and the preview shows what SPOT works out from those presses.

```sh
npm run config:preview -- config/seasons/practice --all
```

`--all` lists every value SPOT works out, which is long. Search the terminal for
`teleopDefense` (click in the terminal, then Ctrl+F, or Cmd+F on a Mac). You find it three
times:

```
entry 1 (tmp countActions → counts)                                50 values
    counts.teleopDefense  0 … 0 … 5
...
entry 11 (team countActions → counts)                              50 values
    counts.teleopDefense  0 … 5 … 11
...
entry 45 (team average → averages)                                 50 values
    averages.teleopDefense  0 … 0.52 … 1.14
```

Each line gives the **smallest … middle … largest** value:

- **Entry 1** counts each button in each match. In a typical match a robot was not seen playing
  defense (the middle value is 0), and the busiest robot pressed it 5 times in one match.
- **Entry 11** counts each button over all of a team's matches.
- **Entry 45** averages each count over a team's matches: the busiest team played defense
  1.14 times per match.

You didn't add any calculation. The first entry of `analysis-pipeline.json` counts **every**
action button (`"all": true`), so a new button is counted as soon as it exists. Entry 45
averages all of those counts.

## 7. Show it on the analysis page

A count only appears on an analysis page if a **module** shows it. Open
`config/seasons/practice/analysis-modules.json` and search for `"Team Stats"`. Its `"list"` is
the lines of a table on each team's page. The last line of the list is the number of A-Stops:

```json
          {
            "name": "Total A-Stops",
            "path": "counts.aStop",
            "decimals": 0,
            "sort": -1
          }
        ]
```

Add a comma after its `}`, then a line for defense:

```json
          },
          {
            "name": "Defense per Match",
            "path": "averages.teleopDefense",
            "decimals": 2
          }
        ]
```

- `"name"` is what the table calls the line.
- `"path"` is the value to show: the average count from step 6.
- `"decimals"` rounds it to two decimal places.

Save, check again (still 6 errors and 6 warnings), and preview without `--all`:

```sh
npm run config:preview -- config/seasons/practice
```

The first part of the preview is **what the modules show**. Under
`module 11 (team Stats "Team Stats")` there is now a line:

```
  Defense per Match (averages.teleopDefense)        0.00        0.52        1.14        0.00
```

The first three numbers are the smallest, middle and largest value over the made-up teams. The
last column is team 9999, a made-up team that never does anything, so you can see what a team
with no data gets (here 0.00, never "No Data").

To see one team's page the way the analysis page would show it:

```sh
npm run config:preview -- config/seasons/practice --team 3061
```

```
module 11 (team Stats "Team Stats")
  ...
  Total A-Stops: 0   #1 of 49
  Defense per Match: 0.89
```

`#1 of 49` is the team's rank among the teams with a value, because the A-Stops line has a
`"sort"`: `-1` ranks lower values first. Add `"sort": 1` to your defense line to rank teams that
play more defense first.

## 8. Make a mistake on purpose

Change the path to `"averages.teleopDefence"` (with a c), save, and check:

```
config/seasons/practice/analysis-modules.json:364:13  error  module 11 (team Stats "Team Stats") › options.list › item 20 › path
    analysis-pipeline.json never writes the team value "averages.teleopDefence", so this module would always show No Data.
    Did you mean "averages.teleopDefense"?
```

The check reads every path a module uses and knows every value the calculations produce, so a
misspelled path is caught before anyone looks at the analysis page. Change it back.

## What you did

- Added a button to a layer, with its place in the grid.
- Checked that the files are still valid, and read a finding.
- Saw the new button counted, per match and per team, without writing a calculation.
- Showed the count on a team's page, and saw a typo caught.

You can delete `config/seasons/practice` when you are done, or keep experimenting in it. To
learn more:

- [Match scouting](match-scouting.md): layers, button types, and what buttons can do when
  pressed.
- [The analysis pipeline](analysis-pipeline.md): calculating scores, totals, accuracy and cycle
  times.
- [Analysis modules](analysis-modules.md): the charts and tables on the analysis pages.
