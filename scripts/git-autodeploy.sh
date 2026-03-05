#!/bin/bash
# git-autodeploy.sh — polls GitHub every 5 min, self-deploys new commits
# Runs as a PM2 cron process (fire-and-forget, autorestart: false)
#
# What it does:
#   0. ALWAYS: self-heal ceo-ai-bot if not online (runs every 5 min, not just on new commits)
#   1. git fetch to check for new commits
#   2. If nothing new → exit 0 (silent)
#   3. If new commit → git pull, detect which services changed, restart them
#   4. Logs every deployment with commit hash + changed files

set -euo pipefail

APP_DIR="/home/invoica/apps/Invoica"
cd "$APP_DIR"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ── 0. ALWAYS: Self-heal ceo-ai-bot ──────────────────────────────────────────
# Runs every 5 minutes regardless of whether there are new commits.
# Ensures the CEO bot is always online — even if it crashed between deploys.
# NOTE: this block must be BEFORE the "no changes → exit 0" check.
if pm2 list | grep -q "ceo-ai-bot"; then
  # Process is registered with PM2 — check if it's actually online
  if ! pm2 list | grep "ceo-ai-bot" | grep -q "online"; then
    echo "[$TIMESTAMP] [AutoDeploy] ceo-ai-bot registered but NOT online — restarting"
    set -a; source .env; set +a
    pm2 restart ceo-ai-bot --update-env || true
    pm2 save
    echo "[$TIMESTAMP] [AutoDeploy] ceo-ai-bot restarted"
  fi
else
  # Process is missing from PM2 entirely — start it
  echo "[$TIMESTAMP] [AutoDeploy] ceo-ai-bot MISSING from PM2 — starting now"
  set -a; source .env; set +a
  pm2 start ecosystem.config.js --only ceo-ai-bot --update-env || true
  pm2 save
  echo "[$TIMESTAMP] [AutoDeploy] ceo-ai-bot started"
fi

# ── 1. Fetch remote silently ──────────────────────────────────────────
git fetch origin main --quiet 2>/dev/null

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "[$TIMESTAMP] [AutoDeploy] No changes (HEAD=$LOCAL)"
  exit 0
fi

# ── 2. New commit detected ────────────────────────────────────────────
echo "[$TIMESTAMP] [AutoDeploy] New commit: $LOCAL → $REMOTE"

# Get changed files BEFORE pulling (so we know what changed)
CHANGED=$(git diff --name-only HEAD origin/main)
echo "[$TIMESTAMP] [AutoDeploy] Changed files:"
echo "$CHANGED" | sed 's/^/  /'

# ── 3. Pull ───────────────────────────────────────────────────────────
git pull origin main --quiet
echo "[$TIMESTAMP] [AutoDeploy] Pull complete"

# ── 4. Restart affected services ─────────────────────────────────────

# Backend: any change under backend/
if echo "$CHANGED" | grep -q "^backend/"; then
  echo "[$TIMESTAMP] [AutoDeploy] backend/ changed → restarting backend"
  pm2 reload backend --update-env
  echo "[$TIMESTAMP] [AutoDeploy] backend restarted"
fi

# CEO AI bot (standalone process — replaces the old telegram-bot PM2 entry)
if echo "$CHANGED" | grep -q "^scripts/run-ceo-bot\.ts$"; then
  echo "[$TIMESTAMP] [AutoDeploy] run-ceo-bot.ts changed → restarting ceo-ai-bot"
  pm2 restart ceo-ai-bot
  echo "[$TIMESTAMP] [AutoDeploy] ceo-ai-bot restarted"
fi

# Heartbeat daemon (cron-based — will pick up changes on next cron fire, no restart needed)
if echo "$CHANGED" | grep -q "^scripts/heartbeat-daemon\.ts$"; then
  echo "[$TIMESTAMP] [AutoDeploy] heartbeat-daemon.ts changed — will apply on next hourly cron"
fi

# Mission Control startup wrapper (long-running — restart on script change)
if echo "$CHANGED" | grep -qE "^scripts/run-mission-control\.sh$"; then
  echo "[$TIMESTAMP] [AutoDeploy] run-mission-control.sh changed → restarting mission-control"
  pm2 restart mission-control --update-env || true
  echo "[$TIMESTAMP] [AutoDeploy] mission-control restarted"
fi

# ecosystem.config.js: reload PM2 so new/removed processes take effect
if echo "$CHANGED" | grep -q "^ecosystem\.config\.js$"; then
  echo "[$TIMESTAMP] [AutoDeploy] ecosystem.config.js changed → reloading PM2"
  # Delete the retired telegram-bot process if it still exists
  if pm2 list | grep -q "telegram-bot"; then
    pm2 delete telegram-bot || true
    echo "[$TIMESTAMP] [AutoDeploy] Deleted retired telegram-bot process"
  fi
  # Load .env into shell environment (avoids xargs quoting issues with special chars)
  set -a; source .env; set +a
  # Start any NEW processes defined in ecosystem that aren't running yet
  pm2 start ecosystem.config.js --update-env
  # Reload (graceful restart) all existing processes with updated env
  pm2 reload ecosystem.config.js --update-env
  # Persist process list so it survives server reboots
  pm2 save
  echo "[$TIMESTAMP] [AutoDeploy] PM2 ecosystem reloaded"
fi

echo "[$TIMESTAMP] [AutoDeploy] ✅ Done — deployed $REMOTE"
