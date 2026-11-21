# Periods: phases, segments and kinds

Scouts often want a number for one part of the match: coral scored in auto, defense played in
teleop. This chapter explains how SPOT knows when each action happened, and how the analysis
counts one period at a time.

**Most games need only phases**, like 2025. Segments and kinds exist for a game like 2026,
where teleop was split into shifts. Read the first two sections; read the rest when a game
needs it.

## Every action knows its period

When a scouter presses an action button, SPOT records the button's id, the time remaining, and
the **phase** the clock was in. In 2025 a press of `teleopl4` with 87 seconds left is recorded
as "`teleopl4`, 87,000 ms remaining, phase `teleop`". A press before the match starts, such as
Preload Coral, has no phase; the analysis calls that period `preMatch`.

So there are two ways to tell auto from teleop:

1. **Separate buttons**, as in 2025: `autol4` on the auto screen, `teleopl4` on the teleop
   screen. Counting each button is enough.
2. **One button** on both screens, `l4`, and the analysis counts it **by phase**.

Both work. Separate buttons are easiest to read in the configuration; one button means fewer
buttons and lets you add an endgame phase later without renaming anything.

## Analyzing one phase at a time

Two options of the analysis pipeline use the period ([The analysis pipeline](analysis-pipeline.md)
explains entries).

**Grouping** splits `countActions` by period with `"by"`. This entry counts every button, once
per phase:

```json
{
  "type": "tmp",
  "name": "countActions",
  "outputPath": "phaseCounts",
  "options": { "all": true, "by": "phase" }
}
```

It writes `phaseCounts.auto.l4`, `phaseCounts.teleop.l4`, and also `phaseCounts.preMatch.…` for
presses before the match, with every button starting at 0 in every phase.

**Filters** limit an entry to some periods. Any transformer that picks actions by button id
takes them:

| Filter       | Keeps actions recorded in…                                                       |
| ------------ | -------------------------------------------------------------------------------- |
| `"phases"`   | these phases, such as `["teleop"]`. `"preMatch"` means before the match started. |
| `"segments"` | these segments, such as `["shift"]` (2026).                                      |
| `"kinds"`    | these kinds, such as `["active"]` (2026).                                        |

In a game with one `l1`, `l2` and `l3` button for both phases, this entry counts only the
teleop presses:

```json
{
  "type": "tmp",
  "name": "countActions",
  "outputPath": "teleopCounts",
  "options": { "ids": ["l1", "l2", "l3"], "phases": ["teleop"] }
}
```

An action must pass every filter you give. Inside one filter, any listed value passes: `"phases":
["auto", "teleop"]` keeps both.

Filters on cycles work a little differently: a cycle is one pickup and the score after it, so a
filter keeps a cycle that **starts or ends** in the period. A piece picked up in auto and scored
in teleop counts for both. See [Cycles](analysis-pipeline.md#cycles).

## Segments

A **segment** is a smaller period inside a phase. 2026's teleop began with a 10-second
transition, followed by four 25-second shifts:

```json
    {
      "id": "teleop",
      "label": "Teleop",
      "startMs": 140000,
      "layer": "layer-7",
      "prefix": "teleop",
      "segments": [
        {
          "id": "transition",
          "label": "Teleop Transition",
          "startMs": 140000,
          "prefix": "teleopTransition",
          "kind": "active"
        },
        {
          "id": "shift",
          "label": "Shift",
          "startMs": 130000,
          "layer": "layer-2",
          "repeat": { "intervalMs": 25000, "count": 4 },
          "kinds": [ ... ],
          "alternate": true
        }
      ]
    },
```

A segment has an `"id"`, a `"label"`, a `"startMs"` (time remaining, like a phase, and inside its
phase) and optionally a `"layer"` to show when it begins. `"repeat"` makes it happen several times
in a row: here 4 shifts of 25,000 ms each. The clock numbers them 1 to 4: shift 1 runs from
130 to 105 seconds remaining, shift 2 from 105 to 80, and so on.

An action recorded in a segment knows its segment and, for a repeating segment, its number.

## Kinds

In 2026 each shift was either **active** (your hub scored) or **inactive**, and which one came
first depended on the match. The scouter told SPOT by pressing a toggle button. Those choices
are the segment's **kinds**:

```json
          "kinds": [
            { "id": "active", "label": "Active", "prefix": "activeShift", "toggleButton": "teleopActive" },
            { "id": "inactive", "label": "Inactive", "prefix": "inactiveShift", "toggleButton": "teleopInactive" }
          ],
          "alternate": true
```

- `"toggleButton"` is the button that selects the kind; give it `"type": "none"`.
- `"alternate": true` means the kinds take turns: the scouter selects a kind once, and at each
  new shift SPOT switches to the next kind by itself (active, inactive, active, inactive). If
  the scouter presses a toggle again, that kind holds from then on.

Each action in a shift records the kind selected when it was pressed.

### Fixed kinds

In 2026 the hub was active for **both** alliances in auto, during the transition and in endgame.
The configuration says so with `"kind": "active"` on the auto phase, the transition segment and
the endgame phase. Then `"kinds": ["active"]` means "whenever our hub was active", in one filter.

A fixed kind is a game rule for the analysis. Nothing is recorded differently, so if a fixed
kind is wrong you fix the configuration and the analysis of every match is right again. It must
be one of the kinds a segment declares, and a segment that has its own kinds can't also have a
fixed kind; `config:check` reports both mistakes.

### Grouping in a game with segments

| `"by"`      | One group per…                                                                                    | 2026 groups                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"phase"`   | phase                                                                                             | `preMatch`, `auto`, `teleop`, `endgame`                                                                                                             |
| `"segment"` | most specific period: the kind and shift number, or the segment, or the phase outside any segment | `preMatch`, `auto`, `teleop`, `transition`, `active1` … `active4`, `inactive1` … `inactive4`, `shift1` … `shift4` (no kind selected yet), `endgame` |
| `"kind"`    | kind, with fixed kinds counted in; the phase where no kind applies                                | `preMatch`, `active`, `inactive`, `teleop` (a shift before any kind was selected)                                                                   |

The 2026 configuration counts by segment, so its paths look like `counts.active1.StopShooting`:
the number of `StopShooting` presses in shift 1, if shift 1 was active. A shift number is always
the clock's: `active3` is the third 25-second shift, whichever kind came first.

## Prefixes

Every phase, segment and kind has a `"prefix"`. For a new game, leave every prefix `""`.

The 2026 configuration has prefixes because the version of SPOT that recorded 2026's matches
put the period in front of the button id (`activeShift1StopShooting`). The prefixes let SPOT
read that old data. Analysis never uses them.
