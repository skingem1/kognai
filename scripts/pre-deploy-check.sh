#!/bin/bash
# pre-deploy-check.sh — Run after every git pull on the server
# Verifies all ecosystem.config.js scripts exist before pm2 reload
# Usage: bash scripts/pre-deploy-check.sh
# Returns: exit 0 if OK, exit 1 if any check fails

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ERRORS=0
echo "╔══════════════════════════════════════════════════════╗"
echo "║         Kognai Pre-Deploy Verification               ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# 1. TypeScript check — scripts/ only, filtering node_modules/ noise
# (packages like 'ox' ship .ts files with their own type issues — not our concern)
echo "▶ TypeScript compile check (scripts/ only)..."
TS_ERRORS=$(npx tsc --noEmit --project tsconfig.scripts.json 2>&1 | grep "error TS" | grep -v "^node_modules/" || true)
if [ -z "$TS_ERRORS" ]; then
  echo "  ✅ TypeScript OK"
else
  echo "  ❌ TypeScript errors in scripts/:"
  echo "$TS_ERRORS" | head -15 | sed "s/^/    /"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# 2. Verify all ecosystem.config.js relative scripts exist
echo "▶ Ecosystem script existence check..."
node -e "
  const fs = require('fs');
  const path = require('path');
  const config = require('./ecosystem.config.js');
  let missing = 0;
  for (const app of config.apps) {
    if (app.script.startsWith('/')) continue; // absolute paths are server-specific
    // Skip system commands used as interpreters (python3, npx, node, etc.)
    const SYSTEM_CMDS = ['python3', 'python', 'node', 'npx', 'bash', 'sh'];
    if (SYSTEM_CMDS.includes(app.script)) continue;
    const cwd = app.cwd || '.';
    const full = path.resolve(cwd, app.script);
    // Kognai processes are critical; Invoica legacy processes are warnings
    const isKognai = /^(kognai-|scs001-|telegram-bot|achiri-|vault-|clawrouter-)/.test(app.name);
    if (!fs.existsSync(full)) {
      if (isKognai) {
        console.error('  ❌ MISSING: ' + app.name + ' → ' + app.script);
        missing++;
      } else {
        console.log('  ⚠️  ' + app.name + ' → ' + app.script + ' (Invoica legacy, skipped)');
      }
    } else {
      console.log('  ✅ ' + app.name + ' → ' + app.script);
    }
  }
  if (missing > 0) process.exit(1);
  console.log('');
  console.log('  Kognai scripts verified (' + config.apps.length + ' total processes).');
" || ERRORS=$((ERRORS + 1))
echo ""

# 3. Verify required log directories exist (create if missing)
echo "▶ Log directory check..."
LOGS=(
  "logs/email-support"
  "reports/cto"
  "reports/cmo"
  "reports/tax/eu-japan"
  "reports/tax/us"
  "reports/cto-briefings"
  "reports/invoica-x-admin"
  "reports/invoica-x-admin/drafts"
  "reports/invoica-x-admin/drafts/rejected"
  "reports/invoica-x-admin/approved"
)
for dir in "${LOGS[@]}"; do
  full="$ROOT/$dir"
  if [ ! -d "$full" ]; then
    mkdir -p "$full"
    chmod 775 "$full"
    echo "  📁 Created: $dir"
  else
    echo "  ✅ $dir"
  fi
done
echo ""

# 4. Verify .env exists and has required keys
echo "▶ Environment variables check..."
REQUIRED_KEYS=(
  "ANTHROPIC_API_KEY"
  "TELEGRAM_BOT_TOKEN"
  "OWNER_TELEGRAM_CHAT_ID"
  "MINIMAX_API_KEY"
)
if [ -f "$ROOT/.env" ]; then
  for key in "${REQUIRED_KEYS[@]}"; do
    if grep -q "^${key}=" "$ROOT/.env" 2>/dev/null; then
      echo "  ✅ $key"
    else
      echo "  ⚠️  $key missing from .env"
    fi
  done
else
  echo "  ⚠️  No .env file found — check environment variables are set"
fi
echo ""

# 5. Summary
echo "══════════════════════════════════════════════════════"
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ All checks passed — safe to: pm2 reload ecosystem.config.js"
else
  echo "❌ $ERRORS check(s) failed — DO NOT reload PM2 until fixed"
  exit 1
fi
