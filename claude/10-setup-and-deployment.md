# 10 — Setup Wizard, Configuration Lifecycle, Deployment, Migration

## First-run flow

- **ST-1** With no `config/config.json`, every request to `/` renders the setup wizard and no
  other routes exist. No access code is required (`REQUIRE_ACCESS_CODE` false).
- **ST-2** With a config present, the wizard is served at `/setup` and requires the access code
  if one is set (`GET /setup/api/auth`).
- **ST-3** The setup page unregisters all service workers on load.

## Setup form (fields, in order)

1. **Access Code** (required) — explanatory text that it is needed for admin and config.
2. **MongoDB Setup** — Database URL (required), with example
   `mongodb+srv://<username>:<password>&<clusterurl>/myFirstDatabase?retryWrites=true&w=majority`.
3. **TheBlueAlliance Setup** — TBA API Key (required), with an embedded tutorial video
   (`/img/TBA_API_KEY.webm`).
4. **FIRST Robotics Setup** — FRC API username and key (marked required in HTML but optional
   in practice; empty values are omitted from the config).
5. **Google Sign-In Setup (Coming Soon, optional)** — disabled Client ID / Client Secret inputs.
6. **Event Setup** — TBA Event Key (required) with tutorial video (`/img/TBA_EVENT_KEY.webm`);
   Event Number `<select>` of existing event codes plus a **Generate event code** button.
7. **Demo Mode** toggle.
8. **Switch Scouting Zone Buttons Location** toggle (`SWAP_ZONE_BUTTON_LOCATIONS`).
9. **TheBlueAlliance OPR Strings** — a list of text inputs (one per key) with **Add OPR
   String**, a screenshot of 2026 COPR keys, defaults pre-filled (CF-3).
10. Hidden `VERSION = "1.0"`.
11. **Submit**.

## Setup behaviors

- **ST-4** On load with a valid code, `GET /setup/api/config` returns the current config with
  `EVENT_NUMBER` translated from ObjectId to its event code string; the form is prefilled.
- **ST-5** Event dropdown: `GET /setup/api/events` (header `database-url` JSON
  `{ databaseURL }`, defaulting to the saved URL) lists `events.code` sorted descending.
  Selecting/blurring a code sets the TBA Event Key to the part before `_` if it differs.
- **ST-6** Generate event code: requires a TBA Event Key; prompts "Enter new event name:";
  candidate = `<key>_<name>`; `POST /setup/api/createEventCode { databaseURL, eventCode }`
  → `201` created, `409` already exists (alert), otherwise alert with the error; on success
  the option is added and selected.
- **ST-7** Submit builds `{ secrets: {...}, ...rest }` from the form (empty values omitted;
  secret keys: `ACCESS_CODE`, `DATABASE_URL`, `TBA_API_KEY`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `FMS_API_KEY`, `FMS_API_USERNAME`), sets `DEMO` and
  `SWAP_ZONE_BUTTON_LOCATIONS` booleans from the toggles and `TBA_OPR_STRINGS` from the
  inputs (`string_1..N`), and POSTs `{ ACCESS_CODE: <code used to sign in>, config }` to
  `/setup/api/config`.
- **ST-8** Server validation, in order: access code (if required) → try MongoDB connection
  (`DATABASE_URL failed to connect!`) → try TBA `GET /team/frc3061` with the key
  (`Invalid TBA_API_KEY!`) → translate `EVENT_NUMBER` code to ObjectId (must exist) → default
  `DEMO=false` if absent → write `config/config.json` (unformatted JSON) → respond
  `{ success: true }` → `process.exit()`.
- **ST-9** Client shows "Config Saved — Restart the server then reload to complete setup" with a
  Reload action, or "Config Not Saved" with the reason.

## Event code lifecycle

- Event codes are created only through the wizard (or directly in MongoDB). Data for an event
  is isolated by `eventNumber`; the analysis page can browse any event via the dropdown; the
  scouting client always writes to the configured event.
- The recommended season workflow (README): create a new database per season; use a new event
  code per event (and labels such as `official`, `practice`, `debugging`).

## Migration from SPOT v4

- **ST-10** v4 stored `eventNumber` as an integer and `EVENT_NUMBER` as a number. v5 detects a
  numeric `EVENT_NUMBER` at boot and removes it (forcing re-selection in setup) and detects
  TMPs without `eventNumber` in the admin page (modal with migration guide link).
- **ST-11** `src/lib/databaseMigrator.js` is a manual script: connect with the config URL,
  print distinct `eventNumber` values, then (after editing the arrays in the file) convert
  integer `eventNumber`s to the ObjectIds of the matching event codes using an aggregation
  update. Not wired to any route.

## Running locally

- `npm i`, `npm start` (nodemon `src/app.js`), open `http://localhost:8080/`.
- VS Code launch configs: "SPOT Server" (npm start), "SPOT Client Chrome/Firefox" against
  `http://localhost:8080`.
- Prettier is the formatter (`.prettierignore` present).

## Docker / Google Cloud Run (`deploy/gcp`)

- **ST-12** Dockerfile: `node:18-slim`, `npm ci --omit=dev`, copies `src/` and `config/`,
  `PORT=8080`, `CMD node src/app.js` (nodemon not used in production).
- **ST-13** `deploy.sh` (local gcloud) and `cloudshell/deploy.sh`: enable Run/Build/Storage/
  Artifact Registry APIs; wait for service accounts; grant IAM roles; create a `gcr.io`
  Artifact Registry repo; create a GCS bucket `<project>-spot-config` seeded with all
  `config/*.json` **except** `config.json`; build with Cloud Build; deploy with
  `--allow-unauthenticated --port 8080 --session-affinity --min-instances 0 --max-instances 1
  --memory 512Mi --cpu 1 --timeout 300 --execution-environment gen2` and the bucket mounted at
  `/app/config` so the wizard's `config.json` persists across revisions. Region default
  `us-central1`; env overrides `GCP_REGION`, `CLOUD_RUN_SERVICE`, `CONFIG_BUCKET`.
- **ST-14** After deploy, the operator visits the service URL to run `/setup`; because the
  process exits after saving, Cloud Run restarts the container.

## Rewrite hosting targets (decided 2026-09-16)

- **AWS EC2** (Team 3061's own deployment) and **Google Cloud** (other teams) are the two
  supported targets for the rewrite; serverless platforms are out of scope. Requirements
  this imposes on the rewrite: one cloud-neutral Docker image, settings stored in MongoDB and
  secrets in environment variables instead of a writable config directory, single-instance
  operation on both clouds, a reverse proxy configured for long-lived streaming responses,
  and deploy recipes under `deploy/aws` and `deploy/gcp`. Details in document 15.

**[A-48]** Team 3061 runs bare Node behind nginx on EC2 (Docker acceptable) with MongoDB Atlas;
Atlas is the database on every cloud. **[A-43]** GCP must remain easy for other teams; AWS
may require manual steps. **[A-15]** Restart-to-apply is acceptable but hot reload is nicer.
**[A-32]** The maintainer asks for a recommendation on a more secure yet easy first-run
workflow; see document 12, "Resolved decisions", R-32.

## Other documented hosting paths (Quickstart) — **[A-44] no longer supported**

- Glitch import from GitHub (auto-installs and runs; complete setup form).
- AWS EC2 AMI "Huskie Robotics SPOT 1.0.1" with nginx + certbot + pm2 (`pm2 restart app`),
  local MongoDB at `mongodb://localhost:27017/spotDatabase?retryWrites=true&w=majority`.
- README mentions Render as the easy deployment target.
- MongoDB Atlas is the recommended database; local MongoDB Community Server works for dev.

## Configuration change procedure (for configurers)

1. Edit `config/match-scouting.json`, `analysis-pipeline.json`, `analysis-modules.json` (or
   swap in an archived year file).
2. Restart the server (bundles for executables/modules are cached in memory; configs are
   fetched by clients on load).
3. On devices, reload the scouting/analysis pages; service worker caches refresh in the
   background (cache-first), so a second reload may be needed.
