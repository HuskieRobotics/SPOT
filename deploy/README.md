# Deployment

SPOT v6 runs as plain Node: `npm ci && npm run build && npm start` (Next.js, port from
`PORT`, default 3000). Configuration comes from environment variables (`.env.example`).
**No Docker** (decided 2026-09-17): students develop and deploy with only Node 24 installed.

| Target                                                                                                                                                         | Who         | Recipe                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| AWS EC2: Node 24, `npm run build`, `next start` under pm2, nginx reverse proxy with TLS, MongoDB Atlas                                                         | Team 3061   | [`deploy/aws/`](aws/README.md) (#412)                                                |
| Google Cloud Run **from source** (`gcloud run deploy --source .`, buildpacks build the Node app in the cloud, no local Docker), single instance, MongoDB Atlas | other teams | `deploy/gcp/` (Phase 4; the v5 Cloud Run scripts remain on `main` / the `v5` branch) |

Requirements the recipes must satisfy are in `docs/spec/10-setup-and-deployment.md` and
`docs/spec/15-rewrite-technology-direction.md` ("Hosting context"): single instance owning
in-memory state, reverse proxy configured for long-lived streaming responses, secrets via
environment, no provider-specific services for core function.

Whichever the target, check a deployed server through its proxy, the way phones reach it:
`npm run deploy:check -- https://<the server's address>` (#412). `GET /api/health` says whether
SPOT and its database answer, and which build is running.

A process manager must give SPOT time to stop: on SIGINT or SIGTERM, with
`NEXT_MANUAL_SIG_HANDLE=true` in its environment, SPOT closes the scouters' streams and saves the
registry within 8 s (`src/server/shutdown.ts`). Without that setting, Next waits for the streams,
which never end on their own.
