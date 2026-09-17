# 02 — Architecture and Non-Functional Requirements

## Technology stack (as built)

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (`package.json` engines `16.x`, `.nvmrc` `16`, Dockerfile uses `node:18-slim`) |
| HTTP | Express 4, `body-parser` (JSON + urlencoded), EJS views |
| Realtime | Socket.IO 4 (server attached to the HTTP server; client from `/socket.io/socket.io.js`) |
| Database | MongoDB via Mongoose 7 |
| HTTP client | axios (server → TBA/FMS and server → its own endpoints) |
| Other deps | `qrcode` (unused server-side), `simple-statistics` (server CSV route imports it), `chalk` (console), `dotenv`, `express-session` (unused), `google-auth-library` (Google sign-in verification, non-functional feature), `nodemon` (dev start) |
| Frontend | Vanilla JS (no bundler, no framework), EJS partials, CSS custom properties, Plotly 2.8.3 (CDN), fuzzysort 1.2.1 (CDN), simple-statistics 7.8.0 (CDN), html5-qrcode (vendored), qrcode.js + jsqr (vendored), Font Awesome 6.1 (CDN), Google Fonts Cairo/Saira/Tajawal/Zilla Slab |
| Offline | Service worker `/sw.js` (cache-first with background refresh; network-first for dataset), IndexedDB, localStorage |

A rewrite is free to choose different technologies but MUST preserve the behaviors below.

## Boot sequence (`src/app.js`)

- **AR-1** The server listens on `process.env.PORT || 8080`.
- **AR-2** If `config/config.json` does **not** exist, the server mounts only the setup wizard
  at `/` and logs "config.json not detected! First time setup flow enabled".
- **AR-3** If it exists:
  1. Legacy check: if `EVENT_NUMBER` is numeric (v4 config), it is deleted from the config
     and the file rewritten.
  2. `ScoutingSync` (Socket.IO layer) is initialized with the HTTP server; it fetches the
     event's matches once at boot to seed the "current match" (first match, or an empty
     placeholder `{number:0, match_string:"", robots:{red:[],blue:[]}}`).
  3. Routers are mounted: `/config`, static `src/public`, `/` scouting, `/analysis`,
     `/admin`, `/qrscanner`, `/edit`, `/setup`, `/schedule`.
- **AR-4** Configuration is read with `require()` at load time; changes require a process
  restart. The setup wizard and admin "Restart Server" call `process.exit()` and rely on the
  process manager (nodemon, pm2, Cloud Run) to restart it.
- **AR-5** The server makes HTTP calls to itself (`axios.defaults.baseURL = http://localhost:PORT`)
  for: manual schedule (`/schedule/api/matches`, `/schedule/api/tempTeams`), and the CSV export
  (`/analysis/api/dataset`, `/analysis/api/manual`, `/config/analysis-pipeline.json`,
  `/analysis/transformers2.js`). A rewrite should replace these with in-process calls.

## Module layout convention

Every feature lives in `src/<feature>/` with:

- `<feature>.js` — Express router: serves `public/` statically, renders `views/index.ejs` at
  `/`, mounts `routes/api.js` at `/api`.
- `public/css/{global,internal,style,ui-elements}.css` and `public/js/*.js` — each feature
  ships its own copy of shared CSS/JS (Modal, Popup, theme bootstrap). A rewrite should share
  these.
- `views/index.ejs` — a full HTML document with PWA meta tags, icons, fonts.

Shared assets are in `src/public/` (icons, images: `field.svg`, `half-field.svg`, `logo.svg`,
spinners, `flag.png`, `gear.svg`, `menu-button.svg`, TBA tutorial videos, OPR key screenshot).

## Server-generated client bundles

- **AR-6** `GET /executables.js` concatenates every file in `src/scouting/executables/` after
  `var executables = {}` (cached in memory after first request). Each file registers
  `executables["name"] = { execute(button, layers, ...args), reverse(button, layers, ...args) }`.
- **AR-7** `GET /analysis/modules.js` concatenates `src/analysis/modules/*/index.js` and appends
  `const moduleClasses = { Bar, Pie, ... }` mapping folder names to classes. (Not cached — the
  cache assignment is commented out.)
- **AR-8** `GET /analysis/modules.css` concatenates `src/analysis/modules/*/style.css`.
- **AR-9** `GET /analysis/transformers.js` builds `getTransformers()` from a template plus every
  transformer file, extracting code between `__TMP__ … __/TMP__` and `__TEAM__ … __/TEAM__`
  markers (see document 09 and `TRANSFORMERS_README.md`). `GET /analysis/transformers2.js`
  is the CommonJS variant used by the server-side CSV route via `eval`.
- **AR-10** `GET /config/*.json` serves `match-scouting.json`, `qr.json`,
  `analysis-modules.json`, `analysis-pipeline.json` verbatim, and `config.json` with the
  `secrets` object removed.

## Client architecture

- Single-page scouting client: `views/index.ejs` includes every file in `views/pages/` as a
  hidden `div.page`; `switchPage(name)` toggles the `visible` class. Pages: `landing`,
  `form`, `waiting`, `match-scouting`.
- Analysis, admin, edit, setup, schedule, qrscanner are separate full pages.
- Shared client utilities duplicated per feature: `Modal` (blind, close icon, `.header()`,
  `.text()`, `.image()`, `.action(label, fn)`, `.dismiss(label)`, `.center()`, admin variant
  adds `closable` flag and `.scale(factor)`), `Popup(type, text, duration)` with types
  `error` (prefix "Error: ", red), `notice` (accent), `success` (green), `createDOMElement`,
  `showFade/hideFade`, `getPath/setPath`, `loadAround` (loading bar).

## Offline model

- **AR-11** The scouting page and analysis page register `/sw.js`. The service worker
  pre-caches an explicit list of scouting, analysis, qrscanner, config, icon, and external
  (CDN) URLs on install (cache name `scouting-cache-v1`).
- **AR-12** Fetch strategy: for `/analysis/api/dataset` network-first with cache fallback;
  for everything else cache-first, then network, and the network response is written back
  to the cache only if the URL is in the pre-cache list.
- **AR-13** The setup page unregisters all service workers on load (so config edits are not
  masked by stale caches).
- **AR-14** Scouting TMPs are stored in IndexedDB (`development2` database, object store of the
  same name, key `matchId`) until a successful sync clears the store.
- **AR-15** QR-scanned TMPs that fail to POST are cached in `localStorage.teamMatchPerformances`
  (array of JSON strings) and re-synced when the scanner page loads online.
- **AR-16** A scouter who never connects is in **offline mode**: the form shows match and
  robot number fields; submission goes straight to a QR code.

## Theming and visual system

- **AR-17** Light/dark theme stored in `localStorage.theme` (`light` default) and applied as
  `data-theme` on `<html>`; every page bootstraps it on load. Landing settings menu toggles it.
- CSS variables (light): `--bg #efefef`, `--text #232323`, `--bg-alt #fefefe`,
  `--accent #30a2ff`, `--accent-alt #ff6030`, `--error #ff5166`, `--green #4caf50`,
  `--gray #757575`, `--light-gray #bebebe`, `--placeholder #a3a3a3`, `--border-radius 16px`,
  `--font Cairo`. Dark overrides: `--bg #191b1c`, `--text #efefef`, `--bg-alt #232323`,
  `--accent #4798b6`, `--green #75c077`.
- Plotly charts read these variables at render time for paper/plot background, text, and
  grid colors so charts follow the theme.
- Scouting button color classes available in CSS: `silver`, `timer`, `gray`, `red`, `sherbert`,
  `blue2026`, `lightblue2026`, `orange2026`, `fuel2026`, `deepBlue`, `shallowBlue`, `coral`,
  `lightCoral`, `darkCoral`, `bluegreen`, `lightbluegreen`, `darkbluegreen`, `navy`, `orange`,
  `pink`, `green`, `yellow`, `rating-lowest`, `rating-second-lowest`, `rating-second-highest`,
  `rating-highest`; state classes `pressed`, `highlight`, `disabled`.

## Security model (as built)

- **AR-18** One shared secret, `secrets.ACCESS_CODE`, compared against the raw `Authorization`
  header (no scheme prefix). Endpoints return `{status: 1}` (ok), `{status: 0}` (wrong), or
  `{status: 2}` (no code configured / demo → no auth required).
- **AR-19** The scouting client, analysis page, QR scanner, data read endpoints
  (`/admin/api/data`, `/analysis/api/dataset`, `/analysis/api/csv`), TMP write endpoints
  (`/qrscanner/api/*`, Socket.IO `teamMatchPerformances`), flagging, and deletion are
  **unauthenticated** in the current code. Document 12 lists this as a rewrite decision.
- **AR-20** Secrets never leave the server via `/config/config.json`; the setup API returns
  them only with a valid access code (or when none is set).

## Deployment topology

- **AR-21** Single server process holds in-memory state (scouter registry, current match,
  manual schedule, TBA caches). Horizontal scaling is not supported; the Cloud Run script sets
  `--max-instances 1` and `--session-affinity`.
- **AR-22** Config directory must be writable and persistent (setup writes `config.json`;
  Cloud Run mounts a GCS bucket at `/app/config`).
- **AR-23** `config.json` and `config.bak.json` are git-ignored.
- **AR-24** (rewrite constraint) The rewrite targets AWS EC2 and Google Cloud and must be
  cloud-neutral; see documents 10 and 15. **[A-48]** Team 3061 runs bare Node behind nginx on
  EC2 with MongoDB Atlas; Docker is acceptable. **[A-43]** Google Cloud must stay easy for other
  teams; AWS may involve manual steps.
- **AR-25** **[A-4]** Preferred stack mirrors the maintainer's software-engineering course:
  Next.js, Tailwind, MongoDB.

## Non-functional requirements

- **NF-1** Scouting UI is designed for landscape phones/tablets (`manifest.json`
  `display: fullscreen`, `orientation: landscape`), touch-first, large grid buttons with
  press feedback (`pointerdown` → `.pressed`, cleared 90 ms after release).
- **NF-2** Install prompt: on `beforeinstallprompt` show a modal "SPOT is better when you
  install the app!" with Install / Maybe Later (once per page load).
- **NF-3** Timer accuracy: match clock derived from `Date.now()` deltas (not accumulated
  intervals), updated every 10 ms, displayed with two decimals.
- **NF-4** Analysis must function with the cached dataset when offline (event switching and
  live TBA fetches will not).
- **NF-5** Admin views poll every 2.5 s (scouters and matches). **[A-50]** A 2–3 s delay
  between an admin action and scouters seeing it is acceptable; sub-second push is not required.
- **NF-6** TBA responses for matches and COPRs are cached server-side for 5 minutes.
- **NF-7** All pages include PWA meta tags, favicons, Apple touch icon, and `manifest`.
  **[A-27]** Scouters primarily use personal phones; PWA install usage is unknown.
- **NF-9** **[A-46]** Accessibility is a requirement (helps everyone); localization is not.
  All controls need accessible names (document 16, BL-7).
- **NF-10** **[A-47]** Keep the SPOT name and logo; fonts and color palette may change.
- **NF-11** **[A-26]** Scale target: about 6 concurrent scouters plus 1–2 admins, ~450 TMPs per
  event, ~6 events per database, a new database each season.
- **NF-8** (rewrite requirement, added 2026-09-16) The rewrite MUST ship an automated test
  suite that verifies existing features so new features can be merged without repeating the
  manual System Test Plan by hand. The current code base has no tests (`npm test` is a
  placeholder). Coverage expectations, layers, and the mapping from the manual plan are in
  document 12, section "Automated testing requirements".
