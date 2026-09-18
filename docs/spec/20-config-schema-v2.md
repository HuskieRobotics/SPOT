# 20 — Configuration schema v2

Phase 0 step 4 of document 17. This document records the design of the v2 configuration
files, what changed from v1 (document 04) and why, how the v1 → v2 converter maps legacy
files, and what the tests guarantee. The JSON Schemas themselves are the source of truth:

| File                                              | Validates                       | Types                    |
| ------------------------------------------------- | ------------------------------- | ------------------------ |
| `src/config/schema/match-scouting.schema.json`    | `config/match-scouting.json`    | `MatchScoutingConfig`    |
| `src/config/schema/analysis-pipeline.schema.json` | `config/analysis-pipeline.json` | `AnalysisPipelineConfig` |
| `src/config/schema/analysis-modules.schema.json`  | `config/analysis-modules.json`  | `AnalysisModulesConfig`  |
| `src/config/schema/qr.schema.json`                | `config/qr.json`                | `QrConfig`               |

Types live in `src/config/types.ts`; validation in `src/config/validate.ts` (Ajv, draft
2020-12, strict mode, unknown-property and missing-property messages with dotted paths);
known-action-id derivation in `src/config/knownActionIds.ts`; the converter in
`src/config/convert/v1-to-v2.ts` with the CLI `npm run config:convert`.

All schemas are draft 2020-12, use `additionalProperties: false` everywhere a built-in
structure is described, and every file carries `"$schema"` (editor autocomplete, answer A-51
and the "students without programming experience" principle) and `"version": 2`.

## 1. Design decisions

| Id    | Decision                                                                                                                                                                                                                                                                                                                                                                                                              | Source                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| CS-1  | **All times are milliseconds** and the keys say so (`totalMs`, `startMs`, `pauseMs`, `intervalMs`, `positionLockMs`). The schema rejects `totalMs < 10000`, which catches the v1 template's seconds.                                                                                                                                                                                                                  | D-4, F-9                      |
| CS-2  | **Phases are a list, not a map keyed by time strings, and they are the periods analysis filters on**: auto, teleop, endgame. Each phase has `id`, `label`, `startMs`, optional `layer`, `prefix`, optional `pauseMs`, optional `segments`, optional `variables`/`always`/`conditional` (2023 transition semantics kept).                                                                                              | CF-4, CF-5, BL-298            |
| CS-3  | **Composite ids stay**: the recorded id is prefix + button id, exactly as SC-23, with the prefix written on each phase and segment instead of being re-derived from `displayText` at runtime. There is no separate on/off switch: every season before 2026 recorded raw button ids, which is expressed by leaving the prefixes empty. One place to look, and no way for a flag and a prefix to contradict each other. | A-22, SC-23                   |
| CS-4  | **Sub-periods of a phase are `segments`**, not top-level objects: `phase.segments[] {id, startMs, layer?, prefix?, repeat?{intervalMs, count}, kinds?[{id, prefix, toggleButton}]}`. The 2026 teleop transition is a segment; the four shifts are one repeating segment with two scouter-selected kinds. Endgame is a phase, not a segment (§2.1).                                                                    | SC-22, A-24                   |
| CS-5  | **Known action ids are derived**, never listed: `(phase prefixes ∪ segment prefixes, each kind × each repeat index ∪ "") × action-button ids ∪ extraActionIds`. The hidden catalog layer is gone. `extraActionIds` exists only for ids that data can contain but the grid cannot produce (TBA synthetic ids, hand-typed legacy ids).                                                                                  | CF-9, A-23, F-4               |
| CS-6  | **Layers have ids** and executables reference them by id (`{type:"layer", to:"layer-2"}`) instead of by index, so inserting a layer no longer renumbers every executable.                                                                                                                                                                                                                                             | CF-6, D-3                     |
| CS-7  | **Executables are objects with named fields**, one shape per type, validated by type; unknown types are allowed as extension executables (`{type, args}`). `climbHighlight` became `exclusiveHighlight {group}` because v1 ignored its arguments.                                                                                                                                                                     | CF-7, doc 05 executables      |
| CS-8  | **Buttons carry `color`/`textColor`** (CSS colors); `legacyClass` is kept by the converter for review and can be deleted by hand. Classes `timer`, `border`, `button-padding`, `largeAction` are layout helpers, not colors, and are dropped.                                                                                                                                                                         | A-51, CF-9b                   |
| CS-9  | **Client rules are in `rules`**: `undo.minQueueLength` (was `variables.minOfQueueLength`), `positionLockMs` (was hard-coded 1 s), `locks[]` (the A-Stop lock generalized: trigger buttons, lock until a phase, exempt button types, message), `allianceRelativeButtons[]` (was the `AZone`/`OAZone` special case), `fieldMap.image`.                                                                                  | CF-8, CF-9c, SC-24..26, BL-60 |
| CS-10 | **Pipeline entries are unchanged in spirit** (`type`, `name`, `outputPath`, `options`) but each built-in transformer's options are a closed schema, so a typo such as `actionArrayPaths` or `divByZero` at the top level is an error, not silently ignored. Extension transformers accept any options.                                                                                                                | AN-5, F-10, 09 catalog        |
| CS-11 | **One spelling per option**: `finalActionOccurrence`, `cycle.startAction/endAction`, `actionTime.actionId`. The converter rewrites the v1 spellings and warns.                                                                                                                                                                                                                                                        | 09 catalog, guide typos       |
| CS-12 | **TBA enrichment is configuration** (`enrichment.tba.scoreBreakdown {enabled, prefixes}` and `componentOprs[]`), replacing `TBA_OPR_STRINGS` in `config.json` and the hard-coded `auto`/`endGame` prefix scan.                                                                                                                                                                                                        | AN-7, AN-8, A-14              |
| CS-13 | **Module options are closed schemas per built-in module**; `HeatmapScatterPlot.coordinateTransform` (`none`/`foldHalfField`) makes the 2026 half-field folding explicit; `filterTeams.ratingBands` replaces the hard-coded Filter Teams bands.                                                                                                                                                                        | AN-19, AN-21, F-12, A-33      |
| CS-14 | **QR ids are indexes into the derived known-id list**; the converter widens `id` to 16 bits because the 2026 set has 504 ids (v1 had 8 bits and 195 catalog ids). Because the index depends on the configuration, the payload header carries a 16-bit fingerprint of the derived list and the scanner refuses a mismatch (DM-15a, decided 2026-09-17).                                                                | DM-12, qr.json                |
| CS-15 | **No settings file in v2.** Server settings and secrets are environment variables (`.env.example`); event selection is data. The planned "settings document" from document 17 is therefore not a JSON file and needs no schema.                                                                                                                                                                                       | NF-9, A-40, R-32              |

Things the schema deliberately does **not** do yet (Phase 1 decisions, document 17 §2.3):
start rules for entering a match (BL-34), the manual schedule, the extension loader contract,
and the data model v2 (step 5).

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
          },
        ],
      },
      { "id": "endgame", "label": "Endgame", "startMs": 30000, "prefix": "endgame" },
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

`countActions` and the other transformers then take optional `phases` / `segments` filters, so
"Storing during teleop" is one line of configuration instead of the eleven composite ids that
forced the v1 catalog layer. The composite id stays derivable (`prefix + id`), which is what
keeps the behavioral oracle comparable and `countActions(all)` unchanged; the v5 → v6 migration
splits existing ids such as `teleopTransitionStoring` back into fields using the same prefix
derivation. The transformer options are **not** in the v2 pipeline schema yet: they land with
the engine in Phase 1, so that a configuration cannot name a filter the engine ignores (F-10).

## 3. Converter (`src/config/convert/v1-to-v2.ts`)

| v1                                                                                                | v2                                                                                                                     | Notes                                                                                        |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `timing.totalTime`                                                                                | `timing.totalMs`                                                                                                       | warns if it looks like seconds                                                               |
| `timing.timeTransitions["130000"] {layer, displayText, …}`                                        | `timing.phases[] {id: camelCase(displayText), label, startMs, layer: "layer-N", prefix}`                               | prefix = camelCase(label), or `""` for a pre-2026 config; no transitions → one `match` phase |
| transitions whose label contains "teleop" (only when shift buttons exist)                         | one `teleop` phase starting at the earliest of them; the others become `segments`                                      | phase id/prefix/label come from the **last** one, so bare `teleop*` ids still resolve        |
| catalog layer (never navigated to, ≥ 20 buttons, exactly one)                                     | removed; ids not reproduced by derivation → `extraActionIds`                                                           | 2026: 195 catalog ids, 10 kept                                                               |
| `variables.minOfQueueLength`                                                                      | `rules.undo.minQueueLength`                                                                                            | default 1 with a warning when absent                                                         |
| buttons containing `astop`                                                                        | `rules.locks[0]` until the phase after the first                                                                       | message copied from the v5 client                                                            |
| `AZone`/`OAZone`                                                                                  | `rules.allianceRelativeButtons`                                                                                        |                                                                                              |
| `teleopActive`/`teleopInactive` present                                                           | a repeating `shift` segment (25 s, two kinds) plus an `endgame` phase at 30 s with no layer                            | count derived from the endgame boundary; v5 constants, **verify per season**                 |
| `class: "red timer"`                                                                              | `color: "#ff4436"`, `legacyClass` kept                                                                                 | map in `legacy-colors.ts`; unknown classes warn                                              |
| executables `{type, args}`                                                                        | typed objects; layer indexes → `layer-N` ids; `climbHighlight` → `exclusiveHighlight`; `flashBorder`/`example` dropped | unknown types kept as custom `{type, args}`                                                  |
| empty button ids                                                                                  | `"<type>-<layer>-<index>"`                                                                                             |                                                                                              |
| pipeline `finalActionOccurence`, `cycle.pickups/scores`, `actionTime.path`, top-level `divByZero` | `finalActionOccurrence`, `startAction/endAction`, `actionId`, `options.divByZero`                                      | each rename warns                                                                            |
| `config.json` `TBA_OPR_STRINGS`                                                                   | `enrichment.tba.componentOprs` (pass `--opr-strings`)                                                                  | score-breakdown prefixes default to `auto`, `endGame`                                        |
| modules unchanged; `HeatmapScatterPlot`                                                           | `coordinateTransform` set from `imgPath` (`half-field` → `foldHalfField`)                                              | `filterTeams.ratingBands` seeded with the v5 hard-coded bands                                |
| `qr.ACTION_SCHEMA`                                                                                | `actionSchema`, id widened to 16 bits                                                                                  |                                                                                              |

Usage:

```sh
npm run config:convert -- config/v1 <out dir> [--match-scouting f] [--pipeline f] [--modules f] [--qr f]
                          [--prefixing phase|none] [--opr-strings '<json>'] [--no-enrichment]
# --prefixing overrides the auto-detection: "phase" writes phase/segment prefixes, "none" leaves them empty.
```

The CLI writes the four files, prints every warning, validates the outputs, and exits 1 if any
is invalid. The active `config/*.json` were produced with the 2026 OPR strings fixture (see
`config/README.md`), and `config/seasons/2025/` holds the converted `2025v2` set as a
typical-season example and as an oracle input (`config/seasons/README.md`).

Converting 2025 is the useful counterpoint to 2026. It produces **no warnings** for
`match-scouting`: there is no catalog layer to remove and no client constant to guess. The
result is two phases with empty prefixes and no segments, so recorded ids are raw button ids.
2025 instead wrote the period into the button id by hand (`teleopGroundPickupCoral`), which is
what prefixes replaced in 2026, and it has no endgame period at all: climb and park were
distinguished by button, not by time. A 2025-style season that wanted endgame analysis would add
a third phase at 30000 ms; giving that phase a prefix would change the recorded ids, so for
existing data the prefix stays empty.

## 4. Tests (T-3)

| Test file                             | Guarantees                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/config-v2-schema.test.ts` | Schemas compile in Ajv strict mode; minimal documents validate; v1 documents, wrong `version`, seconds, unknown properties, unknown transformer/module options and bad executables are rejected with path + message; extension transformers/modules/executables pass.                                                                                     |
| `tests/unit/config-convert.test.ts`   | Every archived season set in `config/v1` (2022, 2023, 2023v1, 2024, 2024v2, 2025, 2025v2, 2026) converts to valid v2 with resolvable layer references; the converted 2026 config derives every action id the 2026 oracle found in real data except the TBA `_None` ids (which are enrichment output, not scouting ids); catalog removed; renames applied. |
| `tests/unit/config-active.test.ts`    | `config/*.json` validate; they equal the converter output (drift check, delete when hand-editing starts); the derived id count fits the QR id field.                                                                                                                                                                                                      |
| `tests/unit/config-v1.test.ts`        | Converter inputs still parse (unchanged).                                                                                                                                                                                                                                                                                                                 |

Oracle cross-check result: of the 32 ids the v5 pipeline could not explain for 2026mnwi
(document 17 §2.2), 30 are derivable from the v2 config with no catalog (`activeShift3*`,
`teleop*`, `autoAttemptL1`, `endgameAttemptClimb`, `teleopTransitionAttemptClimb`, …). The two
remaining, `autoTowerRobot_None` and `endGameTowerRobot_None`, are synthetic TBA actions and
belong to the enrichment step.

## 5. Open items carried forward

- **Shift and endgame constants** were copied from the 2026 client (25 s shifts, endgame at
  30 s); a future season must set them by hand in the teleop phase's `shift` segment and in the
  `endgame` phase (the converter warns for both).
- **Phase and segment fields on actions** (§2.1) are specified here but implemented in Phase 0
  step 5 (data model, migration) and Phase 1 (transformer filters).
- **`extraActionIds` review**: the ten 2026 leftovers are TBA level ids plus capitalized `Fall`
  variants the catalog listed but no button produced. Keep or delete by hand.
- **`legacyClass`** can be removed from the active config once the colors are confirmed on the
  new grid.
- **Schema for extensions**: settled 2026-09-17 (ADR 0005). Extensions are registered at build
  time and each one **must** declare a JSON Schema for its options, so extension options are
  validated as strictly as built-in ones. Until the registry exists, extension names remain
  open in the pipeline and module schemas.
- Editor integration: `"$schema"` is a relative path, which VS Code resolves; if the schemas are
  ever published, switch to the `$id` URLs.
