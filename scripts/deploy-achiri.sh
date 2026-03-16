#!/usr/bin/env bash
# deploy-achiri.sh — Deploy Achiri API to Hetzner VPS (Sprint 129)
# Usage: ./scripts/deploy-achiri.sh [--dry-run]
#
# Deploys agents/achiri/ to Hetzner at /home/invoica/apps/kognai/
# Requires: SSH access via ~/.ssh/id_ed25519
# After deploy: Achiri available at https://65.108.90.178/achiri/health

set -euo pipefail

HETZNER_HOST="65.108.90.178"
HETZNER_USER="invoica"
HETZNER_SSH_KEY="$HOME/.ssh/id_ed25519"
REMOTE_BASE="/home/invoica/apps/kognai"
LOCAL_BASE="$(cd "$(dirname "$0")/.." && pwd)"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  echo "[deploy-achiri] DRY RUN MODE — commands will be printed, not executed"
fi

SSH_CMD="ssh -i $HETZNER_SSH_KEY -o StrictHostKeyChecking=no $HETZNER_USER@$HETZNER_HOST"
RSYNC_CMD="rsync -avz --delete -e 'ssh -i $HETZNER_SSH_KEY -o StrictHostKeyChecking=no'"

run() {
  echo "[deploy-achiri] CMD: $*"
  if [[ $DRY_RUN -eq 0 ]]; then
    eval "$@"
  fi
}

echo ""
echo "======================================="
echo " Achiri Hetzner Deploy — $(date '+%Y-%m-%d %H:%M:%S')"
echo " Target: $HETZNER_USER@$HETZNER_HOST:$REMOTE_BASE"
echo "======================================="
echo ""

# Step 1: Create remote directories
echo "[1/6] Creating remote directories..."
run "$SSH_CMD 'mkdir -p $REMOTE_BASE/agents/achiri $REMOTE_BASE/kognai-agents/achiri $REMOTE_BASE/workspace/achiri/memory $REMOTE_BASE/logs $REMOTE_BASE/infra'"

# Step 2: Sync Achiri agent code
echo "[2/6] Syncing agents/achiri/..."
run "rsync -avz --delete -e 'ssh -i $HETZNER_SSH_KEY -o StrictHostKeyChecking=no' \
  '$LOCAL_BASE/agents/achiri/' \
  '$HETZNER_USER@$HETZNER_HOST:$REMOTE_BASE/agents/achiri/'"

# Step 3: Sync Achiri config + prompt
echo "[3/6] Syncing kognai-agents/achiri/..."
run "rsync -avz -e 'ssh -i $HETZNER_SSH_KEY -o StrictHostKeyChecking=no' \
  '$LOCAL_BASE/kognai-agents/achiri/' \
  '$HETZNER_USER@$HETZNER_HOST:$REMOTE_BASE/kognai-agents/achiri/'"

# Step 4: Sync package.json + tsconfig
echo "[4/6] Syncing project config files..."
run "rsync -avz -e 'ssh -i $HETZNER_SSH_KEY -o StrictHostKeyChecking=no' \
  '$LOCAL_BASE/package.json' \
  '$LOCAL_BASE/package-lock.json' \
  '$LOCAL_BASE/tsconfig.json' \
  '$HETZNER_USER@$HETZNER_HOST:$REMOTE_BASE/'"

# Step 5: Sync infra config
echo "[5/6] Syncing infra/ (PM2 + nginx configs)..."
run "rsync -avz -e 'ssh -i $HETZNER_SSH_KEY -o StrictHostKeyChecking=no' \
  '$LOCAL_BASE/infra/' \
  '$HETZNER_USER@$HETZNER_HOST:$REMOTE_BASE/infra/'"

# Step 6: npm install + PM2 restart on remote
echo "[6/6] Installing deps and restarting PM2..."
run "$SSH_CMD 'cd $REMOTE_BASE && npm install --production 2>&1 | tail -5'"
run "$SSH_CMD 'cd $REMOTE_BASE && \
  if pm2 list | grep -q achiri-api; then \
    pm2 restart achiri-api; \
  else \
    pm2 start infra/ecosystem-hetzner-achiri.config.js; \
  fi'"

# Health check
echo ""
echo "[deploy-achiri] Verifying health endpoint..."
sleep 3
run "$SSH_CMD 'curl -sf http://localhost:3420/health || echo HEALTH_CHECK_FAILED'"

echo ""
echo "======================================="
echo " Deploy complete!"
echo " Public health: http://$HETZNER_HOST/achiri/health"
echo " (nginx must be configured with infra/nginx-achiri.conf)"
echo "======================================="
