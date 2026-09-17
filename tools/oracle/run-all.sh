#!/usr/bin/env bash
# Regenerate both golden datasets. Usage: tools/oracle/run-all.sh <path-to-v4.2.0-worktree>
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
V42="${1:?path to a v4.2.0 checkout/worktree (git worktree add --detach <path> v4.2.0)}"

node "$HERE/run.js" --checkout "$V42" \
  --tmps "$HERE/fixtures/db/2025Reefscape.teamMatchPerformances.json" \
  --events "$HERE/fixtures/db/2025Reefscape.events.json" \
  --event 2025ilch_official \
  --out "$HERE/golden/2025ilch_official-v4.2.0"

OPR="$(node -e 'console.log(JSON.stringify(require(process.argv[1]).TBA_OPR_STRINGS || {}))' "$ROOT/config/config.json")"
node "$HERE/run.js" --checkout "$ROOT" \
  --tmps "$HERE/fixtures/db/2026Rebuilt.teamMatchPerformances.json" \
  --events "$HERE/fixtures/db/2026Rebuilt.events.json" \
  --event 2026mnwi_official \
  --tba "$HERE/fixtures/tba/2026mnwi" --enrich \
  --opr-strings "$OPR" \
  --out "$HERE/golden/2026mnwi_official-HEAD"
