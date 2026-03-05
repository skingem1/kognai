#!/bin/bash
# run-mission-control.sh — PM2 startup wrapper for Mission Control
#
# Called by PM2 (ecosystem.config.js → mission-control entry).
# Starts the pre-built Next.js app from /home/invoica/apps/mission-control.
#
# If Mission Control hasn't been set up yet, sleeps 5 minutes then exits
# so PM2 retries without hammering the CPU.

MC_DIR="/home/invoica/apps/mission-control"
NODE_BIN_DIR="/home/invoica/.nodejs/bin"

export PATH="$NODE_BIN_DIR:$PATH"

# ── Guard: ensure setup has been run ────────────────────────────────────────
if [ ! -f "$MC_DIR/.env" ]; then
  echo "[MissionControl] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Not set up yet."
  echo "[MissionControl] Run: bash /home/invoica/apps/Invoica/scripts/setup-mission-control.sh"
  echo "[MissionControl] Sleeping 300s before PM2 retry..."
  sleep 300
  exit 1
fi

if [ ! -d "$MC_DIR/.next" ]; then
  echo "[MissionControl] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Build not found — running setup..."
  bash /home/invoica/apps/Invoica/scripts/setup-mission-control.sh
fi

# ── Source Mission Control .env ──────────────────────────────────────────────
set -a
source "$MC_DIR/.env"
set +a

export PORT="${MC_PORT:-3005}"
echo "[MissionControl] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Starting on port ${PORT}..."

cd "$MC_DIR"

# Use standalone server.js if available (output: standalone build)
# Falls back to pnpm start for non-standalone builds
if [ -f ".next/standalone/server.js" ]; then
  exec node .next/standalone/server.js
elif command -v pnpm &>/dev/null; then
  exec pnpm start
else
  exec npx --yes pnpm start
fi
