#!/usr/bin/env bash
# pm2-boot.sh — Start all Kognai PM2 processes
# Usage: ./scripts/pm2-boot.sh [--status-only]
# Starts core services + all cron jobs. Safe to run multiple times (idempotent).

set -euo pipefail
cd "$(dirname "$0")/.."

STATUS_ONLY=0
if [[ "${1:-}" == "--status-only" ]]; then
  STATUS_ONLY=1
fi

# Core services (always-on, autorestart=true)
CORE_SERVICES=(
  telegram-bot
  achiri-api
  kognai-stripe-webhook
  vault-dashboard
)

# Cron jobs (run on schedule, autorestart=false)
CRON_JOBS=(
  scs001-pipeline
  kognai-smoke-test
  kognai-daily-digest
  kognai-gate-regen
  kognai-gate-tracker-update
  kognai-brief-regen
  kognai-calendar-regen
  kognai-post-noon
  kognai-post-evening
  kognai-pipeline-watchdog
  kognai-auto-send-video
)

echo ""
echo "════════════════════════════════════════"
echo " Kognai PM2 Boot — $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════"
echo ""

if [[ $STATUS_ONLY -eq 1 ]]; then
  echo "[boot] Status-only mode — no processes will be started"
  echo ""
  pm2 list
  exit 0
fi

# Delete old ecosystem and reload fresh config
echo "[1/3] Reloading ecosystem.config.js..."
pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.js --env production 2>&1 | tail -5
echo ""

# Verify core services
echo "[2/3] Verifying core services..."
for svc in "${CORE_SERVICES[@]}"; do
  status=$(pm2 show "$svc" 2>/dev/null | grep "status" | head -1 | awk '{print $4}' || echo "missing")
  if [[ "$status" == "online" ]]; then
    echo "  ✅ $svc — online"
  else
    echo "  ❌ $svc — $status"
  fi
done
echo ""

# Show cron job status
echo "[3/3] Cron jobs registered:"
for job in "${CRON_JOBS[@]}"; do
  cron=$(pm2 show "$job" 2>/dev/null | grep "cron" | head -1 | awk '{print $4}' || echo "none")
  status=$(pm2 show "$job" 2>/dev/null | grep "status" | head -1 | awk '{print $4}' || echo "missing")
  echo "  ⏰ $job — $status (cron: $cron)"
done

echo ""
echo "════════════════════════════════════════"
echo " Boot complete. Use 'pm2 list' to check."
echo "════════════════════════════════════════"
echo ""
