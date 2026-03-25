#!/usr/bin/env bash
# ARCH-001 — Launch kognai-amd21 tmux session with 3 observer agents
# Sprint 1231
#
# Usage: ./scripts/arch001/launch-observers.sh [--dry-run]
#
# Creates tmux session with:
#   Window 0: orchestrator — heartbeat loop
#   Window 1: observer-1  — monitors workers group A
#   Window 2: observer-2  — monitors workers group B
#   Window 3: observer-3  — AAR memory merger (observer-agent.ts)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SESSION="kognai-amd21"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "=== DRY RUN — no processes will start ==="
fi

# Ensure status directory exists
mkdir -p "$REPO_ROOT/workspace/arch001/_orchestrator/escalations"
mkdir -p "$REPO_ROOT/workspace/memory"

# Create initial workers.json if missing
WORKERS_FILE="$REPO_ROOT/workspace/arch001/_orchestrator/workers.json"
if [[ ! -f "$WORKERS_FILE" ]]; then
  cat > "$WORKERS_FILE" << 'WEOF'
{
  "version": "1.0",
  "sessionId": "kognai-amd21",
  "updatedAt": "",
  "workers": []
}
WEOF
  echo "[arch001] Created initial workers.json"
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[arch001] Would create tmux session: $SESSION"
  echo "[arch001] Window 0: orchestrator — heartbeat.sh"
  echo "[arch001] Window 1: observer-1 — observer.ts (group A)"
  echo "[arch001] Window 2: observer-2 — observer.ts (group B)"
  echo "[arch001] Window 3: observer-3 — observer-agent.ts (AAR merger)"
  echo "[arch001] Dry run complete."
  exit 0
fi

# Kill existing session if present
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Create session — Window 0: orchestrator with heartbeat
tmux new-session -d -s "$SESSION" -n "orchestrator" -c "$REPO_ROOT"
tmux send-keys -t "$SESSION:0" "bash $SCRIPT_DIR/heartbeat.sh" C-m

# Window 1: observer-1
tmux new-window -t "$SESSION:1" -n "observer-1" -c "$REPO_ROOT/workspace/arch001"
tmux send-keys -t "$SESSION:1" \
  "OBSERVER_ID=observer-1 INTERVAL_SEC=60 STALL_THRESHOLD_SEC=600 npx tsx observer.ts" C-m

# Window 2: observer-2
tmux new-window -t "$SESSION:2" -n "observer-2" -c "$REPO_ROOT/workspace/arch001"
tmux send-keys -t "$SESSION:2" \
  "OBSERVER_ID=observer-2 INTERVAL_SEC=60 STALL_THRESHOLD_SEC=600 npx tsx observer.ts" C-m

# Window 3: observer-3 — AAR memory merger
tmux new-window -t "$SESSION:3" -n "observer-3" -c "$REPO_ROOT"
tmux send-keys -t "$SESSION:3" \
  "npx tsx scripts/arch001/observer-agent.ts" C-m

# Select orchestrator window
tmux select-window -t "$SESSION:0"

# Status bar
tmux set-option -t "$SESSION" status-right "#[fg=green]amd21-live#[default] %H:%M"

echo ""
echo "[arch001] Session '$SESSION' launched — 4 windows"
echo "  0: orchestrator  (heartbeat loop)"
echo "  1: observer-1    (worker monitor)"
echo "  2: observer-2    (worker monitor)"
echo "  3: observer-3    (AAR memory merger)"
echo ""
echo "Attach: tmux attach -t $SESSION"
