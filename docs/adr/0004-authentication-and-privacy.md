# 0004 Public reads, event code for writes, one admin password, student-id scouters

Status: Accepted 2026-09-17. Sources: document 12 S-1 to S-4 and R-32, answers 30 to 32, maintainer decisions 2026-09-17.

## Context

In v5 everything that reads or writes scouting data is unauthenticated except the admin
registry and config endpoints. The access code is a single shared password compared in plain
text and echoed back by the config endpoint. Scouters identify themselves by typing a first
and last name, which is concatenated into the stored `scouterId`.

Three forces pull in different directions. Team 3061 is an open alliance team and does not
keep scouting data secret. A public server with unauthenticated writes can be polluted by
anyone who finds it. And scouter names are the names of minors.

## Decision

**Reads are public.** The analysis dataset and the dashboard need no authentication. This is
a deliberate choice, not an oversight: the data is meant to be shared, including with
alliance partners and other teams at an event.

**Writes are gated by a per-event event code.** A scouter enters the code once, the device
keeps it, and it is attached to submissions. Match submission and QR-scan submission are
gated this way. The code is shown on the admin page and can be rotated. It exists to keep
strangers from polluting the database, not to protect the data.

**Admin actions are gated by one shared password**, provided in the environment. Admin
covers flagging, editing and deleting performances, the QR scanner's undo, restarting,
demo mode, the schedule, and settings. Scouting itself is never an admin action.

**Scouters are identified by student ID.** Students know their own, it is unique, and it does
not fork when someone uses a nickname. A `scouters` record maps the id to a full name, with
aliases and an admin merge action for duplicates. Sign-in offers a roster pick-list, cached
for offline use, with a path to add someone new. A new record's id is generatable on the
device so sign-in works at a fully offline event.

**Scouter information never appears in public views.** Admins see full names. The public
analysis view shows no scouter name, id or initials.

**Sessions last well beyond a day.** A fully offline event is the worst case, so neither the
event code nor an admin session may expire mid-event. Credentials are verified when data
syncs, not while scouting, so an offline tablet keeps working.

## Consequences

- The dataset endpoints must project scouter fields out of public responses. This is a
  filter on the read path, not a flag on the document.
- The `scouters` collection becomes required rather than a reserved hook, which also
  unblocks per-scouter accuracy scoring.
- Performances reference a scouter id; the display name is resolved at read time, so a merge
  or a correction does not rewrite history.
- The event code is a shared low-value secret. Store it with the event, compare it on the
  server, and never include it in a public read response.
- Unauthenticated reads mean no rate limiting by identity. Accept it; the failure mode is
  load, not disclosure.
- Everything here assumes one admin role. Per-user accounts would change the data model and
  are explicitly out of scope.
