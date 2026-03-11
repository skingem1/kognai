#!/usr/bin/env bash
# run-swarm.sh — Swarm launcher that correctly sources .env before ts-node
# Usage: ./scripts/run-swarm.sh [--sovereign] workspace/sprints/sprint-NNN.json
#
# Flags:
#   --sovereign   Force all inference to local Ollama ($0 cost floor, no cloud calls)
#
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

# B.18: Parse --sovereign flag
SOVEREIGN_FLAG=""
SPRINT_FILE=""
for arg in "$@"; do
  if [[ "$arg" == "--sovereign" ]]; then
    SOVEREIGN_FLAG="--sovereign"
    export SOVEREIGN_MODE=1
    echo "⚡  SOVEREIGN MODE — all inference local (\$0 cost floor)"
  else
    SPRINT_FILE="$arg"
  fi
done

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  if [[ -z "$SOVEREIGN_FLAG" ]]; then
    echo "⚠   ANTHROPIC_API_KEY not set — Claude supervisor/CEO will use ClawRouter fallback" >&2
  fi
fi

# MiniMax is now optional (B.20: being retired — ClawRouter/Ollama are the primary backends)
if [[ -z "${MINIMAX_API_KEY:-}" ]]; then
  echo "ℹ   MINIMAX_API_KEY not set — using ClawRouter/Ollama instead (recommended)" >&2
fi

if [[ -z "$SPRINT_FILE" ]]; then
  echo "Usage: $0 [--sovereign] <sprint-file.json>" >&2
  echo "  e.g. $0 workspace/sprints/sprint-069.json" >&2
  echo "  e.g. $0 --sovereign workspace/sprints/sprint-069.json" >&2
  exit 1
fi

cd "$KOGNAI_ROOT"
echo "🚀  Starting swarm: $SPRINT_FILE"
exec npx ts-node scripts/orchestrate-agents-v2.ts "$SPRINT_FILE" $SOVEREIGN_FLAG
