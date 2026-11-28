/**
 * pm2's settings for SPOT on EC2 (#412; README.md beside this file). `update.sh` starts SPOT
 * with them; `tests/unit/deploy.test.ts` keeps the settings that matter from changing by mistake.
 */
const SPOT = process.env.SPOT_HOME || "/srv/spot";

module.exports = {
  apps: [
    {
      name: "spot",
      // The release `update.sh` built and switched to.
      cwd: `${SPOT}/current`,
      script: "node_modules/next/dist/bin/next",
      // Only nginx, on the same machine, talks to SPOT.
      args: "start --hostname 127.0.0.1 --port 3000",
      // One process owns the scouter registry (AR-21): never cluster mode, never two.
      exec_mode: "fork",
      instances: 1,
      // The secrets, kept outside every release (ADR 0003), read by Node itself.
      node_args: `--env-file=${SPOT}/shared/spot.env`,
      env: {
        NODE_ENV: "production",
        // SPOT handles pm2's stop signal itself, saving the registry first
        // (src/server/shutdown.ts); Next's own handler would wait for the scouters' streams.
        NEXT_MANUAL_SIG_HANDLE: "true",
      },
      // pm2 sends SIGINT, then kills the process after this long: more than SPOT's 8 s to save.
      kill_timeout: 10_000,
      // After a crash, start again, waiting longer each time it keeps crashing.
      exp_backoff_restart_delay: 1_000,
      // Each log line with its time (`pm2 logs spot`).
      time: true,
    },
  ],
};
