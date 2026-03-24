#!/bin/bash
# ARCH-001 — Adaptive Heartbeat Monitor
# Sprint 958 / ARCH-001 Task 02
#
# Emits heartbeat signals to _orchestrator/heartbeat.json at adaptive intervals:
#   - Active (workers running):   30s
#   - Idle (no active workers):  120s
#   - Quiescent (all done):      300s
#
# Usage: scripts/arch001/heartbeat.sh [--once]
#   --once: emit a single heartbeat and exit (for testing)

set -e

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATUS_DIR="$REPO_ROOT/workspace/arch001/_orchestrator"
HB_FILE="$STATUS_DIR/heartbeat.json"
mkdir -p "$STATUS_DIR"

emit_heartbeat() {
  local worker_count
  worker_count=$(jq '.workers | map(select(.status == "running")) | length' \
    "$STATUS_DIR/workers.json" 2>/dev/null || echo "0")
  local phase
  if [ "$worker_count" -gt 0 ]; then
    phase="active"; interval=30
  else
    local done_count
    done_count=$(jq '.workers | map(select(.status == "done")) | length' \
      "$STATUS_DIR/workers.json" 2>/dev/null || echo "0")
    if [ "$done_count" -gt 0 ]; then
      phase="quiescent"; interval=300
    else
      phase="idle"; interval=120
    fi
  fi
  local ts; ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  printf '{"ts":"%s","phase":"%s","activeWorkers":%s,"intervalSec":%d}\n' \
    "$ts" "$phase" "$worker_count" "$interval" > "$HB_FILE"
  echo "[heartbeat] $ts — $phase (${worker_count} active, next in ${interval}s)"
}

if [ "${1:-}" = "--once" ]; then
  emit_heartbeat; exit 0
fi

# Loop
interval=30
while true; do
  emit_heartbeat
  sleep "$interval"
done
