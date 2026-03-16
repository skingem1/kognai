#!/usr/bin/env bash
# run-live.sh — Start the scs001-live TikTok posting pipeline
# Pre-requisite: bash scripts/setup-phase1.sh (first time only)

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Load .env and set live mode
set -a; source "$ROOT/.env"; set +a
export SCS_MODE=live

echo "=== SCS-001 LIVE LAUNCHER ==="
echo "Running preflight checks..."
echo ""

# Gate: preflight must pass before PM2 start
npx ts-node -T --project tsconfig.scripts.json scripts/scs001/validate-production-preflight.ts || {
  echo ""
  echo "PREFLIGHT FAILED — fix issues above before going live"
  exit 1
}

echo ""
echo "Preflight PASS — starting scs001-live..."
pm2 start ecosystem.config.js --only scs001-live

echo ""
echo "scs001-live is running."
echo "Monitor: pm2 logs scs001-live"
echo "Status:  pm2 status scs001-live"
echo "Stop:    pm2 stop scs001-live"
