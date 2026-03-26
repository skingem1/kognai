#!/usr/bin/env bash
# push-env-to-hetzner.sh — Sprint 1449
# Pushes Achiri-specific env vars from local .env to Hetzner, then reloads PM2.
#
# Usage:
#   ./scripts/achiri/push-env-to-hetzner.sh              # live
#   ./scripts/achiri/push-env-to-hetzner.sh --dry-run    # print only

set -euo pipefail

HETZNER_HOST="${HETZNER_HOST:-65.108.90.178}"
HETZNER_USER="${HETZNER_USER:-invoica}"
HETZNER_SSH_KEY="${HETZNER_SSH_KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_ENV="/home/invoica/apps/kognai/.env"

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "\n${CYAN}=== Achiri Hetzner Env Push ===${NC}"
[[ $DRY_RUN -eq 1 ]] && echo -e "${YELLOW}[DRY RUN — nothing will be written]${NC}"

LOCAL_ENV="$(cd "$(dirname "$0")/../.." && pwd)/.env"
if [[ ! -f "$LOCAL_ENV" ]]; then
  echo -e "${RED}ERROR: .env not found at $LOCAL_ENV${NC}"; exit 1
fi

# Load local .env (skip comments and blank lines)
set -a
# shellcheck disable=SC1090
source "$LOCAL_ENV" 2>/dev/null || true
set +a

# Vars to push (skip empty)
ACHIRI_VARS=(
  ANTHROPIC_API_KEY
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_KEY
  OPENAI_API_KEY
  MINIMAX_API_KEY
  MINIMAX_DEFAULT_MODEL
  MINIMAX_TTS_VOICE
  MINIMAX_TTS_EMOTION
  ELEVENLABS_API_KEY
  OLLAMA_HOST
  ACHIRI_TELEGRAM_BOT_TOKEN
  PAYMEE_API_KEY
  PAYMEE_VENDOR_ID
)

LINES=()
for VAR in "${ACHIRI_VARS[@]}"; do
  VAL="${!VAR:-}"
  if [[ -z "$VAL" ]]; then
    echo -e "  ${YELLOW}⚠ skip${NC}  $VAR (not set locally)"
    continue
  fi
  LINES+=("$VAR=$VAL")
  echo -e "  ${GREEN}✓ push${NC}  $VAR"
done

if [[ ${#LINES[@]} -eq 0 ]]; then
  echo -e "${RED}No vars to push — check .env${NC}"; exit 1
fi

SSH="ssh -i $HETZNER_SSH_KEY -o StrictHostKeyChecking=no $HETZNER_USER@$HETZNER_HOST"

if [[ $DRY_RUN -eq 1 ]]; then
  echo -e "\n${YELLOW}[dry-run] Would write ${#LINES[@]} vars to $REMOTE_ENV on $HETZNER_HOST${NC}"
  exit 0
fi

# Build remote .env update: append only vars not already set
REMOTE_CMD="$(printf 'touch %s; ' "$REMOTE_ENV")"
for LINE in "${LINES[@]}"; do
  KEY="${LINE%%=*}"
  REMOTE_CMD+="grep -qF '${KEY}=' $REMOTE_ENV || echo '${LINE}' >> $REMOTE_ENV; "
done

echo ""
echo "[push-env] Writing to $HETZNER_USER@$HETZNER_HOST:$REMOTE_ENV ..."
$SSH "$REMOTE_CMD"
echo -e "${GREEN}✓ Vars written${NC}"

# Reload PM2
echo "[push-env] Reloading achiri-api via PM2 ..."
$SSH "pm2 reload achiri-api 2>&1 | tail -3" || echo -e "${YELLOW}⚠ PM2 reload failed (service may not be running yet)${NC}"

# Health check with 30s timeout
echo "[push-env] Health check ..."
for i in $(seq 1 6); do
  STATUS=$($SSH "curl -sf -o /dev/null -w '%{http_code}' http://localhost:3420/health" 2>/dev/null || echo "000")
  if [[ "$STATUS" == "200" ]]; then
    echo -e "${GREEN}✓ Health check PASS (HTTP 200)${NC}"
    echo ""
    echo "ACHIRI_BASE_URL=http://$HETZNER_HOST/achiri"
    echo -e "${CYAN}→ Add the above to your local .env to set ACHIRI_BASE_URL${NC}"
    exit 0
  fi
  echo "  Attempt $i/6: HTTP $STATUS — retrying in 5s ..."
  sleep 5
done

echo -e "${RED}✗ Health check FAILED after 30s${NC}"
exit 1
