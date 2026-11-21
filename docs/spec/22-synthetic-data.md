# 22 — Synthetic scouting data

Phase 0 item 2 of document 17, satisfying **T-4** and answer 45: a new season's features have
to be verified before any match of that season has been played, so the test suite cannot depend
only on recorded data.

| Piece                          | Where                          |
| ------------------------------ | ------------------------------ |
| Seeded random number generator | `src/generate/random.ts`       |
| Generator                      | `src/generate/synthetic.ts`    |
| CLI                            | `npm run generate`             |
| Tests                          | `tests/unit/synthetic.test.ts` |

## 1. What it is

The generator walks a `match-scouting.json` the way a scouter would, and emits the performances
that walk produces. It is a **headless model of the scouting rules**, which makes it the first
executable statement of those rules rather than a bag of random documents. The Phase 2 client
and this generator should agree; where they disagree, one of them is wrong about the
configuration, and that is worth finding out before an event rather than during one.

It models the countdown and its phases and segments, the layer graph, the layer switches a
phase or segment performs, hidden buttons, multipliers, position capture, conditional layers
and variables, shift toggles, the undo guard, and configured locks such as A-Stop.

It does not model a human. Button choice is random within what the configuration allows, so the
data is rule-respecting but not realistic: robots do not have strategies, and the distribution
of actions means nothing. That is the right trade for a regression fixture, where what matters
is that the same input produces the same output and that every code path is exercised.

## 2. Guarantees

- **SY-1** Same seed, same data, byte for byte. A failing test can be replayed exactly.
- **SY-2** Every document validates against the data model schemas (document 21).
- **SY-3** Every action names a button that exists, is of type `action`, and is reachable on
  the layer the walk was on.
- **SY-4** Every action's placement agrees with the clock (`placeAt`), and every composite id
  it renders to is one the configuration can derive. The generator asserts this itself and the
  CLI exits non-zero if it ever fails, because a drifted walk makes a worthless fixture.
- **SY-5** Timestamps are inside the match and never increase within a performance.
- **SY-6** Each match has a full lineup of distinct robots. `--b-teams n` adds `n` second
  robots (`1741B`, …), as off-season events field them (BL-308); they cannot be rendered in the
  v5 shape, so `--legacy` refuses them.
- **SY-7** The walk is paced so a match plays out to the end. The remaining presses are spread
  over the remaining time, so the late phases get their share of actions instead of the match
  trailing off in the middle.
- **SY-8** Idle robots (`idleTeams`) play at least every sixth match and record nothing, like a
  robot that is broken or never moves. config:check fields one to see what a team that never did
  anything gets, and which rankings it drops out of (#317, docs/spec/20 §4 CC-12).
- **SY-9** When nothing on screen can be pressed while the clock runs, the walk waits for the
  next phase or segment, which may open a layer. 2022's auto begins 10 ms after the start button,
  and without this the walk stopped on the start layer and recorded nothing (#317). The committed
  2025 and 2026 inputs never reach this case, so they are unchanged.
- **SY-10** `generateTba` builds TBA responses for generated matches: a score breakdown that
  gives each robot one of the values its configured `knownIds` name, or `"None"` (always
  `"None"` for an idle robot), and a value for each configured component OPR (0 for an idle
  robot). With it, entries that count enrichment results have data before any real event.
- **SY-11** In a segment with `alternate: true`, the generated scouter's selected kind moves to
  the next kind at each repeat boundary of the field clock, and a later toggle press selects that
  kind from then on (#326, docs/spec/20). With `--legacy`, shift numbers are rebuilt the way v5
  numbered them, per kind from the selection (`activeShift2` is the second active shift), so the
  synthetic v5 input looks like real v5 data and migrates back to the same kinds and clock slots.
  The committed 2026 input was regenerated for this; the 2025 input is unchanged.

## 3. Using it

```sh
npm run generate -- --config config/match-scouting.json --out <dir> \
                    [--seed preseason] [--matches 80] [--robots 6] [--b-teams 0] [--legacy]
```

It writes the three v6 collections plus `report.json`. With `--legacy` it also writes the v5
shape, with composite ids rebuilt by `compositeActionId` and v5's shift numbers (SY-11), so
generated data can be fed to the
behavioral oracle in `tools/oracle` and compared against the legacy pipeline.

A run against the 2026 configuration, eighty matches, six robots each:

| Measure                         | Value                                    |
| ------------------------------- | ---------------------------------------- |
| Performances                    | 480                                      |
| Actions                         | ~11,200                                  |
| Distinct composite ids produced | ~360 of the 504 the configuration allows |
| Phases covered                  | pre-match, auto, teleop, endgame         |
| Shift kinds and indexes covered | active and inactive, 1 to 4              |

The 2025 configuration works too, which is the useful check that the generator is driven by
configuration rather than by 2026 assumptions: no segments, no prefixes, two phases, and the
raw button ids that season recorded.

### 3.1 Synthetic oracle sets

The legacy pipelines have been run over generated data (2026-11-19), so the oracle no longer
rests on two real events alone. One set per season, sixty matches of six robots, fixed seeds:

| Set                 | Configuration                  | Seed          | Legacy checkout | TMPs | Teams | Unknown ids |
| ------------------- | ------------------------------ | ------------- | --------------- | ---- | ----- | ----------- |
| `2025syn_synthetic` | `config/seasons/2025`          | `oracle-2025` | `v4.2.0`        | 360  | 48    | 0           |
| `2026syn_synthetic` | `config/` (the 2026 v2 config) | `oracle-2026` | v5 (`902db06`)  | 360  | 48    | 183         |

Inputs are in `tools/oracle/fixtures/synthetic/` (v5 shape) and output in
`tools/oracle/golden/<set>-<checkout>/`; `tools/oracle/run-all.sh` regenerates both. A unit test
fails if the generator no longer reproduces the committed inputs, so a generator change and its
golden output have to land together. The 183 unknown ids are composite ids the v2 configuration
explains but v5's hand-written enumeration never listed (F-4, document 17 §2); the legacy
pipeline counts them anyway, so they are part of the expected output. Phase 1 runs the v6 engine
over the same inputs, migrated to the v6 shape exactly as the real exports are, and compares.

config:check (docs/spec/20 §4) generates 120 matches with seed `config:check` and one idle robot
(team 9999), plus TBA responses when enrichment is configured, and runs the pipeline on them.

### 3.2 Previewing a configuration: `npm run config:preview` (#318, gate K-3)

```sh
npm run config:preview                                  # the active configuration in config/
npm run config:preview -- config/seasons/2025           # another season
npm run config:preview -- <folder> --team 3061          # one team, as the team view shows it
npm run config:preview -- <folder> --all                # every value of every entry
          [--seed preview] [--matches 80] [--out config-preview.json]
```

The preview plays a typical event (80 matches, about ten a team, seed `preview`) with one team
that never does anything (9999), adds synthetic TBA data, runs the pipeline, and prints:

- **What the modules show:** every value each module names, formatted as the module formats
  it (multiplier, decimals, unit; document 09 MO-4a), with its minimum, median and maximum across
  teams and what team 9999 gets. A value no entry writes reads "never written by the pipeline",
  and a list (the actions a heatmap plots) is described by its length.
- **What each entry writes:** one line per entry, per performance or per team: the range of a
  number, the lengths of a list, or how many values an object holds.
- **What looks wrong:** a value that is 0, No Data or empty for every team or performance, or
  the same for every team, is marked ⚠ next to it, with the entry that writes it.

`--team` shows one team module by module, with its rank where a module sorts; team 9999 shows
what a team that never did anything gets. The whole generated dataset (`teams` and `tmps`) is
written to `config-preview.json` (git-ignored). The preview needs match-scouting.json and
analysis-pipeline.json to pass their schemas; other mistakes are config:check's job, and the
preview ends with how many it finds.

The generated matches are random within the rules, so check the shape of the output, not its
size: whether a value varies between teams, has the right unit and ends up where a module
expects it. Magnitudes are not realistic; 2025's "Leave" exceeds 100% because the walk can press
the leave button more than once a match.

**Decided 2026-11-20 (#318): the terminal preview is enough.** No preview page is built before
kickoff. If a page is wanted later, the cheapest one is a "generated event" option in the Phase 3
team view (gate W-2): that view renders every module from a dataset in the browser with the same
engine (ADR 0005), and the generator and the preview are pure TypeScript, so it would show the
real modules with nothing new to maintain.

## 4. What is still missing

The v6 engine now reproduces the synthetic golden output of both seasons entry by entry, apart
from the reviewed divergences (#319, #320, `tests/unit/oracle-compare.test.ts`).

- **Realistic behavior.** If a future test needs plausible robots rather than random ones, the
  place to add it is a weighting layer over button choice, not a rewrite: the walk already
  respects the rules.
- **Locks and rare paths** are modelled but rarely hit, because a random walk presses A-Stop
  about as often as anything else on its layer. A test that needs a lock should drive the
  simulation directly rather than hope.
