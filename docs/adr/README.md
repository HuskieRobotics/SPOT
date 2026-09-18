# Architecture decision records

One short file per decision that would otherwise be relitigated in pull request review.
Phase 0 item 7 of [the rewrite plan](../spec/17-rewrite-plan-and-next-steps.md).

Each record states the context, the decision, and the consequences we accept. A record is
immutable once accepted: to change a decision, add a new record that supersedes it and update
the older one's status line.

| #                                          | Decision                                                                     | Status              |
| ------------------------------------------ | ---------------------------------------------------------------------------- | ------------------- |
| [0001](0001-realtime-transport.md)         | Server-sent events, with polling as the fallback                             | Accepted 2026-09-17 |
| [0002](0002-hosting-and-runtime.md)        | Plain Node behind nginx, cloud-neutral, no Docker                            | Accepted 2026-09-17 |
| [0003](0003-configuration-storage.md)      | Game configuration in files, settings in MongoDB, secrets in the environment | Accepted 2026-09-17 |
| [0004](0004-authentication-and-privacy.md) | Public reads, event code for writes, one admin password, student-id scouters | Accepted 2026-09-17 |
| [0005](0005-extension-model.md)            | Build-time registry with required option schemas                             | Accepted 2026-09-17 |

The requirements these produce live in the specification; the records exist for the "why".
