# 03 — Data Model

## MongoDB collections

### `teamMatchPerformances` (model `TeamMatchPerformance`)

```jsonc
{
  "_id": ObjectId,
  "timestamp": Number,        // Date.now() at submission (client clock)
  "clientVersion": String,    // config.VERSION at time of scouting (e.g. "1.0")
  "scouterId": String,        // v5: firstName+lastName concatenated, or "qrcode" for scanned TMPs
                              // v6: the scouter's student ID (SEC-6); names live in `scouters`
  "robotNumber": Number,      // FRC team number scouted
  "matchNumber": Number,      // SPOT linear match number (see "Match numbering")
  "eventNumber": ObjectId,    // _id of the events document (stored as ObjectId; clients send hex string)
  "matchId": String,          // "<matchNumber>-<robotNumber>-<scouterId>-<matchId_rand>"
  "matchId_rand": String,     // random 32-bit integer rendered in base 32
  "flagged": Boolean,         // default false; set from Edit page
  "actionQueue": [
    { "id": String, "ts": Number, "other": { /* e.g. "pos": {"x": 0-100, "y": 0-100} */ } }
  ]
}
```

- **DM-1** `matchId` is the client-side uniqueness key (IndexedDB key path, sync de-dup).
  `matchId_rand` is the server-side de-dup key for QR submissions.
- **DM-2** QR-decoded TMPs use `scouterId = "qrcode"`, so the socket sync also checks whether
  `<match>-<robot>-qrcode-<rand>` already exists before requesting a client's TMP.
- **DM-3** `ts` is **milliseconds of match time remaining** when the button was pressed
  (counts down from `timing.totalTime`), clamped to ≥ 0 on submit. Actions recorded before
  the timer starts have `ts = totalTime`. **[A-33]** Counting down is the accustomed model;
  keep it unless there is a strong reason to change.
- **DM-4** `other` is free-form per action. The only built-in producer is the `position` /
  `constantPosition` executables writing `other.pos = {x, y}` as integer percentages of the
  field image (origin top-left).
- **DM-5** Client-only fields never persisted: `baseId` (the un-prefixed button id) and
  `temp` (actions removed before submit, e.g. `startGame`, `teleopActive`).

#**[A-2]** A one-time migration of existing data is acceptable, and leaving old seasons behind
is acceptable; the rewrite may restructure this schema. Reserve fields for backlog hooks:
`notes` (BL-35), `tags` (BL-193), `flag: { flagged, reason, source }` (BL-208), and omit
per-action `_id`s (BL-31).

- **DM-5a** **[decided 2026-09-17]** Each action also carries the `phase` and `segment` it was
  recorded in; the legacy composite id stays derivable as prefix + id (document 20 §2.1). The
  migration splits existing ids such as `teleopTransitionStoring` using the same derivation.

### `events` (model `Event`)

```jsonc
{ "_id": ObjectId, "code": String }   // e.g. "2026mnwi_official"
// v6 adds the write-gating event code (SEC-2/SEC-3):
// { ..., "eventCode": String, "eventCodeRotatedAt": Number }
```

- **DM-6** Event codes are `<TBA event key>_<label>`; the TBA key is recovered with
  `code.split("_")[0]` wherever an event-scoped TBA call is needed.
- **DM-7** `config.EVENT_NUMBER` holds the hex `_id` of the active event. All new TMPs carry it;
  the default dataset endpoint filters by it.
- **DM-7a** **[decided 2026-09-17]** The event document also holds the per-event **event code**
  that gates writes (SEC-2). It is shown to admins, rotatable, and never included in a public
  read response (SEC-3).

### `scouters` (v6, required by SEC-6)

```jsonc
{
  "_id": String,            // student ID, as entered at sign-in; also the TMP `scouterId`
  "displayName": String,    // full name, shown to admins only (SEC-8)
  "aliases": [String],      // ids merged into this record by an admin
  "createdOffline": Boolean // record was created on a device before it reached the server
}
```

- **DM-7b** Performances reference the id only. The display name is resolved at read time, so
  merging or correcting a record never rewrites stored performances (SEC-6).
- **DM-7c** Public read responses MUST project every scouter field out (SEC-8). This is a
  read-path filter, not a flag on the document.
- **DM-7d** A record may be created on a device at a fully offline event and synced later
  (SEC-7), so the identifier cannot come from a server-side sequence. The student ID satisfies
  this by construction.
- **DM-7e** This collection also satisfies the dataset hook BL-195 (per-scouter accuracy).

## Match numbering and match objects

Everywhere the app handles a schedule, a match is:

```jsonc
{ "number": Number, "match_string": String, "robots": { "red": [ids], "blue": [ids] } }
```

- **DM-8** TBA source: `number` is made linear across levels — qualification matches keep their
  number; `ef`, `qf`, `sf`, `f` matches are offset by the count of all preceding levels
  (order `qm, ef, qf, sf, f`). `match_string` is the TBA key; robot ids are strings with the
  `frc` prefix stripped. Sorted ascending by `number`.
- **DM-9** FMS practice source (used only when TBA returns nothing and FMS credentials exist):
  `number` = practice match number, `match_string` = `<TBA_EVENT_KEY>_pm<N>`, robots are
  numbers (station names containing "Red" → red).
- **DM-10** Manual source: `number` = 1..N, `match_string` = `2023temp_q<N>`, robots are the
  strings typed in (default `"0"`).
- **NOTE** Mixed string/number robot ids exist; comparisons in the code use `==` or `String()`.
  A rewrite should normalize to one type.

## Scouter (server in-memory, per socket)

```jsonc
{
  "timestamp": Number,          // connection time; used as the admin UI key
  "state": {
    "status": 0|1|2|3|4,        // NEW, WAITING, SCOUTING, COMPLETE, DISCONNECTED_BY_ADMIN
    "connected": Boolean,
    "offlineMode": Boolean,     // false once connected
    "scouterId": String,
    "robotNumber": String|Number,
    "matchNumber": Number
  }
}
```

## Client-side storage

| Store                                             | Key       | Content                                                                                                                                                            |
| ------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| IndexedDB `development2` / store `development2`   | `matchId` | Unsynced TMPs from the scouting page                                                                                                                               |
| `localStorage.firstName`, `localStorage.lastName` | —         | Prefill for the sign-in form                                                                                                                                       |
| `localStorage.theme`                              | —         | `light` or `dark`                                                                                                                                                  |
| `localStorage.teamMatchPerformances`              | —         | JSON array of JSON-string TMPs cached by the QR scanner page when the server was unreachable; merged into analysis/edit datasets and re-synced by the scanner page |
| Service worker cache `scouting-cache-v1`          | URL       | Pre-cached assets and API responses (see document 02)                                                                                                              |

## Server in-memory state

| State                                           | Owner         | Lifetime                                                                                                                                            |
| ----------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ScoutingSync.scouters[]`, `ScoutingSync.match` | scouting-sync | Process lifetime; disconnected scouters pruned 60 s after disconnect                                                                                |
| `schedule[]`, `tempTeams[]`                     | schedule API  | Process lifetime; lost on restart (manual schedule is not persisted)                                                                                |
| `tbaResults`, `tbaOPRResults` + fetch times     | analysis API  | 5-minute cache, shared across events (**NOTE**: cache is not keyed by event, so switching events within 5 minutes can serve the wrong event's data) |
| `previousMatchIDRand`                           | qrscanner API | Last QR-submitted TMP for the Undo endpoint                                                                                                         |
| `executablesOutput`, `modulesStyleOutput`       | bundle routes | Cached after first request                                                                                                                          |

## Analysis dataset (client-side, produced by the pipeline)

```jsonc
{
  "tmps": [ TMP & derived paths ... ],
  "teams": { "3061": { /* derived paths */ }, ... }
}
```

Before transformers run, the client:

- **DM-11** Appends synthetic actions to each TMP from TBA qualification score breakdowns:
  for the robot's alliance slot `N`, every breakdown key starting with `auto` or `endGame` and
  ending with `N` yields `{ id: "<keyWithoutN>_<value>", ts: 0 }` (e.g.
  `endGameTowerRobot_Level2`, `autoTowerRobot_Level1`). Only the first matching key per
  category is used.
- **DM-12** Creates an empty team object for every distinct `robotNumber` in the TMPs.
- **DM-13** Sets `teams[t].opr.<oprString>` for each configured `TBA_OPR_STRINGS` value from the
  COPR response (`{ "<copr name>": { "frc3061": value } }`).
- **DM-14** After transformers, appends `manual.tmps` (with `manual: true`) and sets
  `teams[t].manual.<path>` from `manual.teams` (both currently empty JSON files).

**[A-34]** The TBA score-breakdown mapping (DM-11) must be configurable per season (which keys
to import and how to name them); today it imports every `auto*`/`endGame*` key by convention.
**[A-13, revised 2026-09-17]** The `manual/*.json` hooks serve the server self-calls **and**
offline operation: `/analysis/api/manual` is precached so the pipeline can run without the
server (document 18). Any replacement must keep every pipeline input cacheable.
**BL-195** The dataset should be able to carry a third top-level collection, `scouters`.

Well-known derived paths produced by the default pipeline and consumed by modules/CSV:
`counts.*`, `scores.*`, `cycle.*` (tmp), `cycles.*` (team), `averages.*`, `averageScores.*`,
`aggregatedActions`, `standardDeviation`, `opr.*`, `manual.*`, `zoneActionRating`,
`zoneActionRatingAverages`, `disabledCounts`, `averageTimes.*`, `actionTimes.*`.

## QR-code payload (binary, base64, error correction M)

Bit layout (all big-endian binary strings, packed into bytes then base64):

| Field               | Bits    | Encoding                                                                                                                                                                                              |
| ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| clientVersion major | 8       | integer                                                                                                                                                                                               |
| clientVersion minor | 8       | integer                                                                                                                                                                                               |
| eventNumber         | 96      | 24-hex-char ObjectId split into three 8-hex-char chunks, each as a 32-bit integer                                                                                                                     |
| matchNumber         | 8       | integer (max 255)                                                                                                                                                                                     |
| robotNumber         | 16      | integer (max 65535)                                                                                                                                                                                   |
| matchId_rand        | 64      | base-32 string parsed as integer                                                                                                                                                                      |
| actions             | 40 each | per `qr.json` `ACTION_SCHEMA`: `id` 8 bits (index into the enumeration of unique button ids in `match-scouting.json`, in first-appearance order across flattened layers; max index 254), `ts` 32 bits |
| terminator          | 8       | `11111111`                                                                                                                                                                                            |

- **DM-15** Header is exactly 200 bits; the decoder slices `bits[0:200]` then reads actions
  until an action whose first 8 bits are all ones.
- **DM-16** The decoder reconstructs `timestamp = Date.now()`, `scouterId = "qrcode"`,
  `matchId = "<match>-<robot>-qrcode-<rand>"`, `eventNumber` as the concatenation of the three
  hex chunks, and `matchNumber`/`robotNumber` as strings.
- **NOTE** The encoder pads the `ts` field to 32 bits but does not enforce the decoder's
  assumption that `id` is the first field; `qr.json` must keep `id` first. `other` (position)
  data is not encoded. Ids not present in the config enumeration cannot be encoded.

## Config file data contracts

See document 04 for the full schema of each configuration file.
