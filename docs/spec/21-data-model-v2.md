# 21 — Data model v2 and the v5 → v6 migration

Phase 0 step 5 of document 17. Document 03 describes what v5 stores and carries the DM-\*
requirements; this document describes what v6 stores, why it differs, and how existing data
gets there. The JSON Schemas are the source of truth:

| File                                                 | Document             | Collection              | Types                  |
| ---------------------------------------------------- | -------------------- | ----------------------- | ---------------------- |
| `src/data/schema/team-match-performance.schema.json` | one robot, one match | `teamMatchPerformances` | `TeamMatchPerformance` |
| `src/data/schema/event.schema.json`                  | an event             | `events`                | `SpotEvent`            |
| `src/data/schema/scouter.schema.json`                | a person who scouts  | `scouters`              | `Scouter`              |
| `src/data/schema/settings.schema.json`               | a tenant's settings  | `settings`              | `Settings`             |
| `src/data/schema/schedule.schema.json`               | an event's schedule  | `schedules`             | `Schedule`             |
| `src/data/schema/scouter-session.schema.json`        | a registry entry     | `scouterSessions`       | `ScouterSession`       |
| `src/data/schema/assignment.schema.json`             | a robot's holders    | `assignments`           | `Assignment`           |

Types are in `src/data/types.ts`, validation in `src/data/validate.ts`, placement logic in
`src/data/phase.ts`, and the migration in `src/migrate/v5-to-v6.ts` with the CLI
`npm run migrate`. The Ajv plumbing is shared with the configuration schemas (`src/lib`).

## 1. What changed from v5, and why

| Id    | Change                                                                                                                                                                                                                                                                                                                                                                                                                  | Source                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| DV-1  | **An action carries where it happened**: `phase`, `segment`, `segmentKind`, `segmentIndex` beside `id`. `id` is the button id with no period prefix. Analysis filters on `phase` instead of matching a dozen composite spellings; the v5 composite id stays derivable. `segmentIndex` is always the field clock's slot of a repeating segment (decided 2026-11-20, #326); v5 numbered a kind's shifts per kind instead. | doc 20 §2.1             |
| DV-2  | **No per-action `_id`.** v5 stored a full ObjectId on every action, which is thousands of unused ids per event.                                                                                                                                                                                                                                                                                                         | BL-31                   |
| DV-3  | **`team` is a string team key**, always: `"3061"`, or `"2338B"` for a second robot at an off-season event. Replaces `robotNumber`. v5 mixed strings from TBA with numbers from the FIRST API, compared with `==`, and could not store a B robot at all.                                                                                                                                                                 | DM-1a, D-7, BL-308      |
| DV-4  | **`scouterId` is a student ID** and points at a `scouters` record, or is `null`. v5 concatenated a typed first and last name into the field.                                                                                                                                                                                                                                                                            | SEC-6                   |
| DV-5  | **`source` replaces the `"qrcode"` sentinel.** A scanned record is `source: "qr"` with no scouter, rather than a fake scouter named `qrcode`.                                                                                                                                                                                                                                                                           | DM-2                    |
| DV-6  | **Flag metadata**: `flag { flagged, reason, source, at }` rather than a bare boolean, because a rule can now flag a record and a person needs to know which rule and why.                                                                                                                                                                                                                                               | BL-208, RT-36           |
| DV-7  | **Hook fields exist from the start**: `notes`, `tags`, `coverage`, `superseded`.                                                                                                                                                                                                                                                                                                                                        | BL-35, BL-193, RT-34/35 |
| DV-8  | **`tenantId` on every document**, single-valued in v6. Reserving it now avoids migrating live scouting data when a hosted instance arrives.                                                                                                                                                                                                                                                                             | DM-7f, BL-197           |
| DV-9  | **Events carry `tbaKey` and `label` split out**, plus the write-gating `joinCode`.                                                                                                                                                                                                                                                                                                                                      | DM-6, SEC-2/3           |
| DV-10 | **Missing means `null`**, everywhere.                                                                                                                                                                                                                                                                                                                                                                                   | DM-1b, D-7a             |
| DV-11 | **Renames for plain meaning**: `timestamp` → `submittedAt`, `eventNumber` → `eventId`, `robotNumber` → `team` (DV-3), `matchId` → `matchKey`, `matchId_rand` → `nonce`, `actionQueue` → `actions`.                                                                                                                                                                                                                      | —                       |
| DV-12 | **`EVENT_NUMBER` becomes `activeEventId`.** It was never a number, and which kind of identifier it holds is not the reader's problem. The admin UI selects an event by its `code`, which is what a person recognizes.                                                                                                                                                                                                   | CF-4, DM-7              |

Added in Phase 2 (#351), for what the server must keep across a restart:

| Id    | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Source                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| DV-13 | **A settings document per tenant**, `_id` the tenant id: `activeEventId` (DV-12a), the start rules (`quorum`, default 6, and `startOnFirstScouter`, default off) and the field orientation (`fieldFlipped`). Read per request through a 2 s cache, so a change needs no restart; a tenant without one gets the defaults. Secrets are never stored here.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | ADR 0003, RT-12a, A-19 |
| DV-14 | **A schedule document per event**, `_id` the event id: the last schedule read from TBA, the manual schedule, and the current match (a level and number). A slot not typed yet is `null`, and a typed row can be `locked` (AD-25a). For each level, the typed matches are used when there are any (AD-8a).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | D-4, AD-8, RT-16       |
| DV-15 | **The scouter registry is saved** (decided 2026-11-24). Memory stays the only thing assignment reads; each change is written to `scouterSessions` in the background, in order per entry, retried until it succeeds, so a slow or unreachable database never delays a scouter. The server reads the entries once at startup. Connection state is not stored, so after a restart every scouter is disconnected, keeps their robot (RT-25) and returns when their device reconnects, the same path as a dropped connection. One entry per person per event, `<event id>:<student id>`; an event's entries are removed when the active event changes. An entry also keeps whether its scouter accepted the assignment and was sent into the match, and when they signed in, which orders assignment (#353). | RT-24 to RT-35         |
| DV-16 | **Who held each robot in each match**, saved the same way (#353): one document per event, match and robot (`<event id>:<match>:<team>`), listing its holders in order, each with when they started and stopped, why they stopped (`released`, `unassigned`, or null for whoever finished), and whether they got it after someone had started scouting the match. When a record arrives, this answers RT-35 (who held the robot at the end), RT-34 (did they join late) and RT-36 (was it a replacement); `holderAtEnd` and `wasReplacement` in `src/sessions/registry.ts`.                                                                                                                                                                                                                              | RT-31 to RT-36         |
| DV-17 | **A match is a level and a number** (decided 2026-11-24): `level` is `qual` or `playoff`, and `matchNumber` counts within it, as the field does (Qual 1 to N, Playoff 1 to 16; document 06 RT-22a). Performances, schedule matches, registry entries (`matchLevel`) and assignment histories all carry it, and the current match is `{ level, number }`. Analysis orders qualifications before playoffs, counts Qual 5 and Playoff 5 as two matches, and joins TBA's results to qualifications only. Migrated 2025 and 2026 data is all `qual`: neither event scouted playoffs. The QR code carries it too (#358).                                                                                                                                                                                      | RT-22a, DM-11          |

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

The id gives the phase, the segment and the kind; a repeating segment's index always comes from
the clock (decided 2026-11-20, #326). v5's `activeShift2` meant the second _active_ shift,
counted from the scouter's toggle press, so it was slot 3 in one match and slot 4 in another, and
a late press made every later shift late. v6 records the slot, so `active3` means "active, in the
third 25 s slot" in migrated and new data alike.

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
  pipeline's `removeDuplicates` did (on a tie, the first in export order, as v5 kept it: 2026 has
  one record synced twice with identical content). Who "finished the match" (RT-35) is not knowable from old
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

Three findings the report surfaces rather than silently fixing:

- **One action out of 10,437 disagrees with itself**: `autoRatingShooting4` was recorded with
  the auto prefix at a timestamp that is already in teleop. The recorded id wins, because that
  is what the scouter's client wrote.
- **333 of 6,479 shift actions carry a v5 number that does not fit their clock slot**
  (`shiftNumbering` in the report, in 175 of 435 performances). Under strict alternation shift
  n of a kind falls in slots 2n−1 to 2n; these were recorded after a late or repeated toggle
  press, or in a slot whose label did not flip. The kind is kept as the scouter selected it, and
  the slot is the clock's. The 2026 oracle comparison checks that its per-shift differences come
  only from these performances (#326).
- **Two scouters had more than one spelling**, `FatemaMerchant` with `fatemamerchant` and
  `ishna pilgulwar` with `ishnapilgulwar`. This is exactly the problem student IDs solve going
  forward, and the migration reports each merge so an admin can confirm it.

## 4. Tests

| Test file                        | Guarantees                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/phase.test.ts`       | Countdown direction at every boundary, shift indexing and its cap, longest-prefix id splitting, and a round trip from every derived prefix back to the recorded id.                      |
| `tests/unit/data-schema.test.ts` | Documents validate; a team key sent as a number, a per-action `_id`, a missing placement field, a missing tenant and an unknown source are all refused with a path and a message.        |
| `tests/unit/migrate.test.ts`     | Both real exports migrate to valid documents; 2026 has no unexplained ids; superseded records reconcile with the oracle golden report; QR records, v5 flags and underscored event codes. |

## 5. Naming the active event

v5 stored the active event in `config.json` as `EVENT_NUMBER`, an ObjectId hex string. The name
says "number", the value is not a number, and the fact that it is an ObjectId is an
implementation detail the reader should never have to know. v5 already hid this in the setup
UI, which presents the event **code** and converts (CF-4).

v6 has no `config.json` (ADR 0003), so the active event is a field in the settings document:

```jsonc
{ "activeEventId": "69a5ac455b39b683634e795e" }
```

- **DV-12a** The settings field is `activeEventId` and holds the event's `_id`. Documents
  reference `eventId` (DV-11), so there is exactly one notion of event identity in the data.
- **DV-12b** Every user-facing surface selects and displays an event by its `code`
  (`2026mnwi_official`), never by its id. Nothing in the UI shows an ObjectId.

Considered and rejected: making `code` the primary key of events and dropping ObjectIds there
entirely, so a performance would read `eventId: "2026mnwi_official"`. It reads better, and the
migration could rewrite the references since it already rewrites every document. It was
rejected because an event code is editable by an admin, so a typo correction would orphan every
performance that referenced it. Identity that a person can retype is identity that can break.

## 6. The database layer (`src/db/`, #351)

Phase 2 is the first phase that stores data (gate W-1). Phase 1 needed no database: the engine
runs on documents it is given.

- **One connection per process** (`client.ts`), from `MONGODB_URI` only, kept on `globalThis`
  so `next dev` reuses it. Code that reads or writes takes a `Db`, so tests pass the in-memory
  MongoDB and only route handlers call `getDb()`.
- **Validators.** Every collection has the schema above as a MongoDB `$jsonSchema` validator,
  strict, so the database refuses a malformed document even if something writes around the
  application (`collections.ts`). MongoDB lacks `$ref` and the `integer` type, so references are
  inlined and `integer` becomes `number`: the driver stores epoch milliseconds as doubles, so only
  the application's validator, which every write passes first, tells an integer from a fraction.
  A keyword MongoDB lacks is an error at startup, so a schema edit cannot weaken the database's
  check unnoticed (`mongo-schema.ts`). Updating a validator needs the database user's `dbAdmin`
  role; without it the server warns and keeps the old validator.
- **Indexes** lead with `tenantId` (DV-8). A performance's `nonce` is unique among the current
  (not superseded) records of an event, because the migration keeps v5's duplicates as
  superseded copies (§3); code that de-duplicates looks a nonce up across all records.
- **Public reads** remove the private fields on the read path: `publicPerformances` has no
  `scouterId` (SEC-8) and `publicEvents` no `joinCode` (SEC-3). The admin reads are separate
  functions, so a caller states which view it serves.
- Tests: `tests/unit/db.test.ts` (T-5).

Still to build: **a driver-backed runner** for the migration, which phase 4 runs against the
real dump (document 17 §3). The transform and the report are the parts worth testing, and they
exist now.
