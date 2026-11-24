# Google Cloud Run (other teams)

Placeholder. The recipe lands in Phase 4 (`docs/spec/17-rewrite-plan-and-next-steps.md` §3).
The v5 Cloud Run scripts remain on `main` (and on the `v5` branch after cutover) for reference.

Target: `gcloud run deploy --source .`, so buildpacks build the Node app in the cloud and no
one needs Docker locally; a single instance (`--max-instances 1`), because one instance owns
in-memory state; MongoDB Atlas for data; secrets from Secret Manager or environment variables.

The recipe must satisfy `docs/spec/10-setup-and-deployment.md` and the hosting section of
`docs/spec/15-rewrite-technology-direction.md`, including a request timeout long enough for
streaming responses (SSE, ADR 0001).

## The scouter stream (ADR 0001, #354)

`/api/scouter/stream` stays open while a scouter is signed in. Cloud Run ends a request at its
timeout (300 s by default) and the browser reconnects 3 s later, which the stream absorbs: every
reconnect starts with the scouter's state. Raise the timeout (up to 3600 s) to reconnect less
often, and keep `max-instances 1`, because one process owns the registry (AR-21).
