# SPOT — Scouting Platforms On Time

SPOT is an open-source FRC scouting platform by **Team 3061 Huskie Robotics**.
Version 6 is a complete rebuild: everything a team used to configure by editing JSON files
— the scouting buttons, the match timer, point values, the analysis pipeline and the
dashboard — is now built **in the browser**, with live previews, and saved as a *project*.

| | |
|---|---|
| **Scouting** (`/`) | Phone-friendly scouting app. Scouters sign in, get assigned a robot, and tap buttons during the match. Works offline; falls back to a QR code. |
| **Admin** (`/admin`) | Run the event (pick matches, watch scouters, remove phones), review/flag/delete data, scan QR codes, scouter accuracy, event settings — and the **project builder**. |
| **Analysis** (`/analysis`) | Team pages, compare teams, filter teams, match simulation, pick list, CSV export. Browse any event with any project. |

## Projects

A project is one season's configuration. Create one from a template (2022–2026 seasons
are included, converted from the legacy config files) or from scratch, then edit it in the
builder:

- **Layout** — a visual grid editor. Drag across cells to add a button; drag to move; resize
  from the corner. Each button has a type (action, timer/start/submit, undo, navigation, label),
  an action id, label, color, **points**, and *behaviors* (go to layer, filtered layer, set
  variable, ask for field position, fixed position, highlight, hide, count multiple times).
  Layers are separate screens; buttons switch between them.
- **Timing** — match length, phases (when the clock reaches a time: rename the timer, switch
  layer, set variables, pause the clock), 2026-style active/inactive **shifts**, the **A-Stop
  lock**, every **timer message**, phase-prefixed action ids, position lock, field image,
  alliance-zone buttons, 2× clock.
- **Scoring** — points per action (exact id, or by ending so `Score` also counts
  `autoScore`). Used for **scouter accuracy** and the *Points from scoring map* pipeline step.
- **Pipeline** — the analysis steps (count actions, sums, ratios, weighted sums, averages,
  cycles, ratings, …). Every step has a form; results and errors appear live on real or
  **generated sample matches**, so you can build analysis before your first event.
- **Dashboard** — the modules shown in analysis (stat lists with ranks, bar, donut, per-match
  lines, field heatmap, radar, team columns, win chance, colored grid, text, headings), each
  with a live preview.
- **Analysis settings** — TBA score-breakdown enrichment, component OPRs (picked from TBA),
  Filter Teams bands, which dashboard features are on.
- **JSON** — view or paste any part; legacy `match-scouting.json`, `analysis-pipeline.json`,
  `analysis-modules.json` and `scouter-accuracy-*.json` files are converted automatically.

**▶ Preview** runs the real scouting engine on your draft layout (jump between phases, flip
the field, switch alliance) and shows exactly which action ids would be recorded.
**Activate** makes a project the one scouters and analysis use.

## Scouter accuracy

Each scouted match's points (from the Scoring tab) are summed per alliance and compared with
the official TBA alliance score. The difference is shared among that alliance's scouters,
weighted by each scouter's past error. Each match stores the point map it was scored with, so
changing points later does not silently change old results.

## Setup

Requirements: Node 20+ and a MongoDB database (MongoDB Atlas free tier works).

```sh
npm install
cp .env.example .env.local      # then fill in DATABASE_URL, ACCESS_CODE, TBA_API_KEY
npm run dev                     # http://localhost:8080
```

SPOT reads settings from **environment variables and/or `config/config.json`**
(environment variables win). Existing v5 `config/config.json` files keep working:

| Setting | Env var | config.json |
|---|---|---|
| MongoDB URL (required) | `DATABASE_URL` or `MONGODB_URI` | `secrets.DATABASE_URL` |
| Admin access code | `ACCESS_CODE` | `secrets.ACCESS_CODE` |
| TBA read key | `TBA_API_KEY` | `secrets.TBA_API_KEY` |
| Default TBA event | `TBA_EVENT_KEY` | `TBA_EVENT_KEY` |
| Default event code | `EVENT_CODE` / `EVENT_NUMBER` | `EVENT_CODE` / `EVENT_NUMBER` |
| Flip field orientation | `SWAP_ZONE_BUTTON_LOCATIONS` | `SWAP_ZONE_BUTTON_LOCATIONS` |
| Component OPR names | `TBA_OPR_STRINGS` (comma list) | `TBA_OPR_STRINGS` |
| Demo mode | `DEMO` | `DEMO` |
| Alternate config path | `CONFIG_PATH` | — |

On first start SPOT creates the event and imports the 2025 and 2026 projects. Event,
project and scouting settings are then changed in **Admin → Event & settings**; secrets
only ever come from the environment or `config.json`.

Production: `npm run build && npm start` (set `PORT`, default 3000). Deployment recipes:
[AWS EC2 + nginx](deploy/aws/README.md) and [Google Cloud Run](deploy/gcp/deploy.sh)
(`deploy/gcp/cloudshell/deploy.sh` runs from Cloud Shell with nothing to install).
Run **one** instance: the live scouter registry is held in memory.

## Migrating from SPOT v5

- The database collections `teamMatchPerformances` and `events` are read as-is; existing
  matches appear in analysis. New collections: `projects`, `settings`.
- Old config files: create a project and use **Import files**, or start from the matching
  season template. The hidden "catalog" layer is converted to *known action ids*; phase ×
  button ids are now derived automatically.
- The `/setup`, `/edit`, `/qrscanner` and `/schedule` pages are now parts of `/admin`.
- QR codes from v6 phones carry their own id list, so any action id encodes safely
  (v5 QR codes are not readable by v6).

## Development

```sh
npm test         # unit + oracle tests (vitest)
npm run lint     # TypeScript type check
npm run build
```

`tests/oracle.test.ts` replays real 2025 and 2026 event data through the pipeline engine
and requires the output to match the legacy SPOT golden files in `tools/oracle/`.
The requirements this rebuild follows are in [`claude/`](claude/README.md).

Code map: `src/lib/scouting/engine.ts` (scouting state machine, shared by the app and the
builder preview), `src/lib/analysis/transformers.ts` (pipeline steps + their form metadata),
`src/lib/analysis/moduleDefs.ts` + `src/components/analysis/modules.tsx` (dashboard modules),
`src/lib/project/legacy.ts` (v1–v5 importer), `src/app/api/**` (route handlers),
`src/components/builder/**` (project builder).

## License

See [LICENSE](LICENSE). Contributions welcome — see [CONTRIBUTING](.github/CONTRIBUTING.md).
