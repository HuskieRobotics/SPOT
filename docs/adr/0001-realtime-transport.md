# 0001 Server-sent events, with polling as the fallback

Status: Accepted 2026-09-17. Sources: document 15 part 1, answer 50.

## Context

The v5 app uses Socket.IO for the scouter registry, robot assignment, match start and data
sync. Socket.IO is bidirectional, but almost all of the traffic is server to client: the
admin page watching scouters, and scouters waiting for an assignment. Client to server
traffic is infrequent and fits ordinary HTTP requests.

The maintainer confirmed that a delay of two to three seconds is acceptable for every one of
these flows. Nothing in SPOT needs sub-second push.

## Decision

Use server-sent events for server-to-client updates and ordinary route handlers for
client-to-server actions. Short polling every two to three seconds is an acceptable fallback
and is the answer if server-sent events prove awkward behind nginx or through a venue's
network.

Do not add a custom WebSocket server. One instance owns the in-memory registry, so the
transport does not need to survive horizontal scaling.

## Consequences

- nginx needs `proxy_buffering off`, `proxy_read_timeout` above the heartbeat interval and
  `proxy_http_version 1.1` on the event-stream route. This belongs in the AWS recipe.
- HTTP/2 lifts the per-origin connection limit that would otherwise bite when several tabs
  are open on one tablet.
- The client must treat a dropped stream as normal and reconnect, because venue networks
  drop connections constantly. Reconnection must not lose buffered scouting data.
- Time-box this in phase 2. If server-sent events fight the deployment, switch to polling
  rather than building infrastructure.
