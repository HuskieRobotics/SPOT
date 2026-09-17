# SPOT v6 — agent guidance

@AGENTS.md

## What this repository is

SPOT (Scouting Platforms On Time) is Team 3061 Huskie Robotics' FRC scouting platform. This
branch (`v6`) is a from-scratch rewrite in Next.js + Tailwind/shadcn + MongoDB. The legacy
Express/EJS app (v5) lives on `main` until cutover and on the `v5` branch afterwards.

## Read the specification first

`docs/spec/README.md` indexes the requirements. Key documents:

- `12-rewrite-notes-and-test-plan.md` — resolved decisions, known legacy defects, test plan
- `15-rewrite-technology-direction.md` — stack, SSE/polling transport, extension model
- `17-rewrite-plan-and-next-steps.md` — phases, branch strategy, oracle
- `18-offline-requirements.md` — offline is a first-class requirement
- `19-model-fit-guide.md` — which model/effort suits which kind of task

Do not re-ask the questions in `14-clarifying-questions.md`; they are answered.

## Working rules

- Cite requirement ids (`SC-23`, `RT-12`, `OF-4`, `BL-298`, `T-4`, …) in PR descriptions and
  name tests after them. If a change alters a requirement, update the spec in the same PR.
- The legacy code is reference, not a template. Read `main` (or the `v5` branch) to answer
  "what did it do"; never port a file line by line.
- The behavioral oracle in `tools/oracle/` is the acceptance target for the analysis
  pipeline: 2025 golden output from tag `v4.2.0`, 2026 from the legacy v5 code (`main` commit `902db06`). When the rewrite
  deliberately diverges (fixing a defect listed in doc 12), update the expected fixture in
  the same PR and cite the defect id.
- Configuration (JSON) is the platform's public interface and must stay usable by students
  without programming experience. Legacy v1 configs are in `config/v1/` for the converter
  and validation tests.
- Secrets come from environment variables (`.env.example`); never write API keys or
  database URIs into committed files. `config/config.json` is git-ignored legacy secrets.
- Keep everything cloud-neutral (AWS EC2 for Team 3061, Google Cloud for other teams; no
  serverless assumptions, one instance owns in-memory state). **No Docker**: the app runs as
  plain Node (`next build && next start`) so students can develop on school computers with
  only Node 24 installed; Cloud Run deploys from source with buildpacks.

## Commands

```sh
npm run dev          # Next.js dev server
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # vitest (unit, config validation, oracle fixture checks)
npm run build && npm start
npm run test:e2e     # playwright (expects a built app; see playwright.config.ts)
npm run oracle -- <v4.2.0-worktree> <v5-worktree>   # regenerate golden outputs
npm run config:convert -- config/v1 <out dir> [--opr-strings '<json>']   # v1 -> v2 config converter
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, build, and e2e on every PR.
Toolchain: Node 24 (`.nvmrc`), npm; no Docker.
