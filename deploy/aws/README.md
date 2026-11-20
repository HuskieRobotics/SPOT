# AWS EC2 (Team 3061)

Placeholder. The recipe lands in Phase 4 (`docs/spec/17-rewrite-plan-and-next-steps.md` §3).

Target: an EC2 instance with Node 24, the app built with `npm ci && npm run build` and run by
`next start` under pm2 or systemd, nginx in front for TLS, MongoDB Atlas for data. No Docker.

The recipe must satisfy `docs/spec/10-setup-and-deployment.md` and the hosting section of
`docs/spec/15-rewrite-technology-direction.md`: one instance owns in-memory state, nginx does
not buffer long-lived streaming responses (SSE, ADR 0001), and every secret comes from the
environment (`.env.example`).
