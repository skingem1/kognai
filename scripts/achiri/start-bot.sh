#!/bin/bash
# ACHIRI TELEGRAM BOT — Startup + health check
# Sprint 1049
#
# Prerequisites:
#   1. Set ACHIRI_TELEGRAM_BOT_TOKEN in ~/kognai/.env
#      echo "ACHIRI_TELEGRAM_BOT_TOKEN=bot<your_token>" >> ~/kognai/.env
#   2. Run this script from ~/kognai/
#
# Usage:
#   ./scripts/achiri/start-bot.sh            # Start bot via PM2
#   ./scripts/achiri/start-bot.sh --check    # Health check only (no start)
#   ./scripts/achiri/start-bot.sh --stop     # Stop the bot

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }

echo -e "\n${CYAN}══════════════════════════════════════════${NC}"
echo -e "${CYAN}  ACHIRI TELEGRAM BOT${NC}"
echo -e "${CYAN}══════════════════════════════════════════${NC}"

# ── Check mode ───────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--stop" ]]; then
  echo -e "\n${CYAN}[stop]${NC}"
  pm2 stop achiri-telegram 2>/dev/null && ok "achiri-telegram stopped" || warn "achiri-telegram was not running"
  exit 0
fi

# ── Pre-flight checks ─────────────────────────────────────────────────────────
echo -e "\n${CYAN}[1] Pre-flight checks${NC}"

# 1a. .env exists
if [[ -f "$ENV_FILE" ]]; then
  ok ".env found"
else
  fail ".env not found at $ENV_FILE"
  echo "     Create it: touch $REPO_ROOT/.env"
  exit 1
fi

# 1b. ACHIRI_TELEGRAM_BOT_TOKEN set
if grep -q "^ACHIRI_TELEGRAM_BOT_TOKEN=.\+" "$ENV_FILE" 2>/dev/null; then
  TOKEN_PREVIEW=$(grep "^ACHIRI_TELEGRAM_BOT_TOKEN=" "$ENV_FILE" | cut -d= -f2 | cut -c1-10)
  ok "ACHIRI_TELEGRAM_BOT_TOKEN set (${TOKEN_PREVIEW}...)"
else
  fail "ACHIRI_TELEGRAM_BOT_TOKEN not set in .env"
  echo ""
  echo "  Get your token from @BotFather on Telegram, then:"
  echo "    echo 'ACHIRI_TELEGRAM_BOT_TOKEN=bot<TOKEN>' >> $ENV_FILE"
  echo ""
  exit 1
fi

# 1c. Ollama running (for local inference)
if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  ok "Ollama running on :11434"
else
  warn "Ollama not reachable on :11434 — bot will use fallback cloud model"
fi

# 1d. PM2 available
if command -v pm2 >/dev/null 2>&1; then
  ok "pm2 found: $(pm2 --version 2>/dev/null || echo 'version unknown')"
else
  fail "pm2 not found. Install with: npm install -g pm2"
  exit 1
fi

# 1e. Agent source file exists
BOT_SRC="$REPO_ROOT/agents/achiri/telegram-bot.ts"
if [[ -f "$BOT_SRC" ]]; then
  ok "telegram-bot.ts found"
else
  fail "Bot source not found: $BOT_SRC"
  exit 1
fi

if [[ "${1:-}" == "--check" ]]; then
  echo -e "\n${GREEN}All checks passed.${NC} Run without --check to start the bot.\n"
  exit 0
fi

# ── Start via PM2 ─────────────────────────────────────────────────────────────
echo -e "\n${CYAN}[2] Starting achiri-telegram${NC}"

# Load .env into environment for PM2
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

pm2 start "$REPO_ROOT/ecosystem.config.js" --only achiri-telegram
ok "achiri-telegram started via PM2"

# ── Post-start health check ───────────────────────────────────────────────────
echo -e "\n${CYAN}[3] Health check (5s)${NC}"
sleep 5

STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import json, sys
procs = json.load(sys.stdin)
for p in procs:
    if p.get('name') == 'achiri-telegram':
        print(p.get('pm2_env', {}).get('status', 'unknown'))
        break
" 2>/dev/null || echo "unknown")

if [[ "$STATUS" == "online" ]]; then
  ok "achiri-telegram status: online"
else
  fail "achiri-telegram status: $STATUS"
  echo "     Check logs: pm2 logs achiri-telegram --lines 20"
  echo "     Error log:  tail -30 $REPO_ROOT/logs/achiri-telegram-error.log"
  exit 1
fi

echo -e "\n${GREEN}🤖 Achiri Telegram bot is live.${NC}"
echo    "   Monitor: pm2 logs achiri-telegram"
echo    "   Stop:    ./scripts/achiri/start-bot.sh --stop"
echo ""
