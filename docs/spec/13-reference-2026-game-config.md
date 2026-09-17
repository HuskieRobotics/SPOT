# 13 — Reference: the shipped 2026 (REBUILT) configuration

This is a worked example showing how the configuration system in document 04 expresses a
real game. A rewrite can use it as an acceptance fixture: loading these files must produce
the same scouting flow, ids, derived paths, and dashboard.

## `config.json` (non-secret parts, as of this repo)

`TBA_EVENT_KEY: 2026mnwi`, `EVENT_NUMBER: <ObjectId>`, `DEMO: false`, `VERSION: "1.0"`,
`TBA_OPR_STRINGS: { string_1: "Hub Total Fuel Count", string_2: "minorFoulCount", string_3: "majorFoulCount" }`.

## `match-scouting.json`

- `timing.totalTime = 160000` ms (2:40 including a 10 s pre-teleop transition; the real
  match is 150 s but the config models an extra window).
- Transitions: `159999 → layer 1 "Auto"`, `140000 → layer 7 "Teleop Transition"`,
  `130000 → layer 2 "Teleop"`. Thus `teleopTime = 130000`, `autoPhaseEndTime = 140000`
  (A-Stop window), endgame at 30000, 25 s shifts.
- `variables.minOfQueueLength = 2`.
- Grid 6 rows × 11 columns; 13 layers, 237 unique ids.

Layer flow (button `id` / `type`, `→ n` means a `layer` executable to layer n):

| #   | Purpose                      | Buttons                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | Pre-match                    | `startGame`/match-control (→1), `preloadFuel`, `preloadNone`                                                                                                                                                                                                                                                                                                                                     |
| 1   | Auto                         | `startGame`, `Broken`("Disabled"), `aStop`, `undo`, `AttemptL1`("Attempted Climb"), `FallL1`, `StartShooting` (climbHighlight), `StopShooting` (climbHighlight, clearHighlight, →6), `Passing` (→5), `Storing`("Collecting", →4)                                                                                                                                                                 |
| 2   | Teleop shift picker          | `startGame`, `Broken`, `undo`, `teleopActive`/none (→7), `teleopInactive`/none (→7)                                                                                                                                                                                                                                                                                                              |
| 3   | Climb levels                 | `AttemptL3`, `AttemptL2`, `AttemptL1`, `fall` (all climbHighlight)                                                                                                                                                                                                                                                                                                                               |
| 4   | Auto collect source          | `CollectOutpost`, `CollectDepot`, `CollectNeutral` (each →1)                                                                                                                                                                                                                                                                                                                                     |
| 5   | Auto passing rating          | `RatingPassing1..4` (→1)                                                                                                                                                                                                                                                                                                                                                                         |
| 6   | Auto shooting rating         | `RatingShooting1..4` (→1)                                                                                                                                                                                                                                                                                                                                                                        |
| 7   | Teleop main                  | `AZone`("Alliance Zone"), `NeutralZone`, `OAZone`("Opposing Zone"), `Storing` (→11), `Passing` (→9), `Defense` (→8), `AttemptClimb` (→3), `StartShooting` (position, climbHighlight), `StopShooting` (climbHighlight, clearHighlight, →10)                                                                                                                                                       |
| 8   | Defense rating               | `RatingDefense1..4` (→7)                                                                                                                                                                                                                                                                                                                                                                         |
| 9   | Teleop passing rating        | `RatingPassing1..4` (→7)                                                                                                                                                                                                                                                                                                                                                                         |
| 10  | Teleop shooting rating       | `RatingShooting1..4` (→7)                                                                                                                                                                                                                                                                                                                                                                        |
| 11  | Collecting rating            | `RatingStoring1..4` (→7)                                                                                                                                                                                                                                                                                                                                                                         |
| 12  | **Id catalog (never shown)** | 195 composite ids: `autoTowerRobot_Level1`, `endGameTowerRobot_Level1..3` (TBA synthetic), and `<phase>Rating{Shooting,Passing,Defense,Storing}{1..4}`, `<phase>{AZone,NeutralZone,OAZone}`, `<phase>{AttemptL1..3,Fall}`, `<phase>{Passing,Storing,Defense,StartShooting,StopShooting,Broken,aStop,...}` for phases `auto`, `teleopTransition`, `activeShift1/2`, `inactiveShift1/2`, `endgame` |

Rating buttons carry descriptive labels, e.g. "Rating 1 (Attempted but Ineffective)" …
"Rating 4 (Very Accurate + Very Fast)" for passing; shooting, defense, and collecting have
their own four-level descriptions; classes `rating-lowest` … `rating-highest`.

Typical scouter flow: preload → Start Match (auto layer) → shooting start/stop with
rating → at 140 s the transition layer (7) appears → at 130 s the shift picker (2) asks
whether the robot is in an active or inactive shift → teleop main layer (7) with zone,
action, rating cycles (zone → action → rating triplets feed `zoneActionRatingGroupings`)
→ climb → after 0 s "Submit Match".

## `analysis-pipeline.json` (order matters)

1. `tmp/removeDuplicates → matches`
2. `tmp/countActions(all) → counts`
3. `tmp/sum` → `counts.shooting` (all `<phase>StopShooting`), `counts.passing`,
   `counts.storing`, `counts.defense`
4. `tmp/actionTime(attemptClimb) → actionTimes.attemptClimb`
5. `tmp/cycle` → `cycle.autoShootingTime` (autoStart→autoStop), `cycle.shootingTime`,
   `cycle.defenseTime` (defense → any defense rating), `cycle.storingTime`, `cycle.passingTime`
6. `tmp/weightedSumAverage` → `scores.<phase><Metric>Rating` for auto passing/shooting and
   for transition/active1/active2/inactive1/inactive2/endgame × defense/passing/storing/shooting
   (weights 1–4)
7. `tmp/sumAverage` → `scores.defenseRating`, `scores.passingRating`, `scores.storingRating`,
   `scores.shootingRating` (count-weighted across phases)
8. `tmp/zoneActionRatingGroupings → zoneActionRating`
9. `team/countActions(all) → counts`
10. `team/sum → disabledCounts` (all `<phase>Broken`)
11. `team/aggregateArray(actionQueue) → aggregatedActions`
12. `team/averageTime → averageTimes.attemptClimbTime`
13. `team/aggregateArray` + `team/averageArray` → `cycles.<x>.all`, `.allComplete`,
    `.averageTime`, `.averageTimeComplete` for shootingTime, autoShootingTime, defenseTime,
    storingTime, passingTime; `team/multiply(0.001)` → `cycles.<x>.averageTimeSeconds`
14. `team/average(counts) → averages`, `team/average(scores) → averageScores`,
    `team/deepAverage(zoneActionRating) → zoneActionRatingAverages`

## `analysis-modules.json`

Team view, main column:

- `PerformanceTimePlot` "Robot Action Counts Each Match" — `counts.shooting/passing/storing/defense` per match.
- `RadarChart` "Ratings By Time Intervals" — sections Auto, Transition, Active 1, Active 2,
  Inactive 1, Inactive 2, Endgame, Auto; lines Shooting, Collecting, Passing, Defense from
  `averageScores.<phase><Metric>Rating` (`none` where not applicable).
- `HeatmapScatterPlot` "Teleop Shooting Heatmap" — `other.pos` from `aggregatedActions`, group
  "Teleop Start Shooting" (`teleopTransition/activeShift1/activeShift2/endgame` + `StartShooting`),
  image `img/half-field.svg`.
- `Bar` "Attempted Climb Level" — `counts.endgameFall`, `endgameAttemptL1..3`.
- `Bar` "TBA Climb Levels" — `counts.endGameTowerRobot_Level1..3` (from TBA synthetic actions).
- `Pie` "Pre-Loads" — `counts.preloadFuel` vs `counts.preloadNone`.
- `Pie` "Average Action Times" (unit `s`) — `cycles.<x>.averageTimeSeconds`.

Team view, side column: `Stats` "Team Stats" — Fuel OPR, Auto Fuel OPR, Minor/Major Foul OPR
(from `opr.*`), A-Stop Count (`counts.autoaStop`), Disabled Count, average
passing/defense/shooting/collecting ratings, average auto shooting/passing ratings, average
auto/teleop shooting time (ms × 0.001, hidden if 0), each with `decimals: 2` and a sort
direction for rank badges.

Match view (dormant): `ColumnDisplay` for `averageScores.auto/teleop/endgame/total` and a
`Stats` "Alliance Stats" summing the same — these paths are **not** produced by the 2026
pipeline, which is consistent with the match view being disabled.

## Archived configurations worth preserving as fixtures

- 2022 (Rapid React): `position` and `hide` executables, `actionTimeFilter`, `map`,
  `threshold`, HeatmapScatterPlot in match view.
- 2023 (Charged Up): `conditionalLayer` + `setVariable` with `heldPiece`/`showPark` variables
  and transition-level `conditional`/`always`; `countHybrid`; `Grid` module; `SingleDisplay`
  with `wholeMatch` percent-chance-of-winning.
- 2024/2025: `label` buttons, `minOfQueueLength`, `standardDeviation` + `averageScores.total`
  for Simulate Match/Auto Pick, `Bar` module.
