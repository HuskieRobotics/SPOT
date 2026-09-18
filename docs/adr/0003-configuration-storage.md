# 0003 Game configuration in files, settings in MongoDB, secrets in the environment

Status: Accepted 2026-09-17. Sources: document 15, document 20 CS-15, R-32, answers 32 and 40.

## Context

The v5 setup wizard writes `config/config.json`, which holds the database URL, the admin
access code, the TBA key and the active event, and then the process exits so the file is
re-read. The same file mixes secrets with ordinary settings, and the wizard accepts a
database URL from the browser.

Separately, four JSON files describe the game: the scouting grid, the analysis pipeline, the
analysis modules and the QR layout. Those are the platform's public interface and are edited
by students each season.

## Decision

Three homes, by kind:

- **Secrets** come from the environment: `MONGODB_URI`, `SPOT_ADMIN_PASSWORD`, `TBA_API_KEY`.
  Never from the browser, never echoed back by an endpoint. See `.env.example`.
- **Settings** that an admin changes at an event, such as the active event and feature
  toggles, live in MongoDB and are read per request with a short cache, so changing one
  needs no restart.
- **Game configuration** stays as the four JSON files, validated by the schemas in
  `src/config/schema/`, so they can be edited in an editor with autocomplete, reviewed in a
  pull request and diffed across seasons.

There is no settings JSON file and no `config.json` in v6.

## Consequences

- The setup wizard becomes a settings page behind the admin password, editing non-secret
  settings only. This closes the database-URL and echoed-secret findings.
- `process.exit()` as a reload mechanism disappears.
- Changing the game configuration is a deploy, not a runtime edit. That matches how seasons
  actually work: the configuration is written before an event, not during one. A future
  configuration editor in the admin UI would write these files and is not ruled out.
