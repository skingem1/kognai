#!/usr/bin/env bash
# bot-setup-guide.sh — Sprint 1449
# Prints step-by-step guide for creating @AchiriBuddyBot and shows launch readiness.
#
# Usage: ./scripts/achiri/bot-setup-guide.sh

LOCAL_ENV="$(cd "$(dirname "$0")/../.." && pwd)/.env"
[[ -f "$LOCAL_ENV" ]] && set -a && source "$LOCAL_ENV" 2>/dev/null || true; set +a

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }

echo -e "\n${CYAN}${BOLD}=== Achiri Launch Readiness ===${NC}\n"

# 1. Check bot token
if [[ -n "${ACHIRI_TELEGRAM_BOT_TOKEN:-}" ]]; then
  ok "ACHIRI_TELEGRAM_BOT_TOKEN is set"
  NEED_BOT=0
else
  fail "ACHIRI_TELEGRAM_BOT_TOKEN not set"
  NEED_BOT=1
fi

# 2. Check base URL
if [[ -n "${ACHIRI_BASE_URL:-}" ]]; then
  ok "ACHIRI_BASE_URL = $ACHIRI_BASE_URL"
else
  warn "ACHIRI_BASE_URL not set (run push-env-to-hetzner.sh after deploy)"
fi

# 3. Check Anthropic key
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  ok "ANTHROPIC_API_KEY is set"
else
  fail "ANTHROPIC_API_KEY not set — Achiri chat will not work"
fi

# 4. Check Supabase
if [[ -n "${SUPABASE_URL:-}" ]]; then
  ok "SUPABASE_URL is set"
else
  fail "SUPABASE_URL not set"
fi

# 5. Bot setup guide (only if needed)
if [[ $NEED_BOT -eq 1 ]]; then
  echo -e "\n${CYAN}${BOLD}--- @AchiriBuddyBot Setup (5 steps) ---${NC}\n"
  echo -e "  ${BOLD}1.${NC} Open Telegram and search for ${BOLD}@BotFather${NC}"
  echo -e "  ${BOLD}2.${NC} Send: ${YELLOW}/newbot${NC}"
  echo -e "  ${BOLD}3.${NC} Name (display): ${YELLOW}Achiri Buddy${NC}"
  echo -e "  ${BOLD}4.${NC} Username (must end in 'bot'): ${YELLOW}AchiriBuddyBot${NC}"
  echo -e "  ${BOLD}5.${NC} BotFather replies with a token. Copy it, then run:\n"
  echo -e "     ${GREEN}echo 'ACHIRI_TELEGRAM_BOT_TOKEN=<your_token>' >> .env${NC}\n"
  echo -e "  Then redeploy:"
  echo -e "     ${CYAN}./scripts/deploy-achiri.sh${NC}"
  echo -e "     ${CYAN}./scripts/achiri/push-env-to-hetzner.sh${NC}"
fi

echo ""
