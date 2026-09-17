# 19 — Model Fit Guide: which model for which work

Written 2026-09-17 for future planning. Two Claude tiers are in play: **Claude Opus** (the
default, lower-cost, strong general coding model) and **Claude Fable 5.1** (the Mythos-class
model; strongest at ambiguous, cross-cutting judgment, and the expensive path). The
specification, requirement ids, resolved-decision log, and behavioral oracle were built so
that most implementation work is well-specified and objectively checkable, which is what
makes the cheaper model a good fit for it.

## Rule of thumb

Use **Opus** when the task has a written requirement to cite, an objective check (a test, the
oracle, a schema), and touches one layer. Use **Fable 5.1** when the task decides something
other work will depend on, crosses layers, or requires interpreting why two sources disagree.
If Opus drifts from the spec on a task, escalate that task, not the whole project.

## By work item

| Work item (doc 17 phases)                                                          | Recommended                                                                      | Why                                                                                                             |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Scaffold, CI, tooling upkeep                                                       | Opus                                                                             | Conventional, checkable by `npm run build` and CI                                                               |
| JSON Schema v2 for the four config files + v1→v2 converter                         | Opus, Fable for the schema design review                                         | Mechanical once the schema is decided; the schema itself is a public interface (D-1)                            |
| Porting built-in transformers to TypeScript                                        | Opus                                                                             | Pure functions with the oracle as an exact acceptance test (T-2, T-4)                                           |
| Synthetic TMP generator                                                            | Opus                                                                             | Rule-following generation from `match-scouting.json`; verified by running it through the legacy pipeline        |
| Analysis modules (Plotly)                                                          | Opus                                                                             | One widget at a time; visual smoke tests                                                                        |
| Scouting grid, timer, undo, executables                                            | Opus for implementation; Fable for the undo/layer-history and shift model design | The undo and layer-history semantics (SC-24/25) are subtle and were the source of legacy bugs                   |
| Session/assignment service (SSE or polling), presence, kick                        | Fable for the design and first implementation; Opus for follow-ups               | Cross-cutting: transport, in-memory state, reconnect/resync, admin concurrency (RT-*, BL-33/34)                 |
| Auth and settings storage (R-32)                                                   | Fable                                                                            | Security model decisions with a first-run usability constraint                                                  |
| Extension loader (runtime discovery under Next.js)                                 | Fable                                                                            | Architectural; must satisfy P4 and non-programmer usability (A-5, A-49)                                         |
| Offline/PWA caching strategy (doc 18)                                              | Fable for the strategy; Opus for the service-worker implementation               | Defining what must be cacheable is the hard part; the caching rules are then mechanical                         |
| Data model v2 + v5→v6 migration script                                             | Fable for the model; Opus for the script                                         | Schema decisions ripple everywhere; the migration is a checkable transform                                      |
| Oracle mismatches                                                                  | Fable                                                                            | Deciding rewrite bug vs. legacy defect vs. normalization artifact requires reading both code bases and the spec |
| Reviewing PRs that change `docs/spec`, config schema, or data model                | Fable                                                                            | Public-interface changes are expensive to unwind                                                                |
| Reviewing ordinary feature PRs                                                     | Opus                                                                             | Spec-cited, test-covered changes                                                                                |
| Rewriting user docs (Quickstart, Configuration Guide, Usage Guide) from the spec   | Opus                                                                             | Well-sourced writing                                                                                            |
| Backlog design hooks (scouter accuracy #195, pit scouting #221, multi-tenant #197) | Fable for the design note; Opus to implement once designed                       | Each is a new subsystem touching the data model                                                                 |

## Effort levels within a model

- Low/medium effort is enough for formatting, small refactors, and test scaffolding.
- Use high effort (either model) for anything touching the pipeline engine, the session
  service, or the offline layer, because defects there surface only at events.

## Working practices that make the cheaper model reliable

- Every task prompt names the requirement ids and the test that proves it.
- Keep the oracle green; a red golden test is the signal to escalate.
- Never let a task modify `docs/spec` silently; spec changes are their own reviewed PRs.
