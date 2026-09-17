# 15 — Proposed Rewrite Technology Direction and Implications

Status: **proposal under consideration** (recorded 2026-09-16). Nothing here changes the
behavioral requirements in documents 01–13; it records a candidate stack and what adopting
it implies for those requirements.

## Proposed stack

| Concern | Current | Proposed |
|---------|---------|----------|
| Framework | Express 4 + EJS + vanilla JS, no build step | **Next.js** (App Router assumed) |
| Styling | Hand-written CSS with custom properties, per-feature copies | **Tailwind CSS** with **shadcn/ui** components, theme generated with **tweakcn** |
| Realtime | **Socket.IO** (bidirectional, acks, presence) | **Server-Sent Events (SSE)** for server→client plus `fetch` for client→server — *open question* |
| Data | MongoDB via Mongoose | unchanged (assumed) |

## Part 1 — Can Socket.IO be replaced with SSE?

### What the socket is actually used for

Document 06 inventories every message. Restated by direction and by the property each needs:

| Message | Direction | Needs reply? | Frequency | Payload |
|---------|-----------|--------------|-----------|---------|
| `updateState` | client → server | yes (ack) | a few times per match per scouter | small JSON |
| `syncData` | client → server | yes (list of ids to upload) | on connect and after each submit | array of strings |
| `teamMatchPerformances` | client → server | yes (ack) | once per submit | one or a few TMPs |
| `updateState` (assignment, force-start) | server → client | no | on admin actions and registry changes | small JSON |
| `enterMatch` | server → client | no | once per match | none |
| `adminDisconnect` | server → client | no | rare | none |
| `syncRequest` | server → client | no | never triggered today | none |
| connection / `disconnect` | both | — | per device session | — |

Properties required: (a) reliable request/response for the three client→server messages,
(b) low-latency push of small notifications to a specific scouter, (c) presence, i.e. the
server must know which scouters are currently connected (assignment skips disconnected
scouters and prunes them 60 s after disconnect), (d) the ability for an admin to kick a
device.

Not required: high-frequency or binary traffic, server-initiated request/response (the only
candidate, `syncRequest`, is dead code), client-to-client messaging. The match timer is
purely client-local.

### Verdict

**Yes, SSE plus fetch is sufficient**, provided the conditions below are met. Every
client→server message maps naturally to an HTTP request whose response *is* the ack, which
is more robust than Socket.IO acks (retries are trivial and idempotent thanks to
`matchId`). Every server→client message is a small one-way notification, which is exactly
what SSE is for.

### Mapping

| Socket.IO | SSE / HTTP equivalent |
|-----------|-----------------------|
| `socket.emit("updateState", s, ack)` | `POST /api/scouter/state` → 200 with the merged state |
| `socket.emit("syncData", ids, cb)` | `POST /api/tmps/sync-check { matchIds }` → `{ requested: [...] }` |
| `socket.emit("teamMatchPerformances", tmps, ack)` | `POST /api/tmps { tmps }` → 201 |
| server `emit("updateState")` / `emit("enterMatch")` / `emit("adminDisconnect")` | named events on `GET /api/scouter/stream?session=<id>` |
| `socket.id` / connection object | a **client-generated session id** (UUID in localStorage) sent as a query param on the stream and a header on every POST |
| `socket.on("disconnect")` | stream `close`/`abort` on the server (`req.signal`) plus a heartbeat timeout |
| `socket.disconnect()` (kick) | send `adminDisconnect`, close the stream, and mark the session as kicked so a reconnect is rejected with 403 |
| Admin polling every 2.5 s (`/api/scouters`, `/api/matches`) | one admin SSE stream broadcasting registry and match changes (optional improvement) |

### Conditions and implications of choosing SSE

1. **Presence needs a heartbeat.** TCP close detection on mobile networks can lag by minutes.
   The server must send a comment frame (`: ping`) every 15–30 s and treat a stream whose
   write fails, or a session that has not reconnected within the 60 s grace period, as
   disconnected. Socket.IO does this for you today; SSE does not.
2. **Reconnect must resynchronize.** `EventSource` auto-reconnects (honoring a `retry:` hint)
   but has no session; on every (re)connect the client must re-POST its full state and the
   server must re-send the current assignment. This replaces the client's existing
   "run `onConnect` once" and 1 s fallback logic (SC-43) and fixes today's quirk where a
   reconnect creates a *new* scouter object keyed by timestamp.
3. **Kick must defeat auto-reconnect.** On `adminDisconnect` the client must call
   `EventSource.close()` itself; otherwise the browser reconnects immediately. The server
   should also reject the session id until the scouter signs in again.
4. **Single writer of in-memory state.** Today the scouter registry, current match, and
   manual schedule live in one process (document 03). With SSE the same constraint holds:
   the process that owns the registry must be the one holding every stream. Cloud Run with
   `max-instances 1` (document 10) satisfies this. If the rewrite is deployed to a serverless
   or multi-instance platform, the registry and a pub/sub channel must move to a shared store
   (MongoDB change streams or Redis) — this is true for Socket.IO as well, so SSE does not
   make it worse.
5. **Hosting must allow long-lived streaming responses.** Cloud Run does (request timeout is
   configurable; the current deploy sets 300 s, so streams will be cut every 5 minutes and
   `EventSource` will reconnect — acceptable given condition 2, or raise the timeout).
   Vercel serverless functions cap duration and are a poor fit for both SSE and WebSockets;
   if Vercel is a target, realtime should be delegated to a managed service or the app
   self-hosted. Reverse proxies need `Cache-Control: no-cache`, `Connection: keep-alive`,
   and buffering disabled (`X-Accel-Buffering: no` for nginx).
6. **Browser connection limits.** HTTP/1.1 browsers allow about six concurrent connections per
   origin, and each `EventSource` holds one. Scouter devices use one tab, so this is fine;
   serve over HTTP/2 (Cloud Run does) to remove the concern entirely.
7. **Background tabs.** iOS Safari and Android Chrome suspend both `EventSource` and WebSocket
   connections in the background; neither option is better here. The reconnect-and-resync
   rule (condition 2) makes SSE tolerant of it.
8. **Offline flow gets simpler.** Sync becomes plain HTTP POSTs that can be retried, queued
   by a service worker, and de-duplicated server-side by `matchId`/`matchId_rand`
   (document 03). The QR fallback and IndexedDB buffering are unaffected.
9. **Next.js fit.** Socket.IO requires a custom Node server wrapping Next (losing some
   deployment flexibility and the standard `next start`), whereas SSE is a normal route
   handler returning a `ReadableStream` with `export const dynamic = "force-dynamic"` on the
   Node runtime. This is the main reason SSE is attractive for this stack.
10. **When WebSockets would still be the right call.** If a future feature needs
    server-initiated request/response, high-frequency updates (for example live mirroring of a
    scouter's action queue to the admin at 10 Hz), or client-to-client messaging, keep a
    WebSocket layer (custom server, or a managed provider such as Ably/Pusher). None of the
    current requirements need it.

A cheaper interim alternative is short polling (2–3 s) for scouters as the admin page already
does; assignment latency of a few seconds is acceptable for this workflow, and polling has
none of the streaming-infrastructure concerns. SSE is preferred for responsiveness, but the
spec should not make sub-second push a hard requirement.

## Hosting context (decided 2026-09-16)

- **Team 3061 will host the rewrite on AWS EC2** (a long-running VM). Other teams may host
  it on **Google Cloud** (Cloud Run as today, or a VM). The rewrite must therefore be
  **cloud-neutral**: no dependency on a provider-specific service for core function.
- Consequences for the realtime choice above:
  - EC2 is the easiest possible target for SSE: one Node process (`next start` under pm2 or
    systemd) behind nginx or an ALB, no request-duration cap (ALB idle timeout defaults to
    60 s and should be raised or covered by the heartbeat), one instance owning the in-memory
    registry. Conditions 4 and 5 are satisfied by default.
  - Cloud Run remains supported with `max-instances 1`; the stream-cut-every-timeout behavior
    is covered by resync-on-reconnect.
  - Serverless platforms are explicitly **out of scope**, which removes the strongest argument
    against long-lived connections and makes either SSE or WebSockets viable. SSE is still
    preferred for the Next.js fit (no custom server).
- Consequences for configuration and state storage:
  - On EC2 the filesystem is persistent, so file-based config would work, but to stay
    cloud-neutral and avoid the GCS-bucket mount used today, store editable settings in
    MongoDB and secrets in environment variables (a `.env` file on EC2, environment
    variables on Cloud Run). Do not exit the process to apply changes.
  - The scouter registry may stay in memory on both targets because both run one instance;
    document the single-instance requirement rather than adding Redis.
- Delivery artifact: one Docker image (already the Cloud Run path) that runs identically on
  EC2 (`docker compose` with nginx and optional local MongoDB) and Cloud Run. Provide both
  a `deploy/aws` and a `deploy/gcp` recipe; keep MongoDB Atlas as the recommended database
  for both so the database is not cloud-specific either.
- nginx/ALB settings needed for SSE on EC2: `proxy_buffering off`, `proxy_read_timeout`
  above the heartbeat interval, `proxy_http_version 1.1`, HTTPS via certbot or ACM, and
  HTTP/2 to lift per-origin connection limits.

## Part 2 — Implications of Next.js

- **Extension model decision [A-5, A-49].** Runtime discovery of drop-in files is preferred and
  the model must stay usable by students without programming experience. In Next.js this
  means option (b) below for custom code: a route handler that reads `extensions/{transformers,
  modules,executables}/` at runtime and serves them as plain scripts registered on a small
  runtime API (`spot.registerTransformer(...)`), outside the compiled bundle. Built-in
  transformers/modules ship inside the bundle with TypeScript types; a generator tool that
  scaffolds a new extension file is acceptable. Configuration (JSON) remains the primary
  customization path and needs the editor/validator from BL-239.
- **Transport decision [A-50].** A 2–3 s delay is acceptable, so short polling is sufficient;
  SSE remains the preferred implementation for responsiveness, and the nginx notes below
  apply either way. **[A-48]** nginx fronts bare Node on EC2, so `proxy_buffering off` and
  `proxy_read_timeout` settings belong in the AWS recipe.
- **Runtime code generation must be redesigned.** Today the server concatenates files at
  request time to produce `/executables.js`, `/analysis/modules.js`, `/analysis/modules.css`,
  and `/analysis/transformers.js` (marker-based extraction). In Next.js the client bundle is
  built ahead of time, so drop-in discovery must become either (a) a build-time registry
  (an index file that imports every transformer/module/executable), or (b) a route handler
  that reads the folders at runtime and serves them as plain scripts loaded outside the
  bundle. Option (a) is the idiomatic choice and also gives TypeScript typing of transformer
  options; it changes the extension model from "drop a file in a folder" to "drop a file in a
  folder and add one import line". Record this against principle P4 (document 01).
- **Shared analysis code.** Transformers run in the browser (dashboard) and on the server
  (CSV). In Next.js they can be one TypeScript module imported by both a client component and
  a route handler, eliminating the `transformers2.js` + `eval` path (document 12, S-5, F-7).
- **Configuration storage.** The setup wizard writes `config/config.json` and the process
  exits to reload it. Next.js route handlers can read the filesystem at runtime on Node, but
  serverless targets have read-only filesystems, and `process.exit()` is not an acceptable
  reload mechanism. Store `config.json`-equivalent settings in MongoDB (or env vars for
  secrets) and read them per request with a short cache. The four game-config JSON files
  (`match-scouting`, `analysis-pipeline`, `analysis-modules`, `qr`) can stay as files served
  from a route handler or be stored in the database with an upload UI.
- **Pages become client components.** The scouting SPA, admin dashboard, analysis dashboard,
  edit, QR scanner, and setup pages are all stateful, DOM-heavy, and offline-sensitive; they
  should be `"use client"` components with minimal server rendering. Next.js contributes
  routing, API routes, TypeScript, and the build pipeline rather than SSR.
- **PWA/offline.** See document 18 for the full requirement set (OF-1 to OF-9); the summary
  here is the implementation consequence. The hand-written service worker with a hard-coded precache list
  (document 02, AR-11) cannot survive hashed build assets. Use an injected-manifest approach
  (Serwist or Workbox `injectManifest`) for the app shell, and keep explicit runtime caching
  rules for `/api/...dataset` (network-first) and config endpoints (stale-while-revalidate).
  Do not precache third-party CDN URLs (F-16); self-host Plotly and fonts instead.
- **Plotly.** Must be loaded client-only (`next/dynamic` with `ssr: false`); it is large
  (~3 MB). The modules use `histogram2dcontour`, `scatterpolar`, layout images, and theme
  colors read from CSS variables; keep Plotly unless a replacement covers those, and read
  theme colors from the shadcn CSS variables instead.
- **Mongoose connection handling.** Use the cached global connection pattern for route
  handlers; avoid connecting per request.
- **Auth.** Replace the raw `Authorization: <code>` header with a cookie set after entering the
  access code, enforced in Next.js middleware for `/admin`, `/edit`, `/schedule`, `/setup`,
  and their API routes. This also closes the unauthenticated write endpoints listed in
  document 12 (S-1) if the same middleware covers them.
- **Self-calls disappear.** The server's HTTP calls to itself (AR-5) become direct function
  calls in route handlers (document 12, D-5).
- **Testing.** The automated test requirement (document 02 NF-8, document 12 T-1 to T-10)
  fits this stack with Vitest for unit/config/golden tests, route-handler tests against an
  in-memory MongoDB, and Playwright for end-to-end and offline journeys. Because
  transformers become plain TypeScript modules shared by client and server, the pipeline is
  unit-testable without a browser, which is not possible with today's marker-based bundles.
- **Dev-mode caveat.** Next.js hot reloading recreates module scope; any in-memory registry
  must be attached to `globalThis` in development to survive reloads (same trick as the
  Mongoose connection cache).

## Part 3 — Implications of Tailwind + shadcn/ui + tweakcn

- **Theme tokens.** Map the existing palette (document 02: `--accent #30a2ff`,
  `--accent-alt #ff6030`, `--error #ff5166`, `--green #4caf50`, light `--bg #efefef` /
  `--bg-alt #fefefe`, dark `--bg #191b1c` / `--bg-alt #232323`, font Cairo) onto the shadcn
  token set (`--background`, `--card`, `--primary`, `--destructive`, …) using tweakcn to
  generate the light/dark pair. Dark mode should switch from the `data-theme` attribute to
  the `class` strategy via `next-themes`, keeping the "remember choice in localStorage"
  behavior (AR-17).
- **Config-driven button classes are a public interface.** `match-scouting.json` buttons
  carry `class: "fuel2026"` style names (document 04, CF-7) and archived configs use two dozen
  color names. Tailwind's content scanning will purge classes that only appear in JSON, so the
  rewrite must either (a) keep a small hand-written CSS file defining those legacy class names
  with theme-aware colors, (b) maintain a mapping from config class names to Tailwind classes
  and safelist them, or (c) change the config schema to `color: "#hex"` / a named palette and
  provide a converter for old configs. Decision D-1 in document 12 applies.
- **Grid layout stays inline.** `gridArea`, `gridRows`, and `gridColumns` from config are
  applied as inline styles today and can remain so; Tailwind is not involved.
- **shadcn components that map cleanly:** Dialog (Modal), Toast/Sonner (Popup), Sheet
  (mobile sidebar and settings overlay), Command (team fuzzy search), Select (bubble-graph
  axes), Checkbox + DropdownMenu (Filter Teams), Badge (rank badges `top5/top25/top50`),
  Switch (Demo and zone-swap toggles), Table (Edit page). The oversized touch buttons of the
  scouting grid should remain custom (press feedback, disabled state, highlight state, banner).
- **Charts.** shadcn's chart components wrap Recharts, which does not cover polar charts,
  2-D density contours, or background images. Keep Plotly for the module system; use
  Recharts only if a new simple module warrants it.

## Part 4 — Summary of spec changes this direction would trigger

| Spec item | Change if this stack is adopted |
|-----------|--------------------------------|
| AR-5 self-HTTP calls | removed; direct calls |
| AR-6 to AR-9 generated bundles | replaced by build-time registries |
| AR-11 to AR-13 service worker | injected-manifest PWA, no CDN precache |
| AR-17 theming | shadcn tokens, `class` dark mode, same persistence |
| AR-18 to AR-20 security | cookie session + middleware; write endpoints protected |
| AR-21 single instance | still required unless registry moves to a shared store |
| AR-22 writable config dir | replaced by DB-stored settings + env secrets (cloud-neutral); no `process.exit()` restart |
| ST-12 to ST-14 deployment | Docker image with `deploy/aws` (EC2: docker compose, nginx, pm2/systemd) and `deploy/gcp` recipes |
| RT-1 to RT-8 socket protocol | SSE stream + three POST endpoints, session id, heartbeat, resync-on-reconnect |
| NF-5 admin polling | optionally SSE broadcast |
| CF-7 button `class` | legacy class CSS, safelist map, or schema change with converter |
| ST-7 to ST-9 setup save/restart | save to DB, apply live |
| Document 14 | add questions I-1 to I-3 (hosting target, extension model, sub-second push) |

## Recommendation

Adopt Next.js + Tailwind/shadcn and replace Socket.IO with **SSE + fetch**, on the explicit
conditions of a heartbeat, resync-on-reconnect, a client session id, kick handling that
closes the `EventSource`, and single-instance hosting with streaming support. Both decided
targets (AWS EC2 for Team 3061, Google Cloud for other teams) satisfy this; keep the app
cloud-neutral by shipping one Docker image, storing settings in MongoDB, and reading secrets
from environment variables. Keep short polling as the documented fallback so no requirement
depends on sub-second push.
