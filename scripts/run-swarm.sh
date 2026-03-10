#!/usr/bin/env bash
# run-swarm.sh — Swarm launcher that correctly sources .env before ts-node
# Usage: ./scripts/run-swarm.sh workspace/sprints/sprint-NNN.json
# dotenv inside ts-node doesn't resolve __dirname correctly via npx — this wrapper fixes it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KOGNAI_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$KOGNAI_ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌  .env not found at $ENV_FILE" >&2
  exit 1
fi

# Export all vars from .env into the shell environment
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "⚠   ANTHROPIC_API_KEY not set in $ENV_FILE — Claude supervisor/CEO will be unavailable" >&2
fi
if [[ -z "${MINIMAX_API_KEY:-}" ]]; then
  echo "❌  MINIMAX_API_KEY not set — cloud-code tasks will fail" >&2
  exit 1
fi

SPRINT_FILE="${1:-}"
if [[ -z "$SPRINT_FILE" ]]; then
  echo "Usage: $0 <sprint-file.json>" >&2
  echo "  e.g. $0 workspace/sprints/sprint-069.json" >&2
  exit 1
fi

cd "$KOGNAI_ROOT"
echo "🚀  Starting swarm: $SPRINT_FILE"
exec npx ts-node scripts/orchestrate-agents-v2.ts "$SPRINT_FILE"
