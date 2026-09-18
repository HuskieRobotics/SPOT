# 0002 Plain Node behind nginx, cloud-neutral, no Docker

Status: Accepted 2026-09-17. Sources: document 15, answers 48 and 49, maintainer decision on Docker.

## Context

Team 3061 hosts SPOT on an AWS EC2 instance with MongoDB Atlas. Other teams host on Google
Cloud. Students develop on school computers where Node 24 is installed and installing Docker
is difficult and unsupported.

## Decision

The application runs as plain Node: `next build` then `next start`, fronted by nginx on EC2.
No Docker anywhere, including local development and continuous integration. No serverless
assumptions: one instance owns the in-memory scouter registry. Google Cloud Run deploys from
source using buildpacks, so teams on Google Cloud need no container work either.

## Consequences

- Development setup is `npm ci` and `npm run dev`, which works on a school computer.
- Continuous integration installs Node 24 directly and runs lint, typecheck, unit tests,
  build and end-to-end tests.
- Anything requiring a container at test time is out: tests use an in-process database or
  fixtures rather than a containerized MongoDB.
- Deployment recipes live in `deploy/`. The EC2 recipe covers a process manager and nginx;
  the Google Cloud recipe covers source deploys.
- Because a single instance holds live state, a future need for multiple instances would
  require moving that state to the database. That is not in scope.
