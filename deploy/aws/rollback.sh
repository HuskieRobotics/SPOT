#!/usr/bin/env bash
# Go back to the release before the one running (#412; deploy/aws/README.md, "Going back").
#
#   /srv/spot/repo/deploy/aws/rollback.sh
#
# Run it again to go back one more; update.sh keeps the newest three releases.
set -euo pipefail

SPOT="${SPOT_HOME:-/srv/spot}"
current="$(readlink -f "$SPOT/current")"
previous="$(ls -1d "$SPOT"/releases/*/ | sed 's:/$::' | sort | awk -v cur="$current" '$0 == cur { print last; exit } { last = $0 }')"

if [ -z "$previous" ]; then
  echo "There is no release before $(basename "$current")." >&2
  exit 1
fi

echo "Going back from $(basename "$current") to $(basename "$previous")."
ln -sfn "$previous" "$SPOT/current.next"
mv -Tf "$SPOT/current.next" "$SPOT/current"
pm2 delete spot >/dev/null 2>&1 || true
pm2 start "$SPOT/current/deploy/aws/ecosystem.config.cjs"
pm2 save >/dev/null
for _ in $(seq 1 60); do
  if curl -fsS --max-time 5 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "SPOT is running $(cut -d' ' -f2 "$previous/RELEASE" 2>/dev/null || basename "$previous")."
    exit 0
  fi
  sleep 2
done
echo "SPOT did not answer its health check within 2 minutes: pm2 logs spot --lines 100" >&2
exit 1
