# 21 — Data model v2 and the v5 → v6 migration

Phase 0 step 5 of document 17. Document 03 describes what v5 stores and carries the DM-\*
requirements; this document describes what v6 stores, why it differs, and how existing data
gets there. The JSON Schemas are the source of truth:

| File                                                 | Document             | Collection              | Types                  |
| ---------------------------------------------------- | -------------------- | ----------------------- | ---------------------- |
| `src/data/schema/team-match-performance.schema.json` | one robot, one match | `teamMatchPerformances` | `TeamMatchPerformance` |
| `src/data/schema/event.schema.json`                  | an event             | `events`                | `SpotEvent`            |
| `src/data/schema/scouter.schema.json`                | a person who scouts  | `scouters`              | `Scouter`              |

Types are in `src/data/types.ts`, validation in `src/data/validate.ts`, placement logic in
`src/data/phase.ts`, and the migration in `src/migrate/v5-to-v6.ts` with the CLI
`npm run migrate`. The Ajv plumbing is shared with the configuration schemas (`src/lib`).

## 1. What changed from v5, and why

| Id    | Change                                                                                                                                                                                                                                                                 | Source                  |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| DV-1  | **An action carries where it happened**: `phase`, `segment`, `segmentKind`, `segmentIndex` beside `id`. `id` is the button id with no period prefix. Analysis filters on `phase` instead of matching a dozen composite spellings; the v5 composite id stays derivable. | doc 20 §2.1             |
| DV-2  | **No per-action `_id`.** v5 stored a full ObjectId on every action, which is thousands of unused ids per event.                                                                                                                                                        | BL-31                   |
| DV-3  | **`robotNumber` is a number**, always. v5 mixed strings from TBA with numbers from the FIRST API and compared with `==`.                                                                                                                                               | DM-1a, D-7              |
| DV-4  | **`scouterId` is a student ID** and points at a `scouters` record, or is `null`. v5 concatenated a typed first and last name into the field.                                                                                                                           | SEC-6                   |
| DV-5  | **`source` replaces the `"qrcode"` sentinel.** A scanned record is `source: "qr"` with no scouter, rather than a fake scouter named `qrcode`.                                                                                                                          | DM-2                    |
| DV-6  | **Flag metadata**: `flag { flagged, reason, source, at }` rather than a bare boolean, because a rule can now flag a record and a person needs to know which rule and why.                                                                                              | BL-208, RT-36           |
| DV-7  | **Hook fields exist from the start**: `notes`, `tags`, `coverage`, `superseded`.                                                                                                                                                                                       | BL-35, BL-193, RT-34/35 |
| DV-8  | **`tenantId` on every document**, single-valued in v6. Reserving it now avoids migrating live scouting data when a hosted instance arrives.                                                                                                                            | DM-7f, BL-197           |
| DV-9  | **Events carry `tbaKey` and `label` split out**, plus the write-gating `eventCode`.                                                                                                                                                                                    | DM-6, SEC-2/3           |
| DV-10 | **Missing means `null`**, everywhere.                                                                                                                                                                                                                                  | DM-1b, D-7a             |
| DV-11 | **Renames for plain meaning**: `timestamp` → `submittedAt`, `eventNumber` → `eventId`, `matchId` → `matchKey`, `matchId_rand` → `nonce`, `actionQueue` → `actions`.                                                                                                    | —                       |

Deliberate redundancy: the placement could be recomputed from `ts` and the season's
configuration, but the configuration is edited between seasons and sometimes within one, so
storing it keeps the data self-describing. `matchKey` is kept verbatim from v5 for the same
reason: it is the historical de-duplication key and embeds the original scouter spelling that
QR twin detection relies on.

## 2. Placing an action (`src/data/phase.ts`)

The match clock counts **down**. A phase begins when the time remaining reaches its `startMs`,
so the active phase is the most recent one to have begun, which is the smallest `startMs` that
is still `>=` the time remaining. Segments work the same way inside their phase, and a
repeating segment's index is `floor((segment.startMs − remaining) / intervalMs) + 1`, capped at
`repeat.count`. Before the first phase begins there is no phase, which is how a pre-match
action such as a preload is represented.

Two routes reach the same answer, and the migration uses both:

- `splitActionId(config, id)` reads the period out of a v5 composite id, longest prefix first
  so `teleopTransition` is never read as `teleop` followed by a button called
  `TransitionStoring`.
- `placeAt(config, ts)` reads it off the clock. This is the only route for seasons before 2026,
  whose ids carry no prefix.

`compositeActionId` is the inverse, so the v5 id can be reconstructed for the behavioral oracle
and for `countActions` compatibility.

## 3. The migration

Scope is the **2025 and 2026 seasons only** (DM-7g). The transforms are pure functions over
documents, and the CLI reads and writes `mongoexport` JSON rather than connecting to MongoDB,
so a migration can be produced and inspected before anything is imported:

```sh
npm run migrate -- --performances <dump>.teamMatchPerformances.json \
                   --events <dump>.events.json \
                   --config config/match-scouting.json \
                   --out <dir>
```

It writes the three collections plus `report.json`, validates every document it writes, and
exits non-zero if any document fails. Run it once per season with that season's configuration.

What it does beyond renaming fields:

- splits each composite id into a button id and a placement, falling back to the clock;
- normalizes team and match numbers, and MongoDB extended JSON (`$oid`, `$numberLong`);
- builds `scouters` records, merging spelling variants of one name by trimming, removing
  spaces and lowercasing, keeping the most common spelling as the display name and reporting
  every merge for an admin to check;
- marks historic duplicates `superseded`, keeping the latest submission, which is what the v5
  pipeline's `removeDuplicates` did. Who "finished the match" (RT-35) is not knowable from old
  data, so the migration reproduces the old outcome rather than inventing one.

### Results on the real exports

Both seasons migrate with **no invalid documents**.

| Metric                               | 2025 event | 2026 event |
| ------------------------------------ | ---------- | ---------- |
| Performances                         | 407        | 435        |
| Actions                              | 9275       | 10437      |
| Scouters                             | 32         | 31         |
| Superseded duplicates                | 3          | 22         |
| Action ids the config cannot explain | 0          | 0          |

Three things worth knowing about that table:

- **Zero unexplained ids in 2026** is the proof that deriving known ids from phases and buttons
  replaces the hidden catalog layer (F-4, CS-5). Nothing in real data needed the catalog.
- **The 22 superseded records reconcile with the oracle**: its golden report has 435 raw and 413
  after `removeDuplicates`, and 435 − 22 = 413. The migration and the legacy pipeline agree
  about which records are duplicates.
- **2025 gains phases it never had.** Its ids carry no prefix, so the clock supplies auto and
  teleop, and 2025 data becomes filterable by period for the first time.

Two findings the report surfaces rather than silently fixing:

- **One action out of 10,437 disagrees with itself**: `autoRatingShooting4` was recorded with
  the auto prefix at a timestamp that is already in teleop. The recorded id wins, because that
  is what the scouter's client wrote.
- **Two scouters had more than one spelling**, `FatemaMerchant` with `fatemamerchant` and
  `ishna pilgulwar` with `ishnapilgulwar`. This is exactly the problem student IDs solve going
  forward, and the migration reports each merge so an admin can confirm it.

## 4. Tests

| Test file                        | Guarantees                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/phase.test.ts`       | Countdown direction at every boundary, shift indexing and its cap, longest-prefix id splitting, and a round trip from every derived prefix back to the recorded id.                      |
| `tests/unit/data-schema.test.ts` | Documents validate; a string team number, a per-action `_id`, a missing placement field, a missing tenant and an unknown source are all refused with a path and a message.               |
| `tests/unit/migrate.test.ts`     | Both real exports migrate to valid documents; 2026 has no unexplained ids; superseded records reconcile with the oracle golden report; QR records, v5 flags and underscored event codes. |

## 5. Still to build

- **Persistence.** No MongoDB driver yet: the application's database layer lands with Phase 1,
  and these schemas become the collection validators then.
- **Indexes**, with `tenantId` leading so a hosted instance does not need them rebuilt.
- **The schedule and the current match** must be persisted too (D-4, manual schedule kept).
- **A driver-backed runner** for the migration, once there is a database layer. The transform
  and the report are the parts worth testing, and they exist now.
