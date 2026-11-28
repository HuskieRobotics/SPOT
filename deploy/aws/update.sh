#!/usr/bin/env bash
# Build and start a new release of SPOT on EC2 (#412; deploy/aws/README.md, "Updating").
#
#   /srv/spot/repo/deploy/aws/update.sh [branch]      # v6 unless told otherwise
#
# The new release is built in its own folder while the running one keeps serving. Then SPOT stops
# (saving the registry, src/server/shutdown.ts) and starts from the new one: a few seconds when
# scouters' phones reconnect on their own. If the new release does not answer its health check,
# the script goes back to the previous one by itself. The newest three releases are kept, so
# rollback.sh can go back further by hand.
set -euo pipefail

SPOT="${SPOT_HOME:-/srv/spot}"
BRANCH="${1:-v6}"
REPO="$SPOT/repo"
KEEP=3

say() { printf '\n== %s\n' "$*"; }

health() {
  # What the running server says about itself, or nothing while it is not answering. A database
  # that does not answer is a 503 that still names the build, so it is read too.
  curl -sS --max-time 5 http://127.0.0.1:3000/api/health 2>/dev/null || true
}

health_build() {
  health | sed -n 's/.*"build":"\([^"]*\)".*/\1/p'
}

start() {
  # Stop the old process (SIGINT: it saves the registry) and start from `current`.
  pm2 delete spot >/dev/null 2>&1 || true
  pm2 start "$SPOT/current/deploy/aws/ecosystem.config.cjs"
  pm2 save >/dev/null
}

wait_for() {
  local want="$1"
  for _ in $(seq 1 60); do
    [ "$(health_build)" = "$want" ] && return 0
    sleep 2
  done
  return 1
}

switch_to() {
  ln -sfn "$1" "$SPOT/current.next"
  mv -Tf "$SPOT/current.next" "$SPOT/current"
}

[ -f "$SPOT/shared/spot.env" ] || {
  echo "No $SPOT/shared/spot.env: write the secrets first (README.md, step 4)." >&2
  exit 1
}

say "Fetching $BRANCH"
git -C "$REPO" fetch --quiet origin "$BRANCH"
# The next run uses this script as it is on the branch. (Git writes a new file, so the copy
# running now is not changed under it.)
git -C "$REPO" checkout --quiet --detach "origin/$BRANCH"
commit="$(git -C "$REPO" rev-parse --short HEAD)"

release="$SPOT/releases/$(date +%Y%m%d-%H%M%S)-$commit"
say "Building $commit in $release (a few minutes)"
mkdir -p "$release"
git -C "$REPO" archive HEAD | tar -x -C "$release"
echo "$BRANCH $commit $(date -Iseconds)" >"$release/RELEASE"
(cd "$release" && npm ci --no-audit --no-fund && npm run build)
build="$(cat "$release/.next/BUILD_ID")"

previous="$(readlink -f "$SPOT/current" 2>/dev/null || true)"
say "Starting $commit"
switch_to "$release"
start
if wait_for "$build"; then
  say "SPOT is running $commit (build $build)"
  case "$(health)" in
  *'"database":"ok"'*) ;;
  *) echo "But its database does not answer: $(health). Check MONGODB_URI and Atlas's network access." >&2 ;;
  esac
else
  echo "The new release did not answer its health check within 2 minutes." >&2
  pm2 logs spot --lines 40 --nostream >&2 || true
  if [ -n "$previous" ] && [ -d "$previous" ]; then
    say "Going back to $(basename "$previous")"
    switch_to "$previous"
    start
  fi
  exit 1
fi

# Keep the newest releases; never the one running.
current="$(readlink -f "$SPOT/current")"
ls -1d "$SPOT"/releases/*/ 2>/dev/null | sed 's:/$::' | sort -r | tail -n +$((KEEP + 1)) |
  while read -r old; do
    [ "$old" = "$current" ] || rm -rf "$old"
  done
