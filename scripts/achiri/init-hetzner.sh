#!/usr/bin/env bash
# init-hetzner.sh — Sprint 1197
#
# First-time Achiri setup on Hetzner VPS.
# Use this ONCE to clone the kognai repo and start Achiri.
# For subsequent deploys, use deploy-hetzner.sh instead.
#
# Usage:
#   bash scripts/achiri/init-hetzner.sh           # Full init
#   bash scripts/achiri/init-hetzner.sh --dry-run # Preview commands only
#
# Requirements:
#   - SSH access via ~/.ssh/id_ed25519
#   - HETZNER_IP env var (default: 65.108.90.178)
#   - HETZNER_USER env var (default: invoica)

set -euo pipefail

HETZNER_IP="${HETZNER_IP:-65.108.90.178}"
HETZNER_USER="${HETZNER_USER:-invoica}"
DEPLOY_KEY="${DEPLOY_KEY:-$HOME/.ssh/id_ed25519}"
APP_PATH="/home/${HETZNER_USER}/apps/kognai"
REPO_URL="https://github.com/skingem1/kognai.git"
ACHIRI_PORT=3420
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "🧪 DRY RUN — SSH commands printed, not executed"
fi

SSH="ssh -i ${DEPLOY_KEY} -o StrictHostKeyChecking=no ${HETZNER_USER}@${HETZNER_IP}"
run_remote() {
  local label="$1"; local cmd="$2"
  echo "   ▶ ${label}"
  if $DRY_RUN; then
    echo "     [dry-run] ssh ${HETZNER_USER}@${HETZNER_IP} \"${cmd}\""
  else
    $SSH "${cmd}"
  fi
}

echo "🚀 Achiri Hetzner Init — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "   Target: ${HETZNER_USER}@${HETZNER_IP}:${APP_PATH}"
echo ""

# ── 1. SSH reachability check ─────────────────────────────────────────────────
echo "🔍 Checking SSH access..."
if ! $DRY_RUN; then
  if ! $SSH "exit 0" 2>/dev/null; then
    echo "   ❌ SSH failed — check key and server access"
    exit 1
  fi
fi
echo "   ✅ SSH reachable"
echo ""

# ── 2. Create app directory ───────────────────────────────────────────────────
echo "📁 Creating app directory..."
run_remote "mkdir -p" "mkdir -p /home/${HETZNER_USER}/apps"
echo ""

# ── 3. Clone or pull repo ─────────────────────────────────────────────────────
echo "📦 Setting up repo..."
run_remote "clone or pull" "
  if [ -d '${APP_PATH}/.git' ]; then
    echo 'Repo exists — pulling latest...'
    cd ${APP_PATH} && git pull origin main --ff-only
  else
    echo 'Cloning fresh...'
    git clone ${REPO_URL} ${APP_PATH}
  fi
"
echo ""

# ── 4. Install dependencies ───────────────────────────────────────────────────
echo "📥 Installing dependencies..."
run_remote "npm ci" "cd ${APP_PATH} && npm ci --omit=dev 2>&1 | tail -5"
echo ""

# ── 5. Create .env for Achiri ─────────────────────────────────────────────────
echo "⚙️  Creating Achiri .env template..."
run_remote "create .env" "
  if [ ! -f '${APP_PATH}/.env' ]; then
    cat > ${APP_PATH}/.env <<'ENVEOF'
# Achiri Production .env — fill in all values before starting PM2
ANTHROPIC_API_KEY=
OLLAMA_HOST=http://localhost:11434
TELEGRAM_BOT_TOKEN=
OWNER_TELEGRAM_CHAT_ID=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
ELEVENLABS_API_KEY=
ACHIRI_TELEGRAM_BOT_TOKEN=
ENVEOF
    echo 'Created .env template — fill in values before pm2 start'
  else
    echo '.env already exists — skipping'
  fi
"
echo ""

# ── 6. Start PM2 processes ────────────────────────────────────────────────────
echo "🔄 Starting PM2 processes..."
run_remote "pm2 start achiri-api" "
  cd ${APP_PATH} &&
  pm2 start ecosystem.config.js --only achiri-api 2>/dev/null ||
  pm2 restart achiri-api 2>/dev/null || true
"
run_remote "pm2 save" "pm2 save"
echo ""

# ── 7. Health check ───────────────────────────────────────────────────────────
if ! $DRY_RUN; then
  echo "❤️  Health check (port ${ACHIRI_PORT})..."
  sleep 3
  if curl -sf "http://${HETZNER_IP}:${ACHIRI_PORT}/health" > /dev/null 2>&1; then
    echo "   ✅ Achiri API responding on :${ACHIRI_PORT}"
  else
    echo "   ⚠️  Health check failed — check pm2 logs: pm2 logs achiri-api"
    echo "   Also verify .env has all required vars set"
  fi
fi

echo ""
echo "✅ Init complete."
echo ""
echo "Next steps:"
echo "  1. Edit .env on server: ssh ${HETZNER_USER}@${HETZNER_IP} 'nano ${APP_PATH}/.env'"
echo "  2. Restart after env edit: ssh ${HETZNER_USER}@${HETZNER_IP} 'pm2 restart achiri-api'"
echo "  3. Verify with /achiri-ping in Telegram"
echo "  4. For future deploys: bash scripts/achiri/deploy-hetzner.sh"
