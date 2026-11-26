# 20 — Configuration schema v2

Phase 0 step 4 of document 17. This document records the design of the v2 configuration
files, what changed from v1 (document 04) and why, how the v1 → v2 converter maps legacy
files, and what the tests guarantee. The JSON Schemas themselves are the source of truth:

| File                                              | Validates                       | Types                    |
| ------------------------------------------------- | ------------------------------- | ------------------------ |
| `src/config/schema/match-scouting.schema.json`    | `config/match-scouting.json`    | `MatchScoutingConfig`    |
| `src/config/schema/analysis-pipeline.schema.json` | `config/analysis-pipeline.json` | `AnalysisPipelineConfig` |
| `src/config/schema/analysis-modules.schema.json`  | `config/analysis-modules.json`  | `AnalysisModulesConfig`  |

Types live in `src/config/types.ts`; validation in `src/config/validate.ts` (Ajv, draft
2020-12, strict mode, unknown-property and missing-property messages with dotted paths);
known-action-id derivation in `src/config/knownActionIds.ts`; the converter in
`src/config/convert/v1-to-v2.ts` with the CLI `npm run config:convert`.

All schemas are draft 2020-12, use `additionalProperties: false` everywhere a built-in
structure is described, and every file carries `"$schema"` (editor autocomplete, answer A-51
and the "students without programming experience" principle) and `"version": 2`.

## 1. Design decisions

| Id    | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Source                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| CS-1  | **All times are milliseconds** and the keys say so (`totalMs`, `startMs`, `pauseMs`, `intervalMs`, `positionLockMs`). The schema rejects `totalMs < 10000`, which catches the v1 template's seconds.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | A-40, CF-5                                       |
| CS-2  | **Phases are a list, not a map keyed by time strings, and they are the periods analysis filters on**: auto, teleop, endgame. Each phase has `id`, `label`, `startMs`, optional `layer`, `prefix`, optional `pauseMs`, optional `segments`, optional `variables`/`always`/`conditional` (2023 transition semantics kept).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | CF-5, BL-298                                     |
| CS-3  | **Composite ids stay**: the recorded id is prefix + button id, exactly as SC-23, with the prefix written on each phase and segment instead of being re-derived from `displayText` at runtime. There is no separate on/off switch: every season before 2026 recorded raw button ids, which is expressed by leaving the prefixes empty. One place to look, and no way for a flag and a prefix to contradict each other. **Superseded 2026-11-19 by CS-16**: the prefix still names the period in the configuration, but analysis and storage no longer use the composite id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | A-22, SC-23                                      |
| CS-4  | **Sub-periods of a phase are `segments`**, not top-level objects: `phase.segments[] {id, startMs, layer?, prefix?, repeat?{intervalMs, count}, kinds?[{id, prefix, toggleButton}], alternate?, kind?}`. The 2026 teleop transition is a segment; the four shifts are one repeating segment with two scouter-selected kinds that alternate at each shift. Endgame is a phase, not a segment (§2.1). A phase or a segment without kinds may name a fixed `kind` it counts as in analysis (decided 2026-11-19, #326).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | SC-22, A-24                                      |
| CS-5  | **Known action ids are derived**, never listed: `(phase prefixes ∪ segment prefixes, each kind × each repeat index ∪ "") × action-button ids ∪ extraActionIds`. The hidden catalog layer is gone. `extraActionIds` exists only for ids that data can contain but the grid cannot produce (TBA synthetic ids, hand-typed legacy ids). After CS-16 the derived composite list serves only the migration, the legacy export and the oracle, and since #315 TBA ids belong in `enrichment.tba.knownIds` (DM-11b), so `extraActionIds` is left for legacy ids the migration must explain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | CF-9, A-23, F-4                                  |
| CS-6  | **Layers have ids** and executables reference them by id (`{type:"layer", to:"layer-2"}`) instead of by index, so inserting a layer no longer renumbers every executable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | doc 05 executables (`layer` by index)            |
| CS-7  | **Executables are objects with named fields**, one shape per type, validated by type; unknown types are allowed as extension executables, whose other fields are their options (`{"type": "pressLimit", "max": 3}`), checked by config:check against the extension's own schema (#362). `climbHighlight` became `exclusiveHighlight {group}` because v1 ignored its arguments.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | CF-7, doc 05 executables                         |
| CS-8  | **Buttons carry `color`/`textColor`** (CSS colors); `legacyClass` is kept by the converter for review and can be deleted by hand. Classes `timer`, `border`, `button-padding`, `largeAction` are layout helpers, not colors, and are dropped.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | A-51, CF-9b                                      |
| CS-9  | **Client rules are in `rules`**: `undo.minQueueLength` (was `variables.minOfQueueLength`), `positionLockMs` (was hard-coded 1 s), `locks[]` (the A-Stop lock generalized: trigger buttons, lock until a phase, exempt button types, message), `allianceRelativeButtons[]` (was the `AZone`/`OAZone` special case), `fieldMap.image`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | CF-8, CF-9c, SC-24..26, BL-60                    |
| CS-10 | **Pipeline entries are unchanged in spirit** (`type`, `name`, `outputPath`, `options`) but each built-in transformer's options are a closed schema, so a typo such as `actionArrayPaths` or `divByZero` at the top level is an error, not silently ignored. The schema accepts any options for an extension transformer, whose name it cannot know; the registry checks them against the schema the extension declares (docs/spec/09 TR-14).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | AN-10, F-25, 09 catalog                          |
| CS-11 | **One spelling per option**: `finalActionOccurrence`, `cycle.startAction/endAction`, `actionTime.actionId`. The converter rewrites the v1 spellings and warns.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 09 catalog, guide typos                          |
| CS-12 | **TBA enrichment is configuration** (`enrichment.tba.scoreBreakdown {enabled, prefixes, knownIds}` and `componentOprs[]`), replacing `TBA_OPR_STRINGS` in `config.json` and the hard-coded `auto`/`endGame` prefix scan. **Decided 2026-11-20 (#315):** each prefix names the phase its actions belong to (`{ "prefix": "endGame", "phase": "endgame" }`), and `knownIds` lists score-breakdown ids that `countActions(all)` starts at 0 besides those TBA reports at the event (DM-11a, DM-11b).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | AN-7, AN-8, A-14                                 |
| CS-13 | **Module options are closed schemas per built-in module**; `HeatmapScatterPlot.coordinateTransform` (`none`/`foldHalfField`) makes the 2026 half-field folding explicit; `filterTeams.ratingBands` replaces the hard-coded Filter Teams bands.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | AN-19, AN-21, F-12, A-33                         |
| CS-14 | **QR ids are indexes into the derived known-id list**; the converter widens `id` to 16 bits because the 2026 set has 504 ids (v1 had 8 bits and 195 catalog ids). Because the index depends on the configuration, the payload header carries a 16-bit fingerprint of the derived list and the scanner refuses a mismatch (DM-15a, decided 2026-09-17). **Revised 2026-11-19 by CS-16**: an action is encoded as a button index plus its period, not an index into the composite list (Phase 2). **Built 2026-11-24 (#358)**: the layout is derived from match-scouting.json and `qr.json` is gone; the fingerprint is taken over the derived layout (document 03 DM-15d).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | DM-12, DM-15d                                    |
| CS-15 | **No settings file in v2.** Server settings and secrets are environment variables (`.env.example`); event selection is data. The planned "settings document" from document 17 is therefore not a JSON file and needs no schema.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | ADR 0003, R-32, A-32                             |
| CS-16 | **Analysis sees button ids, not composite ids** (decided 2026-11-19). The pipeline receives each action as stored: `id` is the button id, with `phase`, `segment`, `segmentKind` and `segmentIndex` beside it. Per-period analysis is transformer options (filters and grouping), not ids that spell the period. Composite ids remain only in the v5 → v6 migration, the legacy export and the 2026 oracle comparison. See §2.2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | maintainer, §2.2                                 |
| CS-17 | **The application reads the configuration from disk, on the server** (decided 2026-11-22, #322). `src/config/load.ts` reads a season's files when a page is requested; they are never bundled into client code, so a saved change shows on the next load with no rebuild or restart. A season is `config/` (named `active`) or a folder under `config/seasons/` that has a `match-scouting.json`. A page names a season, never a path, and the loader opens only names it listed. Each file has a version, a hash of its text. Pages that must work offline (the scouting client, the analysis and scanner pages) get the files from a JSON route that carries the version and sends it as the `ETag` with `Cache-Control: no-cache`, so the browser revalidates on every online load and the device keeps its copy for offline use (OF-5, OF-8; the scouting client keeps it in its own storage, #361). **Built 2026-11-24 (#359)**: `GET /api/config/match-scouting` returns `{ version, config }` for the active season, answers 304 to a matching `If-None-Match`, and refuses a file with errors (503) so devices keep the copy they have. The analysis page's routes, `GET /api/config/analysis-pipeline` and `/api/config/analysis-modules`, are built (#382): each is refused only when it can't be used at all, and otherwise carries what config:check finds in it (`src/config/serve.ts`). The three routes take `?season=<name>`, and the analysis dashboard reads each event with the season named for its year, or the active one when there is none (#383). The scanner's comes in Phase 4. The scouting-screen preview, which need not work offline, receives `match-scouting.json` from its server component. | document 15, document 18 OF-5 and OF-8, ADR 0003 |

Decided since, outside the schema: start rules for entering a match (ADR 0006, BL-34), the
manual schedule (kept, D-4), the extension contract (ADR 0005, docs/spec/09 TR-14) and the data
model v2 (document 21). None of them needed a configuration field.

## 2. `match-scouting.json` v2 at a glance

```jsonc
{
  "$schema": "../src/config/schema/match-scouting.schema.json",
  "version": 2,
  "timing": {
    "totalMs": 160000,
    "phases": [
      { "id": "auto", "label": "Auto", "startMs": 159999, "layer": "layer-1", "prefix": "auto" },
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
            "kind": "active",
          },
          {
            "id": "shift",
            "label": "Shift",
            "startMs": 130000,
            "layer": "layer-2",
            "repeat": { "intervalMs": 25000, "count": 4 },
            "kinds": [
              { "id": "active", "prefix": "activeShift", "toggleButton": "teleopActive" },
              { "id": "inactive", "prefix": "inactiveShift", "toggleButton": "teleopInactive" },
            ],
            "alternate": true,
          },
        ],
      },
      {
        "id": "endgame",
        "label": "Endgame",
        "startMs": 30000,
        "prefix": "endgame",
        "kind": "active",
      },
    ],
  },
  "variables": {},
  "rules": {
    "undo": { "minQueueLength": 2 },
    "positionLockMs": 1000,
    "locks": [
      {
        "id": "aStop",
        "triggerButtons": ["aStop"],
        "untilPhase": "teleop",
        "exemptTypes": ["undo", "match-control"],
        "message": "You pressed the A-Stop button…",
      },
    ],
    "allianceRelativeButtons": [{ "own": "AZone", "opposing": "OAZone" }],
    "fieldMap": { "image": "/img/field.svg" },
  },
  "layout": {
    "rows": 6,
    "columns": 12,
    "initialLayer": "layer-0",
    "layers": [
      {
        "id": "layer-0",
        "buttons": [
          {
            "id": "startGame",
            "label": "Start Match",
            "type": "match-control",
            "gridArea": [1, 1, 3, 13],
            "color": "#919191",
            "legacyClass": "silver",
            "executables": [{ "type": "layer", "to": "layer-1" }],
          },
        ],
      },
    ],
  },
  "extraActionIds": ["autoTowerRobot_Level1", "endGameTowerRobot_Level1", "…"],
}
```

Semantics the client must implement from this (document 05 stays the behavioral reference):

- The phase whose `startMs` is the largest value ≤ time remaining is current; entering a phase
  switches to its `layer` (if given), applies its `variables`, and holds the clock `pauseMs`.
- Within the current phase, the active segment is the one whose `startMs` is the largest value
  ≤ time remaining; a repeating segment's index is `floor((segment.startMs - remaining) /
repeat.intervalMs) + 1`, capped at `repeat.count`. A segment may switch `layer` too.
- The recorded id is `prefix + button.id`, where the prefix is the selected kind's prefix plus
  the repeat index (`activeShift2`) if the scouter has toggled a kind, else the segment's own
  `prefix` (`teleopTransition`), else the phase's `prefix` (`teleop`, `endgame`). Pre-match
  (before start) the prefix is `""`. A config whose prefixes are all empty records raw button
  ids, which is what every season before 2026 did.
- In a segment with `alternate: true`, the scouter selects a kind once; at each repeat boundary
  of the field clock the selection moves to the next kind (2026: active, inactive, active, ...).
  Pressing a kind's toggle again selects that kind from then on. v5 flipped 25 s after the press
  instead of at the clock's boundaries, so a late press made every later flip late (SC-22,
  decided 2026-11-20, #326).
- A fixed `kind` on a phase, or on a segment without kinds, is a game rule for analysis: it is
  never recorded on actions. 2026 fixes `"active"` for auto, the transition and endgame, when the
  hub was active for both alliances (#326).
- A `lock` engages when any trigger button is pressed while the lock's `untilPhase` has not
  started, disables every button whose type is not in `exemptTypes`, shows `message`, and
  releases when `untilPhase` begins or the trigger is undone.
- `allianceRelativeButtons` swap `own`/`opposing` grid positions for the blue alliance.

### 2.1 Why endgame is a phase and shifts are segments

Analysis asks for auto only, teleop only, endgame only, and sometimes teleop including endgame
(maintainer, 2026-09-17). Phases are therefore exactly the periods analysis filters on, and
endgame is a phase even in seasons where it changes no layer, which most seasons will.
Everything finer-grained lives inside a phase as a segment:

| Concept | Chosen by                   | Repeats | Switches layer | Contributes a prefix               |
| ------- | --------------------------- | ------- | -------------- | ---------------------------------- |
| Phase   | the clock                   | no      | usually        | `auto`, `teleop`, `endgame`        |
| Segment | the clock, then the scouter | yes     | may            | `teleopTransition`, `activeShift2` |

The 2026 season reads as three phases: auto, then teleop (a transition period followed by four
25 s shifts the scouter marks active or inactive), then endgame. The shifts cannot be phases
because they repeat with an index and because which one applies depends on a scouter toggle,
not only on the clock. The transition period could have been a phase, but it is part of teleop
for analysis, so it is a segment.

**Data-model consequence (Phase 0 step 5, document 03).** Because analysis wants to filter by
period, each recorded action should carry `phase` and `segment` fields alongside its `id`, not
only the composite id:

```jsonc
{ "id": "Storing", "ts": 118400, "phase": "teleop", "segment": "activeShift2" }
```

`countActions` and the other transformers then take period filters and grouping, so
"Storing during teleop" is one line of configuration instead of the eleven composite ids that
forced the v1 catalog layer. The v5 → v6 migration splits existing ids such as
`teleopTransitionStoring` back into fields using the prefix derivation. The transformer options
are **not** in the v2 pipeline schema yet: they land with the engine in Phase 1, so that a
configuration cannot name a filter the engine ignores (F-10). Section 2.2 settles what the
pipeline sees.

### 2.2 Analysis sees button ids, not composite ids (CS-16, decided 2026-11-19)

**How 2026 produced composite ids.** The layout's buttons had plain ids (`StopShooting`,
`RatingPassing3`). At each press the 2026 client camel-cased the on-screen period label and put
it in front (SC-23): "Auto" gives `autoStopShooting`, "Active Shift 1" gives
`activeShift1StopShooting`. The shift rules were constants in client code (SC-22, F-19), and
because the QR encoder and analysis needed every id in advance, the configuration carried a
hidden twelfth layer listing 195 composite ids, which real data still outgrew (F-4).

**What is sound and what is not.** Per-period analysis is a need in every game. Encoding the
period into a string, and then making the configuration spell out every combination, is not:

- "Shooting at any time" was a `sum` of seven composite counts, one per period.
- Ratings needed one path per phase, metric and value (`counts.autoRatingPassing1` …).
- `actionTime { actionId: ["attemptClimb"] }` never matched, because the data held
  `endgameAttemptClimb` and `teleopTransitionAttemptClimb`; `actionTimes.attemptClimb` is null
  for all 413 performances in the 2026 golden output, and nothing reported it.

2025, a typical game, had no prefixes: buttons were separate per phase (`autol1`, `teleopl1`) and
a composite id was simply the button id.

**Decision.**

1. The pipeline sees actions as stored (document 21, DV-1): `id` is the button id, and the
   period is data (`phase`, `segment`, `segmentKind`, `segmentIndex`). v6 field names are used
   throughout (`team`, `submittedAt`, `actions`).
2. Per-period analysis is expressed with transformer options (named 2026-11-19, #311):
   - **Filters**, on every transformer that picks actions by id: `phases`, `segments`,
     `kinds`, each a list of configuration ids. An action must pass every filter given;
     within one filter, any listed id matches. `"preMatch"` selects actions recorded before the
     match started. `kinds` matches an action's **effective kind** (decided 2026-11-19, built
     in #326): the kind the scouter selected, else a kind the configuration fixes for the
     action's segment or phase. In 2026 the hub is active for both alliances in auto, the
     transition and endgame, so those periods are configured `"kind": "active"` and
     `kinds: ["active"]` means "while our hub was active", in one entry.
   - **Grouping**, on `countActions`: `by: "phase"` gives one count object per phase
     (`counts.auto.l4`, `counts.teleop.l4`, `counts.preMatch.l4`), the usual need.
     `by: "segment"` gives the most specific period: the selected kind or else the segment,
     followed by the repeat index when the segment repeats (`counts.active1.StopShooting`,
     `counts.shift3.…` while no kind is selected, `counts.transition.…`), and the phase id
     outside any segment. `by: "kind"` gives one count object per effective kind
     (`counts.active.StopShooting`, `counts.inactive.StopShooting`), with the phase id where no
     kind applies (`counts.teleop.…` while no kind is selected) and `preMatch` (#326). Keys come
     from configuration ids, never prefixes; ids that would give two periods one key are an
     error, and `preMatch` is reserved. `by: "segment"` is not affected by fixed kinds:
     `counts.transition.…` stays the transition.
3. Composite ids survive in three places only: the v5 → v6 migration, which splits them; the
   legacy export (`toLegacyPerformance`), which rebuilds them for the legacy pipeline; and the
   2026 oracle comparison.
4. Configurations without prefixes, like 2025, are unaffected and compare with the oracle
   directly. Most games are expected to have phases and no segments; then every action still
   carries its `phase` (placed by the clock, with or without a prefix) and its segment fields
   are `null`. Grouping by phase gives `counts.auto.<button>`, `counts.teleop.<button>`,
   `counts.endgame.<button>`, so the same button can serve several phases. Separate buttons per
   phase, as in 2025, keep working too. Segments matter only in a game shaped like 2026.
5. The 2026 configuration is history. The converter rewrites its pipeline and module paths that
   name composite ids into the native form, and the 2026 oracle comparison maps output paths
   through a translation table **generated from the configuration's own prefixes**, never written
   by hand. It moves to `config/seasons/2026/` at kickoff. Done in #320
   (`src/config/convert/native.ts`, `tools/oracle/translate.ts`); the native form is:
   - `countActions(all)` groups by period (`by: "segment"`), and a path into its output names the
     period, then the button: `counts.autoRatingPassing1` is `counts.auto.RatingPassing1`, and
     `counts.activeShift1Defense` is `counts.active1.Defense`. A team `average` of such a count is
     grouped the same way (`averages.auto.Passing`).
   - A TBA score-breakdown id keeps its name, under the phase its prefix belongs to
     (`counts.endgame.endGameTowerRobot_Level3`). A button recorded before the match had no prefix;
     its count is under `preMatch` (`counts.preMatch.preloadFuel`).
   - An id list names button ids plus the simplest period filter covering the periods its
     composite ids named: `autoStartShooting` becomes `StartShooting` with `phases: ["auto"]`.
     A filter cannot name repeat indexes or leave out part of a phase, so it may admit more than
     v5's list did; the converter warns with the periods it adds (for shooting this is F-26).
   - In an alternating segment v5 numbered a kind's shifts per kind (`activeShift1` is the first
     active shift), while v6 records the clock slot (#326). So a v5 shift number reads every slot
     that shift can be in: `counts.activeShift1Defense` becomes `counts.active1.Defense` and
     `counts.active2.Defense` in a list of addends or weights, which sums to what v5 counted when
     the kinds alternate from the first shift. The converter warns where it does this.
   - A heatmap action group takes the same period filters, and its labels are per button.
   - Anything that is not a prefix plus a button stays as written, so a v5 mistake stays visible:
     `attemptClimb` (the button is `AttemptClimb`) and the module path `counts.endgameFall` (the
     button is `fall`). config:check reports both (§4).
6. The QR payload encodes a button index plus the action's period instead of an index into the
   composite list (CS-14 revised; built in #358, document 03 DM-15d).

## 3. Converter (`src/config/convert/v1-to-v2.ts`)

| v1                                                                                                | v2                                                                                                                                                                                                                                                            | Notes                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timing.totalTime`                                                                                | `timing.totalMs`                                                                                                                                                                                                                                              | warns if it looks like seconds                                                                                                                                                                                          |
| `timing.timeTransitions["130000"] {layer, displayText, …}`                                        | `timing.phases[] {id: camelCase(displayText), label, startMs, layer: "layer-N", prefix}`                                                                                                                                                                      | prefix = camelCase(label), or `""` for a pre-2026 config; no transitions → one `match` phase                                                                                                                            |
| transitions whose label contains "teleop" (only when shift buttons exist)                         | one `teleop` phase starting at the earliest of them; the others become `segments`                                                                                                                                                                             | phase id/prefix/label come from the **last** one, so bare `teleop*` ids still resolve                                                                                                                                   |
| catalog layer (never navigated to, ≥ 20 buttons, exactly one)                                     | removed; ids not reproduced by derivation → `extraActionIds`                                                                                                                                                                                                  | 2026: 195 catalog ids, 10 kept                                                                                                                                                                                          |
| `variables.minOfQueueLength`                                                                      | `rules.undo.minQueueLength`                                                                                                                                                                                                                                   | default 1 with a warning when absent                                                                                                                                                                                    |
| buttons containing `astop`                                                                        | `rules.locks[0]` until the phase after the first                                                                                                                                                                                                              | message copied from the v5 client                                                                                                                                                                                       |
| `AZone`/`OAZone`                                                                                  | `rules.allianceRelativeButtons`                                                                                                                                                                                                                               |                                                                                                                                                                                                                         |
| `teleopActive`/`teleopInactive` present                                                           | a repeating `shift` segment (25 s, two kinds, `alternate: true` as v5's client flipped them) plus an `endgame` phase at 30 s with no layer; every other period gets `"kind": "active"` (2026: the hub was active for both alliances outside the shifts, #326) | count derived from the endgame boundary; v5 constants and a 2026 game rule, **verify per season**                                                                                                                       |
| `class: "red timer"`                                                                              | `color: "#ff4436"`, `legacyClass` kept                                                                                                                                                                                                                        | map in `legacy-colors.ts`; unknown classes warn                                                                                                                                                                         |
| executables `{type, args}`                                                                        | typed objects; layer indexes → `layer-N` ids; `climbHighlight` → `exclusiveHighlight`; `flashBorder`/`example` dropped                                                                                                                                        | unknown types kept as custom `{type, args}`                                                                                                                                                                             |
| empty button ids                                                                                  | `"<type>-<layer>-<index>"`                                                                                                                                                                                                                                    |                                                                                                                                                                                                                         |
| pipeline `finalActionOccurence`, `cycle.pickups/scores`, `actionTime.path`, top-level `divByZero` | `finalActionOccurrence`, `startAction/endAction`, `actionId`, `options.divByZero`                                                                                                                                                                             | each rename warns                                                                                                                                                                                                       |
| a path option `actionQueue` (`aggregateArray`)                                                    | `actions` (docs/spec/21 DV-11)                                                                                                                                                                                                                                | warns (#317)                                                                                                                                                                                                            |
| ids and paths with period prefixes (a configuration whose phases or segments have prefixes, 2026) | button ids with a period filter; `countActions(all)` with `by: "segment"`; count paths split into period and button (`counts.auto.RatingPassing1`), TBA ids under their phase, unprefixed ids under `preMatch`; heatmap groups with period filters            | §2.2 item 5 (#320); warns with the periods a filter adds; the modules need the v1 pipeline too; a v5 shift number of an alternating segment reads every clock slot it can be in (`activeShift1` → `active1`, `active2`) |
| `sumAverage` groups without `countPaths`                                                          | `countPaths` written out from v5's name inference over the v1 button ids (needs the v1 match-scouting file)                                                                                                                                                   | warns per group (A-39)                                                                                                                                                                                                  |
| pipeline `removeDuplicates`; team `countHybrid`                                                   | dropped: analysis never sees a superseded performance (RT-14a, docs/spec/09 TR-5); v1's team `countHybrid` did nothing                                                                                                                                        | warns per entry (#314)                                                                                                                                                                                                  |
| `zoneActionRatingGroupings.ratings` as a list of ids                                              | a map `{ id: value }`, the value read from the digits at the end of each id as v5 did                                                                                                                                                                         | warns; ids without digits are listed (#314)                                                                                                                                                                             |
| `actionTimeFilter.default`                                                                        | dropped; v5 never applied it                                                                                                                                                                                                                                  | warns (#314)                                                                                                                                                                                                            |
| `config.json` `TBA_OPR_STRINGS`                                                                   | `enrichment.tba.componentOprs` (pass `--opr-strings`)                                                                                                                                                                                                         | score-breakdown prefixes default to `auto`, `endGame`                                                                                                                                                                   |
| score-breakdown prefixes; ids in the hidden catalog layer of the form `<key>_<value>`             | `prefixes` with phases: `auto` → the `auto` phase, `endGame` → the `endgame` phase or else the last phase; those ids → `knownIds`                                                                                                                             | warns when there is no endgame phase or no v1 match-scouting file (#315)                                                                                                                                                |
| modules unchanged; `HeatmapScatterPlot`                                                           | `coordinateTransform` set from `imgPath` (`half-field` → `foldHalfField`)                                                                                                                                                                                     | `filterTeams.ratingBands` seeded with the v5 hard-coded bands                                                                                                                                                           |
| `qr.ACTION_SCHEMA`                                                                                | not converted: v2 derives the QR layout (#358)                                                                                                                                                                                                                |                                                                                                                                                                                                                         |

Usage:

```sh
npm run config:convert -- config/v1 <out dir> [--match-scouting f] [--pipeline f] [--modules f]
                          [--prefixing phase|none] [--opr-strings '<json>'] [--no-enrichment]
# --prefixing overrides the auto-detection: "phase" writes phase/segment prefixes, "none" leaves them empty.
```

The CLI writes the three files, prints every warning, validates the outputs, and exits 1 if any
is invalid. The active `config/*.json` were produced with the 2026 OPR strings fixture (see
`config/README.md`), and `config/seasons/2025/` holds the converted 2025 set as a
typical-season example and as an oracle input (`config/seasons/README.md`). Its pipeline comes
from `analysis-pipeline-2025-v4.2.0.json`, the pipeline tag `v4.2.0` shipped and the one that
produced the 2025 golden output; `2025v2`'s pipeline, recreated in February 2026, differs from it
(found 2026-11-19, #310).

Converting 2025 is the useful counterpoint to 2026. It produces **no warnings** for
`match-scouting`: there is no catalog layer to remove and no client constant to guess. The
result is two phases with empty prefixes and no segments, so recorded ids are raw button ids.
2025 instead wrote the period into the button id by hand (`teleopGroundPickupCoral`), which is
what prefixes replaced in 2026, and it has no endgame period at all: climb and park were
distinguished by button, not by time. A 2025-style season that wanted endgame analysis would add
a third phase at 30000 ms and leave its prefix empty: since CS-16 a prefix only rebuilds v5
composite ids for the migration, the legacy export and the oracle, and analysis groups by the
phase id instead (`counts.endgame.<button>`).

## 4. Checking a configuration: `npm run config:check` (#317, gate K-2)

```sh
npm run config:check                           # the active configuration in config/
npm run config:check -- config/seasons/2025    # another season's folder
npm run config:check -- <folder> --json        # the report as JSON, for tools
```

The exit code is 1 when there are errors; warnings alone exit 0. Each finding starts with
`file:line:column`, which VS Code's terminal opens on a click, then says where in the file's own
terms (`entry 6 (tmp actionTime → actionTimes.attemptClimb) › options.actionId`,
`layer "layer-3" › button "undo" › gridArea`), what is wrong, and what to try. The check is
`src/config/check/`, pure TypeScript with no file access, so a page can run it too;
`scripts/config-check.ts` reads the folder.

- **CC-1 Reading.** A missing file or a JSON syntax error is reported with its line and a hint
  for the usual mistakes: a comma after the last item, a comment, single quotes, a missing comma,
  a file that ends too early. A v1 file is told to run the converter.
- **CC-2 Schema messages.** Every file is validated against its schema, with messages in plain
  words: an unknown property suggests the property meant (`unknown property "mises"; did you
mean "misses"?`), unless the object already has it; a value that fails every alternative of an
  `anyOf` is reported against the alternative it was meant for (an executable with
  `"type": "layer"` gets the `layer` messages, not one per executable type); a list of required
  alternatives reads `needs one of these properties: "all", "ids"`; patterns are described
  (`must not be empty or start or end with a space`). An option written beside `options` in a
  pipeline entry is told to move inside it (F-25). These messages come from `src/lib/json-schema.ts`,
  so stored-document validation and the registry's option checks read the same way.
- **CC-3 Within match-scouting.json.** Errors: a layer, button, phase or toggle button that a
  reference names does not exist (initialLayer, phase and segment layers, executable `to`,
  `always` and `conditional` buttons, lock trigger buttons and `untilPhase`, alliance-relative
  buttons, kind toggle buttons); an executable type that is neither built in nor a registered
  extension, with the closest name, and an extension executable's options that its own schema
  refuses (#362; a schema that does not compile is reported as a bug in the extension);
  duplicate layer, phase, segment or kind ids; phases or segments
  out of match order, a phase after `timing.totalMs`, a segment outside its phase, a repeat that
  starts after its phase ends; a fixed `kind` that no segment declares, a fixed `kind` on a
  segment that has kinds, and `alternate` on a segment without `kinds` and `repeat` (#326). Warnings: a `gridArea` past the grid or with an end at or before
  its start (the browser still draws it, so the hint gives the corrected value); two buttons in
  one cell of a layer, unless one is shown only for some value of a variable (2023's cones and
  cubes); the same button id twice in a layer; a layer nothing opens; a `conditional` variable
  nothing sets.
- **CC-4 Transformers.** An unknown name gets "did you mean", "check type", or the retired
  transformer's replacement (TR-10); an extension's options are checked against its own schema
  (TR-14); a schema that does not compile is reported as a code bug.
- **CC-5 Ids that options name.** An option whose schema uses `$defs/actionId` (or
  `actionIdList`) names button ids, and one using the period filters names phase, segment or kind
  ids; the check walks each option alongside its schema, so a new built-in, or an extension using
  `pipelineDef("actionIdList")`, is covered without changing the check. A button id must be an
  action button, an `extraActionIds` entry, a listed `knownIds` entry, or an id TBA enrichment
  produces from a configured prefix. An unknown id gets "did you mean"; a v5 id that put the
  period in front of the button is explained as that button in that period, with the v6 way to
  write it (CS-16); a path is told its button id; a button that is not an action is named as such.
  A period id must exist (`preMatch` is always a phase id). A `by` grouping whose keys collide is
  reported on the entry. Module action ids (HeatmapScatterPlot) are checked the same way, and a
  module that is not built in is a warning until extension modules exist.
- **CC-6 Enrichment.** Each score-breakdown prefix's `phase` must exist. Warnings: enrichment
  enabled with no prefixes, or with no `knownIds` (a count of a result nobody achieved at an
  event would be No Data instead of 0, DM-11b), and a known id that no prefix produces.
- **CC-7 QR** (revised by #358). There is no `qr.json`: the layout is derived (document 03
  DM-15d). config:check sends 20 generated matches through a QR code and back, and reports an
  error if one cannot be encoded or comes back changed (something the screen records that a code
  cannot carry), and a warning if one code holds fewer than 200 actions with positions.
- **CC-8 Order of checks.** A check that compares two files runs only when both passed their
  schema, so one typo does not bury the report; the report lists what was skipped. A pipeline or
  modules file with some bad entries is still checked entry by entry. The pipeline runs on
  generated matches last (CC-9 to CC-12), without the entries the schema rejected, and needs a
  valid match-scouting.json; what follows from an entry or module with a finding is not
  reported again.

- **CC-9 Paths the pipeline reads.** The pipeline runs on 120 generated matches (document 22),
  with one more robot whose scouts record nothing in any match, and with synthetic TBA data
  built from `knownIds` and `componentOprs`. Every path a transformer reads is watched
  (`observePathReads`, docs/spec/09 TR-3), so an extension is checked like a built-in without a
  list of which option is read from where. Error: a path that no earlier entry writes on any
  performance or team, one finding per option. The hint names the entry that writes it later
  (entries run in order), a value of the other kind (a value of each match read by a team entry,
  or the reverse), v5's `actionQueue` (DV-11), a path that ends in a v5 id (CS-16), or the path
  probably meant: a sibling with a similar name, else the same last part elsewhere
  (`"averages" has no "missCoral", but there is a team value "counts.missCoral"`). Error: an
  entry that throws on the generated matches, with how many performances or teams and the first.
- **CC-10 Paths modules show.** The modules schema says what each module path is: `$defs/path` a
  team value, `$defs/performancePath` a value of each match (PerformanceTimePlot), and
  `$defs/itemPath` a path inside each item of a list another option names (HeatmapScatterPlot's
  `coordinatePath`); RadarChart's `"none"` is not a path. Error: a path the pipeline never writes,
  so the module would always show No Data, with CC-9's hints. `percentChanceOfWinning` reads
  `averageScores.total` and `standardDeviation` (AN-23, AN-24), which are checked too; `manual.*`
  is manual data (DM-14) and is not. Warning: a list none of whose items has the item path, so a
  heatmap would be empty.
- **CC-11 Values empty for everyone.** Warning: a value that is 0, null, false or empty for every
  performance or every team (the robot that never did anything aside). It is reported once, at the
  entry where it starts: a value computed from empty inputs follows from that entry, and anything
  that follows from a finding already reported is not reported at all. It is reported when the
  entry's whole output is empty, or when a later entry or a module reads the empty value; a count of
  every button is 0 for buttons a phase does not show, which is normal until something reads it.
  The hint says where the generated matches recorded the buttons the entry names, against its
  period filters or the list it counts (`"autol4" was recorded only in phases "auto" and "teleop",
never in "preMatch"`).
- **CC-12 Rankings.** A ranking is a module path with `sort` 1 or -1 (MO-4), or a value win
  probability reads. Warning: the robot that never did anything gets null there, so a real team
  that never did it drops out of the ranking instead of ranking last (F-24, TR-12). The finding is
  on the entry nearest the ranking whose transformer takes `ifNone`, `divByZero` or `default` and
  leaves it unset; `null` set on purpose is respected. The hint gives the worst value for the
  ranking's direction: a low one such as 0 when higher is better, a high one such as the match
  length when lower is better, and says to leave it unset only when "never did it" means "unknown".
  When no entry on the way takes such an option, the warning is on the module.

The generated matches show likely mistakes, not proof: the walk presses buttons at random within
the rules, at about the rate real scouts did (a median of 22 actions per match in 2025 and 2026).
With 40 matches, rare buttons in short windows (2023's auto placements, counted from a 15 s
`actionTimeFilter`) went unpressed and gave false CC-11 warnings; with 120 there are none in any
archived season, and the check takes about 0.2 s. The report ends with what it ran on ("Ran the
pipeline on 120 generated matches (720 performances of 49 teams, one of which never did
anything)"). `checkConfiguration(sources, { generated: false })` runs CC-1 to CC-8 only.

**Run on the real configurations (2026-11-20).** The archived 2025 files have no errors and three
warnings: two buttons with `gridArea [5,2,5,5]`, and no `knownIds`. Run on generated matches, they
show six errors that v4.2.0 shipped. Four "Team Stats" lines read `averages.missCoral`,
`missAlgae`, `dropCoral` and `dropAlgae`, which were never written: `averages` averages each
match's counts, and those totals exist only per team. The "Barge Points" column and "Expected
Barge Points" read `avgEndgamePoints`, which the original 2025 pipeline wrote and v4.2.0's did
not. The v4.2.0 golden output has none of these values. v5 read a missing value as 0, so all
six showed 0.00 for every team at every event, all tied for first (F-27). There are also three ranking warnings: the endgame, algae and coral cycle times rank
teams with no `ifNone`. At 2025ilch, 5 of 42 teams never completed a coral cycle and dropped out
of that ranking. The archived files stay as converted, because they are an oracle input that a
drift test pins to the converter (`config/seasons/README.md`).

The active 2026 set, in native form since #320, has one error and four warnings in its files.
The error is the `attemptClimb` entry of §2.2: `"attemptClimb" is not a button id … Did you mean
"AttemptClimb"?`. The native configuration keeps it on purpose, so it reproduces v5's null and
config:check reports it. The four warnings are buttons whose `gridArea` reaches column line 14 of
an 11-column grid. Run on generated matches, the set shows 10 more errors and four warnings:

- 10 errors are module paths. `counts.endgameFall` ("Attempted Climb Level") names a catalog id
  that is a misspelling of the button `fall`, so v5 always showed 0 there. `opr.Hub Auto Fuel
Count` was never among the 2026 OPR strings. Eight read `averageScores.auto`, `teleop`,
  `endgame` and `total`, which 2026 never computed; they are in the match view, which was
  disabled that season.
- One warning is five rating counts in the transition and the first inactive shift, such as
  `counts.transition.RatingDefense1`, that are 0 in every generated match although rating
  entries read them.
- Three warnings are rankings without `ifNone`: shooting and auto shooting cycle times, and the
  averaged ratings.

Before #320 the files had 16 errors, all v5 composite ids in options, and the generated matches
added 55 pipeline paths and 6 module paths ending in v5 ids.

Running the converted older seasons also found real defects:

- 2022 and 2023 rank teams by times (tarmac crossing, climb start, cycle times) with no `ifNone`.
- 2023 weighted platform pickups that its `countHybrid` never counted.
- 2024v2's "Team Stats" and "Accuracy" column show `accuracy`, a value of each match, where a
  team value belongs.
- The converter still wrote v5's `actionQueue` as a path (2022, 2023, 2026); it now writes
  `actions` (DV-11).
- The generator stalled on 2022, whose auto begins 10 ms after the start button; it now waits for
  the next phase (document 22 SY-9).

## 5. Tests (T-3)

| Test file                                   | Guarantees                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/config-v2-schema.test.ts`       | Schemas compile in Ajv strict mode; minimal documents validate; v1 documents, wrong `version`, seconds, unknown properties, unknown transformer/module options and bad executables are rejected with path + message; extension transformers/modules/executables pass.                                                                                                                                                                                                               |
| `tests/unit/config-convert.test.ts`         | Every archived season set in `config/v1` (2022, 2023, 2023v1, 2024, 2024v2, 2025, 2025v2, 2025 at v4.2.0, 2026) converts to valid v2 with resolvable layer references; the converted 2026 config derives every action id the 2026 oracle found in real data except the TBA `_None` ids (which are enrichment output, not scouting ids); catalog removed; renames applied.                                                                                                           |
| `tests/unit/config-active.test.ts`          | `config/*.json` validate; they equal the converter output (drift check, delete when hand-editing starts); the derived id count fits the QR id field.                                                                                                                                                                                                                                                                                                                                |
| `tests/unit/config-v1.test.ts`              | Converter inputs still parse (unchanged).                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tests/unit/config-check.test.ts`           | Each class of config:check finding in the files (CC-1 to CC-8) on a small change to the 2025 or 2026 configuration; the 2025 files have no errors, and run on generated matches show the six module paths and three rankings v4.2.0 shipped; the 2026 set reports the `attemptClimb` entry; every converted v1 season gives a report whose findings all have a line and read without `undefined`, and the real defects above; the CLI exits 0 with warnings only and 1 with errors. |
| `tests/unit/config-check-generated.test.ts` | CC-9 to CC-12 on small changes to 2025 (2026 for v5 paths and the heatmap): a typo, an entry run too early, a value of the wrong kind, `actionQueue`, an entry that fails; module paths of each kind, RadarChart `"none"`, win probability; an empty value reported once where it starts, and only when used; a ranking without `ifNone` or `divByZero`, and that a worst value or `null` on purpose silences it.                                                                   |

Oracle cross-check result: of the 32 ids the v5 pipeline could not explain for 2026mnwi
(document 17 §2.2), 30 are derivable from the v2 config with no catalog (`activeShift3*`,
`teleop*`, `autoAttemptL1`, `endgameAttemptClimb`, `teleopTransitionAttemptClimb`, …). The two
remaining, `autoTowerRobot_None` and `endGameTowerRobot_None`, are synthetic TBA actions and
belong to the enrichment step.

## 6. Open items carried forward

- **Shift and endgame constants** were copied from the 2026 client (25 s shifts, endgame at
  30 s); a future season must set them by hand in the teleop phase's `shift` segment and in the
  `endgame` phase (the converter warns for both).
- **Phase and segment fields on actions** (§2.1): done. Document 21 stores them (DV-1), and the
  Phase 1 transformers filter and group on them (§2.2, #311, #326).
- **`extraActionIds` review**: the ten 2026 leftovers are four TBA level ids, which are also
  `knownIds` since #315, and capitalized `Fall` variants the catalog listed but no button
  produced. The pipeline does not read them (CS-16); they explain v5 ids to the migration and the
  oracle, and move to `config/seasons/2026/` with the rest of the 2026 files at kickoff.
- **`legacyClass`** can be removed from the active config once the colors are confirmed on the
  new grid. The scouting-screen preview (#322) draws them: `npm run dev`, then
  `/scouting-preview`.
- **Schema for extensions**: settled 2026-09-17 (ADR 0005). Extensions are registered at build
  time and each one **must** declare a JSON Schema for its options, so extension options are
  validated as strictly as built-in ones. The registry exists for transformers (#316, docs/spec/09
  TR-14): their names stay open in the pipeline schema, which cannot know them, and the registry
  checks their options. Executables have theirs too (#362, `src/scouting/extensions/`): their
  names stay open in the match-scouting schema, and config:check checks names and options
  against it. Module names stay open until their registry exists (Phase 3).
- Editor integration: `"$schema"` is a relative path, which VS Code resolves; if the schemas are
  ever published, switch to the `$id` URLs.
