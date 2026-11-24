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

## Implementation (2026-11-24, #354)

Server-sent events work, so the time-box closes without falling back to polling for devices.
`tests/e2e/scouter-stream.spec.ts` shows an assignment reaching a browser within the 2 to 3 s
allowed, through `next start` and through `next dev` (`E2E_NEXT=dev`). nginx and Cloud Run are
tested when their recipes are built (gate W-3); if either buffers or cuts the stream in a way
reconnecting cannot absorb, devices switch to polling then.

- **Device to server:** `POST /api/scouter/sign-in` and `POST /api/scouter/action` (accept,
  start, finish, ready, sign-out), replacing `updateState` (RT-1).
- **Server to device:** `GET /api/scouter/stream`, with the events `state` (always first, so
  every reconnect resynchronizes), `assigned`, `enter-match`, `unassigned` and `signed-out`. It
  sends `retry: 3000` and a heartbeat comment every 20 s, with `Cache-Control: no-cache,
no-transform` (so compression does not buffer it) and `X-Accel-Buffering: no` (so nginx does
  not).
- **Identity:** each device makes a random device id once and keeps it. Signing in binds the
  scouter's session to it, and the stream and every action must name the same pair, so knowing a
  student ID is not enough to act as that scouter. Signing in on another device moves the session
  there and signs the old device out.
- **Kick:** a signed-out device closes its stream itself, and the server answers a stream for a
  session it no longer has with 401, which stops a browser's automatic reconnects.
- **Admin views poll** `GET /api/admin/registry` every 2 to 3 s (NF-5). An admin stream can come
  later if polling proves too slow.
- **One process owns the registry** (`src/sessions/runtime.ts`, on `globalThis`), and applies
  events one at a time.
