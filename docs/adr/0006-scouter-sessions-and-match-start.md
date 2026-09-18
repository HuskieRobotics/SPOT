# 0006 Scouter sessions keyed by identity, and three configurable start rules

Status: Accepted 2026-09-17. Sources: document 06 RT-12a and RT-24 to RT-30, document 12 F-20 to F-23, issue 34 (BL-34), answer 28.

## Context

Two related problems, both about what the server believes a scouter is.

**Starting a match.** v5 sends waiting scouters into a match when any one of three things
happens: someone else is already scouting the match, at least six scouters are waiting, or an
admin forces it. The first is the subject of issue 34, because one person pressing Start pulls
everyone else into an assignment modal whether or not they are ready. The count of six is
hard-coded, so a team with four scouters never trips it. The admin force-start emits to every
connected scouter, not only those on the current match.

**Dropping and reconnecting.** This is the most common failure at an event and v5 handles it
badly. The registry is keyed by connection: every socket connection appends a new scouter
record, keyed by connection time, and nothing looks for an existing entry. So a scouter who
drops and returns appears twice in the admin view until the stale record is pruned a minute
later (F-20). During that minute the stale record still counts as scouting, which keeps
auto-starting everyone else (F-22), while the robot it held has already been returned to the
pool and may be handed to someone else (F-21), which breaks the rule that no robot is ever
scouted by two people at once. A page reload is worse than a socket blip, because client state
is held only in memory and the scouter lands back at sign-in (F-23).

The two problems share a root cause. Identity in v5 is a connection, and a connection is
exactly the thing that is unreliable in a venue.

## Decision

**Sessions are keyed by scouter identity**, the student ID from ADR 0004, not by socket or
connection time. A reconnecting scouter resumes their entry, so one person is one row.

**An assignment belongs to the scouter, not the connection.** A disconnected scouter keeps
their robot, and that robot is not offered to anyone else. An admin can release it explicitly
when someone is not coming back. A scouter who was scouting comes back scouting, on the same
match and robot, without being re-prompted.

**Session state survives a reload**, not just a socket blip. The client persists identity,
match, robot and status.

**Disconnected scouters stay visible** to admins, marked as such, instead of vanishing on a
timeout. The timeout existed only because entries were keyed by connection.

**Three start rules, all explicit.** Admin force-start, scoped to the scouters on the current
match. A configurable quorum, counting connected waiting scouters, defaulting to six so
today's behavior is preserved. And start-on-first-scouter, the issue 34 behavior, configurable
and **off by default**.

**Every rule states whether it counts disconnected scouters.** Start triggers and the quorum
count connected scouters only. Robot retention and the admin view include the disconnected.

## Consequences

- The transport becomes replaceable without touching the session model, which is what makes
  the move off Socket.IO (ADR 0001) safe.
- Sign-in must establish identity before a session exists, so the roster pick-list of ADR 0004
  is on the critical path for phase 2 rather than a later refinement.
- Two scouters cannot share a device by reloading the page, because the session is tied to the
  identity that signed in. Switching users becomes an explicit sign-out.
- Retaining assignments means an abandoned robot stays unscouted until an admin releases it.
  The admin view has to make that visible, which is why disconnected entries persist.
- Reconnection gets its own test suite (T-6a) rather than a line item, because every one of
  these defects is a race that only shows up under real connection loss.
