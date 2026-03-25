#!/bin/bash
# ACHIRI ALPHA — Waitlist Broadcast
# Sprint 1208
#
# Sends a Telegram message to every user in workspace/achiri/waitlist.jsonl
# using the ACHIRI_TELEGRAM_BOT_TOKEN.
#
# Usage:
#   bash scripts/achiri/notify-waitlist.sh                          # Interactive prompt for message
#   bash scripts/achiri/notify-waitlist.sh --dry-run                # Show recipients, no send
#   bash scripts/achiri/notify-waitlist.sh --message "Your text"    # Send custom message
#   bash scripts/achiri/notify-waitlist.sh --template alpha-invite  # Use a predefined template
#
# Templates:
#   alpha-invite   — "You're in! Achiri alpha is live at t.me/AchiriBot"
#   reminder       — "Achiri alpha launches April 25. You're on the list!"

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WAITLIST="$REPO_ROOT/workspace/achiri/waitlist.jsonl"
ENV_FILE="$REPO_ROOT/.env"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
hdr()  { echo -e "\n${CYAN}$1${NC}"; }

# Load .env
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE" 2>/dev/null || true; set +a
fi

DRY_RUN=false
MESSAGE=""
TEMPLATE=""

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=true; shift ;;
    --message)   MESSAGE="$2"; shift 2 ;;
    --template)  TEMPLATE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Template lookup
if [[ -n "$TEMPLATE" && -z "$MESSAGE" ]]; then
  case "$TEMPLATE" in
    alpha-invite)
      MESSAGE="🎉 You're in! Achiri alpha is now live. Start chatting: t.me/AchiriBot"
      ;;
    reminder)
      MESSAGE="⏰ Achiri alpha launches April 25. You're on the waitlist — we'll notify you first!"
      ;;
    *)
      echo "Unknown template: $TEMPLATE. Available: alpha-invite, reminder"
      exit 1
      ;;
  esac
fi

# Interactive prompt if no message
if [[ -z "$MESSAGE" && "$DRY_RUN" == "false" ]]; then
  hdr "[Message]"
  echo "Enter message to broadcast (Ctrl+C to cancel):"
  read -r MESSAGE
fi

# Validate
hdr "[Pre-flight]"
[[ -f "$WAITLIST" ]] && ok "Waitlist file found" || { fail "Waitlist not found: $WAITLIST"; exit 1; }

USER_COUNT=$(grep -c '.' "$WAITLIST" 2>/dev/null || echo 0)
ok "Recipients: $USER_COUNT user(s)"

if [[ -z "${ACHIRI_TELEGRAM_BOT_TOKEN:-}" ]]; then
  $DRY_RUN && warn "ACHIRI_TELEGRAM_BOT_TOKEN not set (ok for dry-run)" \
            || { fail "ACHIRI_TELEGRAM_BOT_TOKEN not set. Add to .env then retry."; exit 1; }
else
  ok "ACHIRI_TELEGRAM_BOT_TOKEN: SET"
fi

$DRY_RUN && warn "[DRY RUN] No messages will be sent"

hdr "[Recipients]"
SENT=0; FAILED=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  CHAT_ID=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('chatId',''))" 2>/dev/null || true)
  FIRST_NAME=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('firstName','User'))" 2>/dev/null || true)
  USERNAME=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('username',''))" 2>/dev/null || true)

  if [[ -z "$CHAT_ID" ]]; then
    warn "Skipping entry with no chatId"
    continue
  fi

  DISPLAY="${FIRST_NAME}${USERNAME:+ (@$USERNAME)}"
  echo -e "  → ${DISPLAY} (${CHAT_ID})"

  if [[ "$DRY_RUN" == "false" && -n "$MESSAGE" && -n "${ACHIRI_TELEGRAM_BOT_TOKEN:-}" ]]; then
    API_URL="https://api.telegram.org/bot${ACHIRI_TELEGRAM_BOT_TOKEN}/sendMessage"
    RESPONSE=$(curl -sf -X POST "$API_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"chat_id\": \"${CHAT_ID}\", \"text\": \"${MESSAGE}\", \"parse_mode\": \"HTML\"}" \
      --max-time 10 2>/dev/null || echo '{"ok":false}')

    if echo "$RESPONSE" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); sys.exit(0 if d.get('ok') else 1)" 2>/dev/null; then
      ok "Sent to $DISPLAY"
      SENT=$((SENT + 1))
    else
      fail "Failed to send to $DISPLAY"
      FAILED=$((FAILED + 1))
    fi
  else
    SENT=$((SENT + 1))
  fi
done < "$WAITLIST"

hdr "[Summary]"
if [[ "$DRY_RUN" == "true" ]]; then
  ok "Dry run complete — $USER_COUNT recipients identified, no messages sent"
  echo -e "  Run without --dry-run to broadcast"
elif [[ -z "$MESSAGE" ]]; then
  warn "No message provided — nothing sent"
else
  [[ $SENT -gt 0 ]]   && ok "Sent: $SENT"
  [[ $FAILED -gt 0 ]] && fail "Failed: $FAILED"
  echo ""
  [[ $FAILED -eq 0 ]] && echo -e "${GREEN}✓ Broadcast complete${NC}" || echo -e "${YELLOW}⚠ Broadcast done with $FAILED error(s)${NC}"
fi
