# Match scouting: `match-scouting.json`

This file is the scouting screen: which buttons a scouter sees, where, and what each one does.
It also sets the match timing and a few rules, such as how far back Undo can go.

The file has five sections:

```json
{
  "$schema": "../../../src/config/schema/match-scouting.schema.json",
  "version": 2,
  "timing": { ... },
  "variables": {},
  "rules": { ... },
  "layout": { ... },
  "extraActionIds": []
}
```

Leave `"$schema"` and `"version"` as they are. The examples in this chapter come from
`config/seasons/2025/match-scouting.json`; open it beside this chapter.

## Timing

```json
  "timing": {
    "totalMs": 153000,
    "phases": [
      { "id": "auto", "label": "Auto", "startMs": 152999, "layer": "layer-1", "prefix": "" },
      { "id": "teleop", "label": "Teleop", "startMs": 135000, "layer": "layer-2", "prefix": "" }
    ]
  },
```

All times in SPOT are in **milliseconds**: 1 second is `1000`, so 2 minutes 30 seconds is
`150000`. The names say so: `totalMs`, `startMs`.

- `"totalMs"` is how long the match clock runs, from the Start button to the end.
- The clock **counts down**, like the one on the field. Every other time in this file is "time
  remaining".
- `"phases"` are the periods the clock decides, in the order they happen. A phase begins when
  the time remaining reaches its `"startMs"`. In 2025, auto begins at 152,999 ms remaining,
  right after Start is pressed, and teleop begins at 135,000 ms remaining, 18 seconds later.

Each phase has:

| Name                                       | Meaning                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `"id"`                                     | The name the rest of the configuration uses, such as `"auto"`. Letters, digits, `_` and `-`.                                                     |
| `"label"`                                  | What the scouting screen shows.                                                                                                                  |
| `"startMs"`                                | When it begins, as time remaining.                                                                                                               |
| `"layer"`                                  | The screen of buttons to show when it begins. Leave it out to keep the current screen.                                                           |
| `"prefix"`                                 | Leave it `""` (empty). Only the 2026 configuration uses prefixes, to stay compatible with the data it recorded ([Periods](periods.md#prefixes)). |
| `"pauseMs"`                                | Optional: hold the match clock this long when the phase begins, for a pause on the field between auto and teleop.                                |
| `"variables"`, `"always"`, `"conditional"` | Optional: set variables, and show only some buttons, when the phase begins. See [Variables](#variables-and-buttons-that-depend-on-them).         |
| `"segments"`                               | Optional: smaller periods inside the phase, such as 2026's shifts. See [Periods](periods.md).                                                    |
| `"kind"`                                   | Optional, only in a game whose segments have kinds, like 2026: the kind this whole phase counts as. See [Periods](periods.md#fixed-kinds).       |

The analysis can look at each phase separately ("coral scored in auto"), so make the phases the
periods you want to analyze. 2025 has no endgame phase: climbing had its own buttons. If you
want endgame on its own, add a third phase, such as
`{ "id": "endgame", "label": "Endgame", "startMs": 30000, "prefix": "" }`. A phase does not
have to change the screen.

## Layout: layers and the grid

```json
  "layout": {
    "rows": 6,
    "columns": 9,
    "initialLayer": "layer-0",
    "layers": [
      { "id": "layer-0", "buttons": [ ... ] },
      { "id": "layer-1", "buttons": [ ... ] },
      ...
    ]
  }
```

- `"rows"` and `"columns"` size the grid of buttons. Every layer uses the same grid.
- A **layer** is one screen of buttons. `"initialLayer"` is the screen shown before the match
  starts.
- Each layer has an `"id"`, an optional `"name"` for your own notes, and its `"buttons"`.

Converted configurations number their layers `layer-0`, `layer-1`, and so on. You may rename a
layer to something easier to read, such as `"teleop-main"`, as long as you also change every
place that names it (phases, other layers' buttons, `"initialLayer"`). `config:check` reports
any name that no longer exists.

How 2025 moves between its screens:

```
layer-0  before the match: Start, Preload Coral, Preload None
   │ Start pressed, and auto begins
layer-1  auto: pickups, drops, Leave, A-Stop, and two buttons that open a scoring screen
   ├── Coral → layer-5: L4, L3, L2, L1, Miss → back to layer-1
   ├── Algae → layer-4: Score/Miss Processor, Score/Miss Net → back to layer-1
   ├── Pickup Ground (coral) → layer-7: which spot → back to layer-1
   └── Pickup Ground (algae) → layer-6: which spot → back to layer-1
   │ teleop begins (135 s remaining)
layer-2  teleop: pickups, drops, two scoring buttons, Barge
   ├── Coral → layer-9 → back to layer-2
   ├── Algae → layer-8 → back to layer-2
   └── Barge → layer-3: Park, Shallow Cage, Deep Cage, Fall
```

## Buttons

```json
{
  "id": "teleopl4",
  "type": "action",
  "gridArea": [3, 4, 4, 7],
  "executables": [{ "type": "layer", "to": "layer-2" }],
  "label": "L4",
  "color": "#ff69b4"
}
```

| Name            | Meaning                                                                                                                                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"id"`          | What SPOT records when the button is pressed, and how every other file refers to it. Letters, digits, `_` and `-`; capital letters matter (`teleopl4` and `teleopL4` are different).                                                                                                         |
| `"type"`        | What pressing it does; see [Button types](#button-types).                                                                                                                                                                                                                                    |
| `"gridArea"`    | Where it goes: `[row start, column start, row end, column end]`, counting the lines between cells. See [the picture in the tutorial](tutorial.md#3-find-the-teleop-buttons), or turn on **Show grid** in the [scouting-screen preview](checking-and-preview.md#the-scouting-screen-preview). |
| `"executables"` | What else happens when it is pressed, such as switching screens. `[]` for nothing. See [Executables](#executables-what-else-a-button-does).                                                                                                                                                  |
| `"label"`       | The text on the button.                                                                                                                                                                                                                                                                      |
| `"color"`       | Optional background color, as a web color code (`"#ff4436"` is red) or name (`"orange"`).                                                                                                                                                                                                    |
| `"textColor"`   | Optional text color.                                                                                                                                                                                                                                                                         |
| `"legacyClass"` | Left by the converter so someone can check the colors it picked; you may delete it.                                                                                                                                                                                                          |

A button with the same id on several layers is the same button. 2025 has `broken`
("Disabled") on almost every layer, so a scouter can record a disabled robot whatever screen is
showing, and the analysis counts all those presses together.

### Button types

| `"type"`          | Pressing it…                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"action"`        | records an action: the button's id and the time remaining. This is almost every button.                                                                              |
| `"undo"`          | removes the last recorded action and undoes what its button did, such as switching screens. See [Undo](#undo).                                                       |
| `"none"`          | records nothing, but runs the button's executables. Use it for a button that only opens another screen, such as 2025's auto "Coral" button, or 2026's shift toggles. |
| `"match-control"` | starts the match. During the match it shows the clock, and when the match is over it ends it. Every layer has one.                                                   |
| `"label"`         | nothing: it is text on the screen, such as 2025's "Reef" heading.                                                                                                    |

Only `"action"` buttons are counted by the analysis.

### Naming buttons in a typical game

In 2025 the same game piece could be scored in auto and in teleop, and the configuration used a
separate button for each: `autol4` on the auto screen, `teleopl4` on the teleop screen. That
keeps the ids readable and lets the analysis count them apart. You can also use one button,
`l4`, on both screens: every action records the phase it happened in, and the analysis can
count by phase. See [Periods](periods.md).

## Executables: what else a button does

Each item in `"executables"` is one thing that happens when the button is pressed, in order.
When the scouter presses Undo, each one is reversed.

| Executable                                                                                   | What it does                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ "type": "layer", "to": "layer-5" }`                                                       | Switch to another screen. Undo switches back.                                                                                                                                                                                                                                                                     |
| `{ "type": "conditionalLayer", "to": "layer-3", "always": [ ... ], "conditional": { ... } }` | Switch to a screen, but show only some of its buttons, depending on [variables](#variables-and-buttons-that-depend-on-them).                                                                                                                                                                                      |
| `{ "type": "setVariable", "name": "heldPiece", "value": "cone" }`                            | Remember something, such as which game piece the robot holds. Undo restores the old value.                                                                                                                                                                                                                        |
| `{ "type": "position" }`                                                                     | Ask the scouter to tap where on the field it happened (the picture in `rules.fieldMap`), and store the spot with the action. The heatmap module draws these spots. Within `rules.positionLockMs` of the last tap, the same spot is reused without asking again; `"lockMs"` sets a different time for this button. |
| `{ "type": "constantPosition", "position": { "x": 50, "y": 20 } }`                           | Store a fixed spot with the action, without asking. `x` and `y` are percentages of the field picture, from its top-left corner.                                                                                                                                                                                   |
| `{ "type": "exclusiveHighlight", "group": "climb" }`                                         | Highlight this button and remove the highlight from every other button in the same group, such as the climb level the robot reached.                                                                                                                                                                              |
| `{ "type": "clearHighlight" }`                                                               | Remove this button's highlight.                                                                                                                                                                                                                                                                                   |
| `{ "type": "hide" }`                                                                         | Hide the button once pressed, for something that happens once per match. Undo shows it again.                                                                                                                                                                                                                     |
| `{ "type": "multiplier", "count": 2 }`                                                       | Record the action `count` times with one press, such as "scored two at once".                                                                                                                                                                                                                                     |

A programmer can add new executables ([Writing an extension executable](../extension-executables.md)).
One is written like a built-in, with its own fields, such as `{ "type": "pressLimit", "max": 3 }`.
`npm run config:check` reports a type that is neither in the list above nor added by a
programmer, and fields the executable does not accept.

## Variables, and buttons that depend on them

Most games need no variables. They are for a screen that should show different buttons in
different situations. In 2023, a robot carried either a cone or a cube, and the grid screen
showed only the spots that piece could go (`config/v1/match-scouting-2023.json`):

- `"variables"` at the top of the file gives each variable its starting value:
  `{ "heldPiece": "none" }`.
- A pickup button runs `{ "type": "setVariable", "name": "heldPiece", "value": "cone" }`.
- A button that opens the grid screen runs a `conditionalLayer`. Its `"always"` lists the
  buttons that always show, and its `"conditional"` says which buttons show for which value of
  which variable (shortened here):

  ```json
  {
    "type": "conditionalLayer",
    "to": "layer-1",
    "always": ["chargingDock", "broken", "startGame", "undo"],
    "conditional": {
      "heldPiece": {
        "cone": ["placement31", "placement33", "placement21"],
        "cube": ["placement32", "placement35", "placement22"]
      }
    }
  }
  ```

A phase can do the same when it begins, with its own `"variables"`, `"always"` and
`"conditional"`. `config:check` warns about a variable that nothing sets.

## Rules

```json
  "rules": {
    "undo": { "minQueueLength": 2 },
    "positionLockMs": 1000,
    "locks": [ ... ],
    "allianceRelativeButtons": [],
    "fieldMap": { "image": "/img/field.svg" }
  },
```

### Undo

`"minQueueLength"` protects the start of the match: Undo does nothing while the scouter has
recorded this many actions or fewer. 2025 and 2026 use 2.

### Position lock

`"positionLockMs"`: after the scouter taps the field, another button with a `position`
executable pressed within this many milliseconds reuses the same spot instead of asking again,
because the robot has not had time to move. 1000 is one second.

### Locks

A lock disables buttons until a phase begins. 2025's A-Stop button (the driver stopped the
robot during auto) locks every button but Undo and Start until teleop:

```json
    "locks": [
      {
        "id": "aStop",
        "triggerButtons": ["aStop"],
        "untilPhase": "teleop",
        "exemptTypes": ["undo", "match-control"],
        "message": "You pressed the A-Stop button, all the buttons will be disabled until Auto ends. If this is a mistake then press the Undo button"
      }
    ],
```

- `"triggerButtons"`: the buttons that engage the lock.
- `"untilPhase"`: the phase whose start releases it. Undoing the trigger releases it too.
- `"exemptTypes"`: button types that keep working.
- `"message"`: what the scouter sees while it is engaged.

### Buttons that swap sides

`"allianceRelativeButtons"` lists pairs of buttons that trade places when the scouted robot is
on the blue alliance, so the screen matches the field as the scouter sees it from the stands.
What is recorded stays relative to the robot's own alliance. 2026 used it for the alliance
zones:

```json
    "allianceRelativeButtons": [{ "own": "AZone", "opposing": "OAZone" }],
```

### Field map

`"fieldMap"` → `"image"` is the picture of the field a scouter taps for a `position`
executable. The path is inside the `public/` folder: `/img/field.svg` is
`public/img/field.svg`.

## Extra action ids

`"extraActionIds"` lists ids that recorded data can contain although no button on the screen
records them. A new game usually needs none; leave it `[]`. The 2026 file keeps a few from the
old configuration it was converted from.

## QR codes

When there is no network, a scouter's tablet shows the match as a QR code for an admin to
scan. There is nothing to set for it: SPOT works out how to pack a match from this file, from
its buttons, its phases and segments, and the match length. `config:check` sends made-up matches
through a QR code and back, and tells you if something the screen records could not go in one.

A code made with one configuration cannot be read with another: if you add, remove or rename a
button or a period during an event, scan any codes made before the change first. (Moving
buttons around the screen is fine.) A folder that still has a `qr.json` from an older SPOT can
delete it; nothing reads it.

## Check your work

After any change to this file, run `npm run config:check`. Besides the JSON itself, it checks
that every layer, button and phase a setting names exists, that phases and segments are in
order and inside the match, that buttons don't overlap or fall outside the grid, and that every
layer can be reached. See [Checking and previewing](checking-and-preview.md).
