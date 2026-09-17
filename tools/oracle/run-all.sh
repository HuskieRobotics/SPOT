#!/usr/bin/env bash
# Regenerate both golden datasets.
# Usage: tools/oracle/run-all.sh <v4.2.0-worktree> <v5-worktree>
#   git worktree add --detach /path/spot-v4.2.0 v4.2.0
#   git worktree add --detach /path/spot-v5 main      # legacy v5 code (or the v5 branch/tag after cutover)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
V42="${1:?path to a v4.2.0 checkout/worktree}"
V5="${2:?path to a v5 (legacy main) checkout/worktree}"

node "$HERE/run.js" --checkout "$V42" \
  --tmps "$HERE/fixtures/db/2025Reefscape.teamMatchPerformances.json" \
  --events "$HERE/fixtures/db/2025Reefscape.events.json" \
  --event 2025ilch_official \
  --out "$HERE/golden/2025ilch_official-v4.2.0"

node "$HERE/run.js" --checkout "$V5" \
  --tmps "$HERE/fixtures/db/2026Rebuilt.teamMatchPerformances.json" \
  --events "$HERE/fixtures/db/2026Rebuilt.events.json" \
  --event 2026mnwi_official \
  --tba "$HERE/fixtures/tba/2026mnwi" --enrich \
  --opr-strings "$HERE/fixtures/opr-strings/2026mnwi.json" \
  --out "$HERE/golden/2026mnwi_official-v5"
