# AWS EC2 (Team 3061)

Placeholder. The recipe lands in Phase 4 (`docs/spec/17-rewrite-plan-and-next-steps.md` §3).

Target: an EC2 instance with Node 24, the app built with `npm ci && npm run build` and run by
`next start` under pm2 or systemd, nginx in front for TLS, MongoDB Atlas for data. No Docker.

The recipe must satisfy `docs/spec/10-setup-and-deployment.md` and the hosting section of
`docs/spec/15-rewrite-technology-direction.md`: one instance owns in-memory state, nginx does
not buffer long-lived streaming responses (SSE, ADR 0001), and every secret comes from the
environment (`.env.example`).

## The scouter stream (ADR 0001, #354)

`/api/scouter/stream` is a server-sent event stream that stays open while a scouter is signed
in. nginx must pass it through unbuffered and leave it open:

```nginx
location /api/scouter/stream {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header X-Forwarded-Proto $scheme;   # the admin cookie's Secure flag (SEC-4a)
    proxy_buffering off;
    proxy_read_timeout 1h;                         # well above the 20 s heartbeat
}
```

The app also sends `X-Accel-Buffering: no`. Serve over HTTP/2 so several tabs on one tablet do
not run out of connections. Every other location also needs `X-Forwarded-Proto`.
