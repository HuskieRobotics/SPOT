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
- **SY-6** Each match has a full lineup of distinct robots.
- **SY-7** The walk is paced so a match plays out to the end. The remaining presses are spread
  over the remaining time, so the late phases get their share of actions instead of the match
  trailing off in the middle.

## 3. Using it

```sh
npm run generate -- --config config/match-scouting.json --out <dir> \
                    [--seed preseason] [--matches 80] [--robots 6] [--legacy]
```

It writes the three v6 collections plus `report.json`. With `--legacy` it also writes the v5
shape, with composite ids rebuilt by `compositeActionId`, so generated data can be fed to the
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

## 4. What is still missing

- **Golden expectations.** T-4 also asks for stored expected pipeline output so a transformer
  change shows up in a diff. That needs the Phase 1 engine, and the generated dataset plus its
  seed is what those expectations will be built from.
- **Realistic behavior.** If a future test needs plausible robots rather than random ones, the
  place to add it is a weighting layer over button choice, not a rewrite: the walk already
  respects the rules.
- **Locks and rare paths** are modelled but rarely hit, because a random walk presses A-Stop
  about as often as anything else on its layer. A test that needs a lock should drive the
  simulation directly rather than hope.
