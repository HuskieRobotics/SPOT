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

# Synthetic data (doc 22, T-4): regenerate the inputs from fixed seeds, then run each season's
# legacy pipeline over them. No enrichment: synthetic events have no TBA data.
SYN="$HERE/fixtures/synthetic"
TMP_OUT="$(mktemp -d)"
trap 'rm -rf "$TMP_OUT"' EXIT
for season in 2026 2025; do
  if [ "$season" = 2026 ]; then config=config/match-scouting.json; else config=config/seasons/2025/match-scouting.json; fi
  (cd "$HERE/../.." && npx tsx scripts/generate-data.ts --config "$config" --out "$TMP_OUT/$season" \
    --seed "oracle-$season" --matches 60 --event-code "${season}syn_synthetic" --legacy >/dev/null)
  mkdir -p "$SYN"
  cp "$TMP_OUT/$season/legacy.teamMatchPerformances.json" "$SYN/${season}syn.teamMatchPerformances.json"
  cp "$TMP_OUT/$season/legacy.events.json" "$SYN/${season}syn.events.json"
done

node "$HERE/run.js" --checkout "$V42" \
  --tmps "$SYN/2025syn.teamMatchPerformances.json" \
  --events "$SYN/2025syn.events.json" \
  --event 2025syn_synthetic \
  --out "$HERE/golden/2025syn_synthetic-v4.2.0"

node "$HERE/run.js" --checkout "$V5" \
  --tmps "$SYN/2026syn.teamMatchPerformances.json" \
  --events "$SYN/2026syn.events.json" \
  --event 2026syn_synthetic \
  --out "$HERE/golden/2026syn_synthetic-v5"
