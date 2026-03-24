#!/usr/bin/env bash
# deploy-hetzner.sh — Sprint 1160
#
# Deploys Achiri API to Hetzner VPS (65.108.90.178).
# Run from local Mac or CI:
#   bash scripts/achiri/deploy-hetzner.sh [--dry-run]
#
# Requirements:
#   - SSH key at ~/.ssh/id_ed25519 (or DEPLOY_KEY env var)
#   - HETZNER_IP env var (default: 65.108.90.178)
#   - HETZNER_USER env var (default: invoica)
#
# What it does:
#   1. Pre-flight check (local: env vars, build)
#   2. SSH: git pull latest from main
#   3. SSH: npm ci --omit=dev
#   4. SSH: pm2 restart achiri-api achiri-telegram
#   5. SSH: health check (GET /stats/health)
#   6. Reports deploy status + PM2 state

set -euo pipefail

HETZNER_IP="${HETZNER_IP:-65.108.90.178}"
HETZNER_USER="${HETZNER_USER:-invoica}"
DEPLOY_KEY="${DEPLOY_KEY:-$HOME/.ssh/id_ed25519}"
APP_PATH="/home/${HETZNER_USER}/apps/kognai"
ACHIRI_PORT=3420
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "🧪 DRY RUN — no SSH commands will execute"
fi

echo "🚀 Achiri Hetzner Deploy — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "   Target: ${HETZNER_USER}@${HETZNER_IP}:${APP_PATH}"
echo ""

# ── 1. Local pre-flight ──────────────────────────────────────────────────────
echo "🔍 Pre-flight check..."
if [[ ! -f "$DEPLOY_KEY" ]]; then
  echo "❌ SSH key not found: $DEPLOY_KEY"
  exit 1
fi

if ! ssh -o ConnectTimeout=5 -o BatchMode=yes -i "$DEPLOY_KEY" \
    "${HETZNER_USER}@${HETZNER_IP}" "echo ok" &>/dev/null; then
  echo "❌ SSH connection failed to ${HETZNER_USER}@${HETZNER_IP}"
  exit 1
fi
echo "   ✅ SSH reachable"

# ── Helper: run SSH command (or skip in dry-run) ─────────────────────────────
ssh_run() {
  local cmd="$1"
  local label="${2:-}"
  if [[ -n "$label" ]]; then echo "   ▶ $label"; fi
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "     [dry-run] ssh ${HETZNER_USER}@${HETZNER_IP} \"$cmd\""
    return 0
  fi
  ssh -i "$DEPLOY_KEY" "${HETZNER_USER}@${HETZNER_IP}" "$cmd"
}

# ── 2. Ensure app path exists ────────────────────────────────────────────────
echo ""
echo "📁 Ensuring app path: ${APP_PATH}"
ssh_run "mkdir -p ${APP_PATH}" "mkdir -p"

# ── 3. Git pull ──────────────────────────────────────────────────────────────
echo ""
echo "📦 Pulling latest code..."
ssh_run "cd ${APP_PATH} && git pull origin main --ff-only" "git pull"

# ── 4. Install dependencies ──────────────────────────────────────────────────
echo ""
echo "📥 Installing dependencies..."
ssh_run "cd ${APP_PATH} && npm ci --omit=dev 2>&1 | tail -5" "npm ci"

# ── 5. PM2 restart ───────────────────────────────────────────────────────────
echo ""
echo "🔄 Restarting PM2 processes..."
ssh_run "cd ${APP_PATH} && pm2 restart achiri-api || pm2 start ecosystem.config.js --only achiri-api" "pm2 restart achiri-api"
ssh_run "cd ${APP_PATH} && pm2 restart achiri-telegram || pm2 start ecosystem.config.js --only achiri-telegram" "pm2 restart achiri-telegram"

# ── 6. Health check ──────────────────────────────────────────────────────────
echo ""
echo "❤️ Health check (port ${ACHIRI_PORT})..."
sleep 3
if [[ "$DRY_RUN" == "false" ]]; then
  HEALTH=$(ssh -i "$DEPLOY_KEY" "${HETZNER_USER}@${HETZNER_IP}" \
    "curl -sf --max-time 5 http://localhost:${ACHIRI_PORT}/stats/health || echo 'UNREACHABLE'")
  echo "   Response: ${HEALTH:0:120}"
  if echo "$HEALTH" | grep -q "UNREACHABLE"; then
    echo "⚠️ Health check failed — check PM2 logs: pm2 logs achiri-api"
  else
    echo "   ✅ Achiri API is UP"
  fi
fi

# ── 7. PM2 status summary ────────────────────────────────────────────────────
echo ""
echo "📊 PM2 status:"
ssh_run "pm2 jlist | python3 -c \"import json,sys; procs=json.load(sys.stdin); [print(f'  {p[\\\"name\\\"]}: {p[\\\"pm2_env\\\"][\\\"status\\\"]}') for p in procs if \\\"achiri\\\" in p[\\\"name\\\"]]\"" "pm2 status"

echo ""
if [[ "$DRY_RUN" == "true" ]]; then
  echo "✅ Dry run complete — no changes made"
else
  echo "✅ Deploy complete — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
fi
