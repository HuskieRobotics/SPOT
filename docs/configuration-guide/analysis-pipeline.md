# The analysis pipeline: `analysis-pipeline.json`

Scouters record button presses. Mentors and drive teams want numbers: points per match,
accuracy, how long a robot takes to score. The **analysis pipeline** is the list of
calculations that turns one into the other.

## How it works

The pipeline works on two kinds of things:

- **Performances**: everything one scouter recorded about one robot in one match. The files
  call them **tmps** (team match performances).
- **Teams**: one per robot, built from all of that robot's performances.

The pipeline is a list of **entries**. Each entry does one calculation, called a
**transformer**, and stores the answer at a **path** on each performance or each team:

```json
{
  "type": "tmp",
  "name": "weightedSum",
  "outputPath": "scores.teleop",
  "options": {
    "weightedPaths": {
      "counts.teleopl1": 2,
      "counts.teleopl2": 3,
      "counts.teleopl3": 4,
      "counts.teleopl4": 5
    }
  }
}
```

| Name           | Meaning                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `"type"`       | `"tmp"` works out a value for **each performance**; `"team"` works out a value for **each team**, from its performances.          |
| `"name"`       | Which transformer: `weightedSum` multiplies each value by a number and adds them up. See the [reference](#transformer-reference). |
| `"outputPath"` | Where the answer goes. `scores.teleop` puts it at `teleop` inside `scores`.                                                       |
| `"options"`    | What the transformer needs. Here: each count to use, and how many points it is worth.                                             |

So this entry works out, for every performance, the teleop points: 2 for each L1, 3 for each
L2, and so on.

**Entries run in order, top to bottom.** An entry can use what an earlier entry wrote, never
what a later one writes. Put the `"tmp"` entries first and the `"team"` entries after them,
because a team entry reads the finished performances.

### Paths

A path names a value by where it is, with dots between the steps: `counts.teleopl4` is the
value `teleopl4` inside `counts`. Performances and teams each have their own values, so
`counts.teleopl4` on a performance is that match's count, and `counts.teleopl4` on a team is the
team's count over all its matches, if a team entry wrote one.

### No Data

When a value can't be worked out, it is **No Data** (written `null` in the data): an average
when there was nothing to average, an accuracy when nothing was attempted. The analysis pages show "No
Data", and a ranking leaves that team out. If "never did it" should rank a team last instead,
say so; see [Worst values](#worst-values-ranking-teams-that-never-did-something).

A path that nothing wrote counts as 0 in a `sum` or `weightedSum`. That is why a misspelled path
is easy to miss, and why `config:check` reports every path an entry reads that no earlier entry
writes.

## The file

```json
{
  "$schema": "../../../src/config/schema/analysis-pipeline.schema.json",
  "version": 2,
  "enrichment": { "tba": { ... } },
  "pipeline": [ ...entries... ]
}
```

`"enrichment"` adds results from The Blue Alliance; see [TBA data](#tba-data). `"pipeline"` is the
list of entries.

## The 2025 pipeline, step by step

`config/seasons/2025/analysis-pipeline.json` is a good model for a typical game. Its 46 entries
fall into a few steps that most games repeat.

### 1. Count every button (needed)

```json
    { "type": "tmp", "name": "countActions", "outputPath": "counts", "options": { "all": true } },
```

For each performance, count how many times each action button was pressed:
`counts.teleopl4`, `counts.autoScoreNet`, … Every action button starts at 0, so a count exists
even when nobody pressed it. Most later entries read these counts. Keep this entry first.

### 2. Points per match (needed)

Four `weightedSum` entries work out `scores.auto`, `scores.teleop` and `scores.endgame` from the
point values of the game manual, and a `sum` adds them into `scores.total`:

```json
    {
      "type": "tmp",
      "name": "sum",
      "outputPath": "scores.total",
      "options": { "addends": ["scores.auto", "scores.teleop", "scores.endgame"] }
    },
```

Keep scores under `scores`: the last step averages everything there at once, and SPOT's match
predictions and pick-list ranking use the team average of `scores.total`. Two more entries
work out points per game piece, `scores.coral` and `scores.algae`.

### 3. Cycles per match (recommended)

A **cycle** is one game piece from pickup to score: how long it took is the robot's cycle time.

```json
    {
      "type": "tmp",
      "name": "cycle",
      "outputPath": "cycles.coral",
      "options": {
        "startAction": ["autoGroundPickupCoral", "teleopGroundPickupCoral", "autoStationPickupCoral", "teleopStationPickupCoral"],
        "endAction": ["teleopl1", "teleopl2", "teleopl3", "teleopl4", "autol1", "autol2", "autol3", "autol4"],
        "misses": ["teleopMissCoral", "autoMissCoral"]
      }
    },
```

See [Cycles](#cycles) for what it writes and how pickups and scores are paired.

### 4. Count every button for each team (needed)

```json
    { "type": "team", "name": "countActions", "outputPath": "counts", "options": { "all": true } },
```

The first team entry: the same counts, added up over each team's matches.

### 5. Team totals (as needed)

Sums that combine buttons, such as every L4 whether scored in auto or teleop:

```json
    {
      "type": "team",
      "name": "sum",
      "outputPath": "counts.scoreL4",
      "options": { "addends": ["counts.teleopl4", "counts.autol4"] }
    },
```

2025 has 16 of these: scores per level, total coral and algae scored, misses, drops, and
pickups by place. Work out totals here, for each team, when a module shows the total itself.
If a module shows a **per-match average** of a total, work out the total per performance
instead (a `"tmp"` sum in step 2 or 3), because the averages in step 9 average per-performance
values.

### 6. Accuracy (as needed)

```json
    {
      "type": "team",
      "name": "ratio",
      "outputPath": "coralAccuracy",
      "options": {
        "numerator": ["counts.totalCoralScored"],
        "denominator": ["counts.totalCoralScored", "counts.missCoral"],
        "divByZero": 0
      }
    },
```

Scored divided by attempted. `"divByZero"` is the answer when nothing was attempted; see
[Worst values](#worst-values-ranking-teams-that-never-did-something).

### 7. Cycle times for each team (recommended)

Two entries per cycle: `aggregateArray` joins every match's list of cycles into one list for the
team, and `averageArray` averages their times.

```json
    { "type": "team", "name": "aggregateArray", "outputPath": "cycles.coral.all", "options": { "path": "cycles.coral.all" } },
    {
      "type": "team",
      "name": "averageArray",
      "outputPath": "cycles.coral.averageTime",
      "options": { "arrayPath": "cycles.coral.all", "valuePath": "timeDifferential" }
    },
```

Times are in milliseconds; a module can show seconds with `"multiplier": 0.001`.

### 8. Time per game piece (optional)

`countMatches` with `"weight": 150000` works out a team's total match time (matches played ×
150,000 ms), and a `ratio` divides it by the pieces scored.

### 9. Averages and spread (needed)

```json
    { "type": "team", "name": "standardDeviation", "outputPath": "standardDeviation", "options": { "path": "scores.total" } },
    { "type": "team", "name": "average", "outputPath": "averages", "options": { "path": "counts" } },
    { "type": "team", "name": "average", "outputPath": "averageScores", "options": { "path": "scores" } }
```

- `averages` is the per-match average of every count: `averages.teleopl4`.
- `averageScores` is the per-match average of every score: `averageScores.total`.
- `standardDeviation` is how much a team's total score varies from match to match.

SPOT's match prediction and automatic pick list use `averageScores.total` and
`standardDeviation`, and the score comparison graph offers every `averageScores` value, so keep
these three entries and these output paths.

## Transformer reference

`tmp` and `team` say which `"type"` a transformer can have. Paths in options are read from the
same performance or team, except where it says otherwise.

### Counting

| Transformer    | Type      | Options                                                                                                                                                 | Writes                                                                                                                                     |
| -------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `countActions` | tmp, team | `"all": true` (every action button), or `"ids": [ ... ]` (only these). Optional: [period filters and `"by"`](periods.md#analyzing-one-phase-at-a-time). | `{ "button id": count }`, each starting at 0; with `"by"`, one such set per period. With `"all"`, also any id recorded that no button has. |

### Arithmetic

For all of these, a path nothing wrote counts as 0 (1 in `multiply`), and No Data in any input
gives No Data.

| Transformer          | Type      | Options                                                                   | Writes                                                                                                                                                      |
| -------------------- | --------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sum`                | tmp, team | `"addends": [paths]`                                                      | Their total.                                                                                                                                                |
| `subtract`           | tmp, team | `"minuend"`, `"subtrahend"` (paths)                                       | minuend − subtrahend.                                                                                                                                       |
| `multiply`           | tmp, team | `"multiplicands": [paths]`, `"weight"` (a number)                         | Their product, times the weight.                                                                                                                            |
| `weightedSum`        | tmp, team | `"weightedPaths": { path: number }`                                       | Each value times its number, added up: points from counts.                                                                                                  |
| `ratio`              | tmp, team | `"numerator"`, `"denominator"` (lists of paths or numbers), `"divByZero"` | The numerator's total divided by the denominator's; `divByZero` when the denominator is 0 (No Data if unset).                                               |
| `weightedSumAverage` | tmp, team | `"weightedPaths": { path: number }`                                       | An average rating: Σ count × rating ÷ Σ count. With counts of "rated 1" to "rated 4" and weights 1 to 4, the average rating. No Data when every count is 0. |
| `sumAverage`         | tmp, team | `"groups": [{ "averagePath": path, "countPaths": [paths] }]`              | Combines several averages into one, weighting each by how many values it averaged (the total of its `countPaths`).                                          |

### Across a team's matches

These are `"team"` entries whose `"path"` is a value of **each performance**.

| Transformer         | Options                                                           | Writes                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `average`           | `"path"`, `"ifNone"`                                              | The average over the team's matches, skipping matches with No Data. If `path` holds a set of values (`counts`), each is averaged. `ifNone` when there is nothing to average. |
| `averageTime`       | `"path"`, `"ifNone"`                                              | The same as `average`; kept so older files still work.                                                                                                                       |
| `deepAverage`       | `"path"`                                                          | Adds up every number inside `path` per match, then averages over the matches. Used for 2026's zone ratings.                                                                  |
| `standardDeviation` | `"path"`                                                          | How much the value varies between the team's matches.                                                                                                                        |
| `aggregateArray`    | `"path"`                                                          | Every match's list at `path`, joined into one list, in match order.                                                                                                          |
| `countMatches`      | `"weight"`                                                        | The number of matches the team played, times the weight.                                                                                                                     |
| `averageArray`      | `"arrayPath"`, `"valuePath"`, `"ifNone"`                          | The average of `valuePath` over the items of the list at `arrayPath`, such as cycle times. Also works as a `"tmp"` entry, on one performance's list.                         |
| `threshold`         | `"paths": { path: name }`, `"threshold"`, `"separator"`, `"none"` | The names whose value is above the threshold, as a list, or joined by `separator` (with `none` when there are none).                                                         |

### Reading the order of actions

These are `"tmp"` entries that look at when buttons were pressed. All of them take the
[period filters](periods.md#analyzing-one-phase-at-a-time).

| Transformer                 | Options                                                                  | Writes                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cycle`                     | `"startAction"`, `"endAction"`, `"misses"` (button ids), `"capacity"`    | Pickup-to-score cycles and their times; see [Cycles](#cycles).                                                                                               |
| `actionTime`                | `"actionId"` (a button id or a list), `"default"`                        | The time remaining when one of these buttons was first pressed, such as when the robot started to climb; `default` (No Data if unset) if never.              |
| `actionTimeFilter`          | `"timeMin"`, `"timeMax"` (time remaining, ms)                            | The actions recorded between those times, as a list. A period filter usually says the same more plainly.                                                     |
| `finalActionOccurrence`     | `"ids"` (button ids), `"default"`                                        | The last press of one of these buttons, such as the climb the robot ended on; `default` if none.                                                             |
| `countHybrid`               | `"pickup"`, `"hybrid"` (button ids)                                      | Counts each `hybrid` placement under the pickup pressed last before it (2023: whether a bottom-row placement was a cone or a cube).                          |
| `zoneActionRatingGroupings` | `"zones"`, `"actions"` (button ids), `"ratings"`: `{ button id: value }` | 2026: each rated action with the zone the robot was in, and the average rating per zone and action.                                                          |
| `map`                       | `"path"`, `"map"`: `{ value: result }`                                   | Looks up a value in a table. 2022 used it with `finalActionOccurrence`: the id of the last climb button pressed, mapped to 1 or 0 to count each climb level. |

A programmer can add transformers; see [Extension transformers](../extension-transformers.md).
`config:check` knows every built-in transformer's options and reports a misspelled one.

## Cycles

```json
      "options": {
        "startAction": ["teleopGroundPickupCoral", "teleopStationPickupCoral"],
        "endAction": ["teleopl1", "teleopl2", "teleopl3", "teleopl4"],
        "misses": ["teleopMissCoral"]
      }
```

- A **start** is a pickup; an **end** is a score; a **miss** ends a cycle without scoring.
- Each end is paired with the pickup before it. The pairs cover the whole match, so a piece
  picked up in auto and scored in teleop is one cycle with its full time.
- `"capacity"` is how many game pieces of this kind a robot can hold at once. Leave it out for
  one, as in most games. If a robot can hold two (2022's cargo), set `"capacity": 2`.
- If a scouter presses a pickup twice before a score (a missed tap, or a drop nobody recorded),
  only the later pickup is paired, so one mistake affects one cycle and never the cycles after
  it.

It writes, at its `outputPath`:

| Value                 | Meaning                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `all`                 | Every cycle: its start, its end, and `timeDifferential`, the time between them in milliseconds.          |
| `allComplete`         | The cycles that ended in a score, not a miss.                                                            |
| `averageTime`         | The average time of `all`; No Data when there were none.                                                 |
| `averageTimeComplete` | The average time of `allComplete`.                                                                       |
| `cycleCount`          | How many cycles.                                                                                         |
| `cycleCountComplete`  | How many ended in a score.                                                                               |
| `unendedCount`        | Pickups that never got a score or miss: the closest the data comes to "dropped, and nobody recorded it". |

With a [period filter](periods.md), a cycle counts if it starts or ends in the period. A cycle
entry without a filter lists each cycle once, so it is the one to use for a team's overall
cycle time.

## Worst values: ranking teams that never did something

What should a team's coral accuracy be if it never tried to score coral? Its cycle time if it
never completed a cycle? There are two answers, and the configuration chooses:

- **A worst value**, such as 0 accuracy or the full match time per game piece. The team then
  ranks **last**. Use this when "never did it" really means "can't do it", which is usually the
  case. It matters beyond one table: rankings are combined to judge competitiveness, predict
  matches and pick alliance partners, and a robot that can't score drags its alliance down, so
  it should not be left out.
- **No Data** (leave it unset). The team is left out of rankings and averages. Use it only when
  "never did it" truly means "we don't know".

Where you set it:

- `ratio`: `"divByZero"`. 2025's accuracies use `"divByZero": 0`, and its time per game piece
  uses `"divByZero": 150000`, the whole match.
- `average`, `averageTime`, `averageArray`: `"ifNone"`. For a cycle time, the full match time
  (153000 in 2025) ranks a team with no cycles last.

`config:check` warns about every ranking a team that never did anything would drop out of, and
names the entry to give a worst value.

## Ratings

2026 asked scouters to rate some actions from 1 to 4. Each rating is a button (`RatingPassing1` …
`RatingPassing4`), so `countActions` counts them, and `weightedSumAverage` turns the counts into
an average rating:

```json
    {
      "type": "tmp",
      "name": "weightedSumAverage",
      "outputPath": "scores.autoPassingRating",
      "options": {
        "weightedPaths": {
          "counts.auto.RatingPassing1": 1,
          "counts.auto.RatingPassing2": 2,
          "counts.auto.RatingPassing3": 3,
          "counts.auto.RatingPassing4": 4
        }
      }
    },
```

`sumAverage` then combines the averages of several periods into one, weighting each by how many
ratings it had.

## TBA data

The Blue Alliance (TBA) publishes things scouts don't record: each robot's endgame result from
the field's scoring system, and **component OPRs**, the share of each scoring category a team
contributes. `"enrichment"` → `"tba"` asks SPOT to add them:

```json
  "enrichment": {
    "tba": {
      "scoreBreakdown": {
        "enabled": true,
        "prefixes": [
          { "prefix": "auto", "phase": "auto" },
          { "prefix": "endGame", "phase": "endgame" }
        ],
        "knownIds": [
          "autoTowerRobot_Level1",
          "endGameTowerRobot_Level1",
          "endGameTowerRobot_Level2",
          "endGameTowerRobot_Level3"
        ]
      },
      "componentOprs": ["Hub Total Fuel Count", "minorFoulCount", "majorFoulCount"]
    }
  },
```

- **Score breakdown.** TBA's score breakdown has a field per robot station, such as
  `endGameTowerRobot2` for the robot in station 2. For each robot in each qualification match,
  every field of its station whose name starts with a prefix becomes an action named after the
  field and its value: `endGameTowerRobot2` = `"Level2"` becomes `endGameTowerRobot_Level2` for
  that robot. The action belongs to the phase you name, and `countActions` counts it like a
  button. `"knownIds"` lists the results that should count 0 when nobody achieved them at an
  event, instead of No Data.
- **Component OPRs.** Each name becomes a team value `opr.<name>`, such as
  `opr.Hub Total Fuel Count`.

TBA publishes a new game's field names some weeks after kickoff, so fill these in then. The
names are case-sensitive and must match TBA's exactly.
