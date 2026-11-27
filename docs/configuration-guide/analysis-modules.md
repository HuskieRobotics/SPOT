# Analysis modules: `analysis-modules.json`

The analysis pages show each team's numbers and charts. Each chart, table or number is a
**module**, and `analysis-modules.json` lists them: which kind of module, where it goes, and
which values from [the analysis pipeline](analysis-pipeline.md) it shows.

```json
{
  "$schema": "../../../src/config/schema/analysis-modules.schema.json",
  "version": 2,
  "simulateMatch": true,
  "autoPickList": true,
  "modules": [ ...modules... ],
  "filterTeams": { "ratingBands": [ ... ] }
}
```

`"simulateMatch"` and `"autoPickList"` turn on two pages; see
[Simulate Match and the Auto Pick List](#simulate-match-and-the-auto-pick-list).

The examples come from `config/seasons/2025/analysis-modules.json`.

## A module

```json
    {
      "view": "team",
      "module": "Bar",
      "name": "Coral Reef Placement",
      "options": {
        "bars": [
          { "name": "Miss", "path": "counts.missCoral" },
          { "name": "Level 1", "path": "counts.scoreL1" },
          { "name": "Level 2", "path": "counts.scoreL2" },
          { "name": "Level 3", "path": "counts.scoreL3" },
          { "name": "Level 4", "path": "counts.scoreL4" }
        ]
      },
      "position": "main"
    },
```

| Name           | Meaning                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `"view"`       | Which page: `"team"`, a team's page, or `"match"`, Simulate Match, which compares two alliances (turned on by `"simulateMatch"`).          |
| `"module"`     | Which kind of module; see [Modules](#modules), or an extension module a programmer added.                                                  |
| `"name"`       | The title shown above it.                                                                                                                  |
| `"position"`   | On a team's page, `"main"` (the wide left column) or `"side"` (the narrow right column).                                                   |
| `"options"`    | What it shows; different for each kind of module.                                                                                          |
| `"separate"`   | Optional, and changes nothing: v5 used it to keep a module on the page of a team with no scouting data, and v6 lists only teams with data. |
| `"wholeMatch"` | Optional, match page: `true` gives the module both alliances at once, for a module that compares them, such as the chance of winning.      |

Modules appear in the order they are listed.

## Which values a module can show

A `"path"` in a module names a **team value**: something a `"team"` entry of the pipeline wrote,
such as `counts.scoreL4` (the team's L4 total) or `averages.teleopl4` (its L4s per match). One
module, the Performance Time Plot, shows a **value of each match** instead, such as
`scores.total`.

`config:check` knows every value the pipeline writes, and reports a module path that nothing
writes, with a suggestion. `config:preview` shows what each module would display.

## Showing a number

Stats lines, columns and single numbers share these options:

| Option          | Meaning                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `"multiplier"`  | Multiply the value first: `100` turns a 0.47 accuracy into 47, and `0.001` turns milliseconds into seconds.                             |
| `"addend"`      | Then add this.                                                                                                                          |
| `"decimals"`    | Round to this many decimal places.                                                                                                      |
| `"unit"`        | Text after the number, such as `"%"` or `"s"`.                                                                                          |
| `"hideIfValue"` | Show "No Data" when the value equals this, after the multiplier, such as `0` for a time that can't really be 0.                         |
| `"sort"`        | Rank teams by this value: `1` puts higher values first, `-1` lower values first. A team's page then shows its rank, such as `#3 of 42`. |

A value that is missing or No Data shows "No Data", and a team with No Data is not ranked. Teams
with the same value share a rank.

```json
          {
            "name": "Coral Accuracy",
            "path": "coralAccuracy",
            "multiplier": 100,
            "decimals": 2,
            "sort": 1,
            "unit": "%"
          },
```

This shows a team's coral accuracy as a percentage with two decimals, ranked so the most
accurate team is #1.

On the match page, `"aggrMethod"` says how to combine the three robots of an alliance:
`"sum"` adds them (expected alliance points), and `"average"`, or leaving it out, averages
them.

## Modules

### Stats: a table of numbers

```json
      "module": "Stats",
      "options": {
        "list": [
          { "name": "Coral Accuracy", "path": "coralAccuracy", "multiplier": 100, "decimals": 2, "sort": 1, "unit": "%" },
          { "name": "Total A-Stops", "path": "counts.aStop", "decimals": 0, "sort": -1 }
        ]
      }
```

One line per item of `"list"`: its `"name"`, its value, and its rank when it has `"sort"`. Each
line takes the [number options](#showing-a-number). Usually in the side column.

The charts (Bar, Pie, PerformanceTimePlot and RadarChart) use the page's colours, in light and
dark mode. A chart with nothing to show, because no value it names has data yet, says "No Data"
instead of drawing empty axes.

### Bar: a bar chart

```json
      "module": "Bar",
      "options": { "bars": [{ "name": "Level 1", "path": "counts.scoreL1" }, ...] }
```

One bar per item of `"bars"`. On the match page, `"aggrMethod"` combines an alliance's robots
as for [numbers](#showing-a-number).

### Pie: a pie chart

```json
      "module": "Pie",
      "options": {
        "slices": [
          { "name": "Ground", "path": "counts.groundPickupCoral" },
          { "name": "Station", "path": "counts.stationPickupCoral" }
        ]
      }
```

One slice per item of `"slices"`, sized by its value; a value below 0 has no slice. Each slice
shows its number, rounded to at most 2 decimal places, or to exactly `"decimals"` places when you
give it, followed by `"unit"` if you give one.

### PerformanceTimePlot: a value over a team's matches

```json
      "module": "PerformanceTimePlot",
      "options": { "trackedStats": ["scores.auto", "scores.teleop", "scores.endgame", "scores.total"] }
```

One line per value, with a point for each of the team's matches. The paths are **values of
each match** (what a `"tmp"` entry writes), not team values. Team page only.

### HeatmapScatterPlot: where on the field

Shows where on the field a team's actions happened, from the spots scouters tapped (a
`position` executable on the button, see [Match scouting](match-scouting.md#executables-what-else-a-button-does)).
A dot for each spot, a color for each button, and a heat layer over the group's spots. A spot
reads the same way whichever way round the field was shown to the scouter.

```json
      "module": "HeatmapScatterPlot",
      "options": {
        "coordinatePath": "other.pos",
        "aggregatedActionsPath": "aggregatedActions",
        "actionGroups": [{ "name": "Shooting", "actions": ["StartShooting"], "phases": ["teleop", "endgame"] }],
        "actionLabels": { "StartShooting": "Start Shooting" },
        "imgPath": "img/field.svg",
        "coordinateTransform": "none"
      }
```

| Option                    | Meaning                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"aggregatedActionsPath"` | A team value holding every action of every match: add a team entry `{ "type": "team", "name": "aggregateArray", "outputPath": "aggregatedActions", "options": { "path": "actions" } }`.                                                                                                                                                                           |
| `"coordinatePath"`        | Where the spot is stored on each action: `"other.pos"`.                                                                                                                                                                                                                                                                                                           |
| `"actionGroups"`          | The groups a viewer can switch between, with a button for each when there are several; the first shows first. Each names button ids, and optionally [period filters](periods.md) to keep only some periods.                                                                                                                                                       |
| `"actionLabels"`          | The name to show for each button id. A button id with no name here shows its id.                                                                                                                                                                                                                                                                                  |
| `"imgPath"`               | The field picture, inside the `public/` folder. With `"none"`, use the picture scouters tap (`"rules"` → `"fieldMap"` → `"image"` in match-scouting.json), so each spot lands where it was tapped.                                                                                                                                                                |
| `"coordinateTransform"`   | `"none"` (or leave it out) draws each spot where it was tapped. `"foldHalfField"`, as 2026 did, shows both alliance zones on a picture of one end of the field: the far end is turned round onto the near end, so each driver's left stays left (it is turned, not mirrored). Spots in the middle third of the field's length, 2026's neutral zone, are left out. |

### RadarChart: several values on one spider chart

```json
      "module": "RadarChart",
      "options": {
        "sections": [{ "name": "Auto" }, { "name": "Teleop" }, { "name": "Endgame" }, { "name": "Auto" }],
        "lines": [
          {
            "name": "Points",
            "times": [
              { "name": "Auto", "path": "averageScores.auto" },
              { "name": "Teleop", "path": "averageScores.teleop" },
              { "name": "Endgame", "path": "averageScores.endgame" },
              { "name": "Auto", "path": "averageScores.auto" }
            ]
          }
        ]
      }
```

`"sections"` are the spokes. Each line gives a value for each spoke, **in the same order as
`"sections"`**: the first time is the first spoke's, and so on. A time's `"name"` is only a
reminder of which spoke it is. Use `"path": "none"` for a spoke the line has no value for: it
counts as 0. The scale runs from 0 to 4, or to the largest value when one is above 4. Team page
only.

The shape closes by itself. Older configurations repeat the first spoke at the end, as here,
which v5 needed; that still works, and you can leave it out.

### ColumnDisplay: one column per robot (match page)

```json
      "view": "match",
      "module": "ColumnDisplay",
      "options": { "path": "averageScores.auto", "sort": 1, "decimals": 2 }
```

One value per robot, side by side, with each robot's rank. Takes the
[number options](#showing-a-number), and `"string": true` to show a text value as it is.

### SingleDisplay: one number for an alliance (match page)

```json
      "view": "match",
      "module": "SingleDisplay",
      "options": { "path": "averageScores.total", "aggrMethod": "sum", "decimals": 2 }
```

One number for the whole alliance, combined with `"aggrMethod"`. With
`"aggrMethod": "percentChanceOfWinning"` and `"wholeMatch": true` on the module, it shows each
alliance's chance of winning, from `averageScores.total` and `standardDeviation`.

### Grid: a colored grid

```json
      "module": "Grid",
      "options": {
        "rows": 3,
        "cols": 9,
        "min": 0,
        "max": 5,
        "cells": [{ "x": 1, "y": 1, "path": "counts.scoreL4", "hex": "#30a2ff" }]
      }
```

A grid of cells, each colored more strongly the larger its value is between `"min"` and
`"max"`, such as a picture of a scoring grid.

### Divider

```json
{ "view": "team", "module": "Divider", "name": "Endgame", "options": {} }
```

A heading line between groups of modules.

A programmer can add modules ([Writing an extension module](../extension-modules.md)).
`config:check` reports a module that is neither built in nor added, with the closest name, and
checks an added module's options.

## Simulate Match and the Auto Pick List

Two pages that suit a game where a team's points predict its matches, as 2025's did. 2026 rated
robots instead of counting game pieces, so its configuration leaves them off. Each is off unless
you turn it on:

| Field             | Page                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"simulateMatch"` | **Simulate Match**: choose a match from the schedule, or up to three red and three blue teams, and the `"match"` modules show each alliance side by side.                                                              |
| `"autoPickList"`  | **Auto Pick List**: every team ranked by its average chance of beating each other team, one on one, from its `averageScores.total` (its average match score) and its `standardDeviation` (how much that score varies). |

Both read the chance of winning from those two team values, which the pipeline must write:
`config:check` says so if it doesn't. A team without `averageScores.total` is left out of the
list. The chance of winning in Simulate Match is a `SingleDisplay` with
`"aggrMethod": "percentChanceOfWinning"` and `"wholeMatch": true`.

## Filter Teams

On the Filter Teams page, a user picks values (any `averageScores` value or component OPR) and
bands, such as "rated 3 or more" or "OPR from 151 to 250", and sees the teams that match.
`"filterTeams"` → `"ratingBands"` sets the bands they can pick:

```json
  "filterTeams": {
    "ratingBands": [
      { "id": "Rating4", "label": "Rating4", "kind": "exact", "value": 4, "rating": true },
      { "id": "Rating3", "label": "Rating3", "kind": "min", "value": 3, "rating": true },
      { "id": "strongOPR", "label": "Strong OPR (151-250)", "kind": "range", "min": 151, "max": 250 },
      { "id": "negativeOPR", "label": "Negative OPR", "kind": "negative" }
    ]
  }
```

| `"kind"`     | A value is in the band when it is… |
| ------------ | ---------------------------------- |
| `"exact"`    | equal to `"value"`.                |
| `"min"`      | at least `"value"`.                |
| `"range"`    | between `"min"` and `"max"`.       |
| `"negative"` | below 0.                           |

`"rating": true` marks a band on the game's rating scale, as Rating1 to Rating4 are. It changes
what picking bands does:

- **Only rating bands picked:** the teams whose every rating is at least the highest band
  picked. Rating3 shows the teams rated 3 or better at everything they do (every positive
  `averageScores` value).
- **Any other bands picked:** the teams with any value (average or OPR) in any band picked.
- **Values picked as well:** the teams whose every value picked is above 0 and in a band picked.

The bands a converted configuration starts with are the ones v5 had for 2026, with Rating1 to
Rating4 marked; change them if a game rates on a different scale, and size the OPR ranges to the
game's scores.

A game scouted without ratings needs no rating bands. 2025 has none: its bands are points, sized
to its teams' average totals, which at 2025ilch ran from 2 to 86:

```json
  "filterTeams": {
    "ratingBands": [
      { "id": "points60", "label": "60+ points", "kind": "min", "value": 60 },
      { "id": "points40", "label": "40+ points", "kind": "min", "value": 40 },
      { "id": "points20", "label": "20+ points", "kind": "min", "value": 20 }
    ]
  }
```

`"min"` bands like these work whether or not a value is picked. With Total picked, "40+ points"
shows the teams whose average total is at least 40. With nothing picked, it shows the teams with
any average of at least 40, and as a team's total is its largest average, those are the same
teams. A `"range"` band, such as "0 to 20", is best used with a value picked: with none, it
matches nearly every team, because nearly every team has some small average.

The Compare Team Scores page needs no configuration: it offers every `averageScores` value and
component OPR.
