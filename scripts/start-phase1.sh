#!/usr/bin/env bash
# start-phase1.sh — Start all Phase 1 PM2 cron processes
# Run once after reboot or fresh setup. PM2 cron_restart handles scheduling after that.
#
# Usage: bash scripts/start-phase1.sh
# Safe to re-run — PM2 will restart already-running processes.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "🚀 Starting Phase 1 PM2 processes..."
echo ""

# Core services (always running)
SERVICES=(
  "telegram-bot"
  "achiri-api"
  "kognai-stripe-webhook"
)

# Cron jobs (run on schedule, exit between runs)
CRONS=(
  "kognai-daily-digest"
  "kognai-post-noon"
  "kognai-post-evening"
  "kognai-gate-regen"
  "kognai-brief-regen"
  "kognai-pipeline-watchdog"
)

echo "📡 Core services:"
for svc in "${SERVICES[@]}"; do
  if pm2 describe "$svc" &>/dev/null; then
    pm2 restart "$svc" --update-env 2>/dev/null && echo "  ✅ $svc — restarted" || echo "  ⚠️  $svc — restart failed"
  else
    pm2 start ecosystem.config.js --only "$svc" 2>/dev/null && echo "  ✅ $svc — started" || echo "  ⚠️  $svc — start failed"
  fi
done

echo ""
echo "⏰ Cron jobs:"
for cron in "${CRONS[@]}"; do
  if pm2 describe "$cron" &>/dev/null; then
    pm2 restart "$cron" --update-env 2>/dev/null && echo "  ✅ $cron — restarted (cron active)" || echo "  ⚠️  $cron — restart failed"
  else
    pm2 start ecosystem.config.js --only "$cron" 2>/dev/null && echo "  ✅ $cron — started" || echo "  ⚠️  $cron — start failed"
  fi
done

echo ""
echo "💾 Saving PM2 process list..."
pm2 save --force 2>/dev/null || echo "⚠️  pm2 save failed"

echo ""
echo "✅ Phase 1 processes started. Run 'pm2 status' to verify."
echo "💡 Cron jobs will fire on schedule. See ecosystem.config.js for cron_restart times."
