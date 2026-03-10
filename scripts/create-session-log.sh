#!/usr/bin/env bash
# create-session-log.sh — initialize today's session log for an agent
# Usage: ./scripts/create-session-log.sh <agent_id>
# Example: ./scripts/create-session-log.sh harvey

set -euo pipefail

AGENT_ID="${1:-}"
if [[ -z "$AGENT_ID" ]]; then
  echo "Usage: $0 <agent_id>" >&2
  exit 1
fi

WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$WORKSPACE_ROOT/workspace/memory/TEMPLATE.md"
TODAY="$(date +%Y-%m-%d)"
AGENT_DIR="$WORKSPACE_ROOT/workspace/memory/$AGENT_ID"
LOG_FILE="$AGENT_DIR/$TODAY.md"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "Error: template not found at $TEMPLATE" >&2
  exit 1
fi

mkdir -p "$AGENT_DIR"

if [[ -f "$LOG_FILE" ]]; then
  echo "Session log already exists: $LOG_FILE"
  exit 0
fi

sed "s/{DATE}/$TODAY/g; s/{AGENT_ID}/$AGENT_ID/g" "$TEMPLATE" > "$LOG_FILE"
echo "Created session log: $LOG_FILE"
