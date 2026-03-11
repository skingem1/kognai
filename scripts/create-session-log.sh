#!/bin/bash
set -e

# Compute the current date and log file path
DATE=$(date +%Y-%m-%d)
LOG_FILE="workspace/memory/$DATE.md"

# Create workspace/memory directory if it doesn't exist
mkdir -p "workspace/memory"

# Check if the log file already exists
if [[ -f "$LOG_FILE" ]]; then
  # Append the session continuation section
  echo "## Session Continuation — $(date +%H:%M)" >> "$LOG_FILE"
  exit 0
fi

# Create the new log file with the full template
echo "# Session Log — $DATE" > "$LOG_FILE"

# ## Active Sprint section
SPRINT_FILE=$(find "workspace/sprints/" -name "sprint-*.json" | sort -r | grep -E 'sprint-[0-9]+.json' | head -n1)
if [[ -f "$SPRINT_FILE" ]]; then
  PENDING=$(jq -r '[.tasks[] | select(.status == "pending")] | length' "$SPRINT_FILE" 2>/dev/null || echo 0)
  if [[ "$PENDING" -gt 0 ]]; then
    echo "## Active Sprint" >> "$LOG_FILE"
    echo "Sprint file: $SPRINT_FILE" >> "$LOG_FILE"
    echo "Pending tasks: $PENDING" >> "$LOG_FILE"
  else
    echo "## Active Sprint" >> "$LOG_FILE"
    echo "No active sprint (all tasks completed)" >> "$LOG_FILE"
  fi
else
  echo "## Active Sprint" >> "$LOG_FILE"
  echo "No active sprint" >> "$LOG_FILE"
fi

# ## Tasks Completed Today (placeholder)
echo "## Tasks Completed Today" >> "$LOG_FILE"
echo "_Updated by orchestrator_" >> "$LOG_FILE"

# ## Key Decisions (placeholder)
echo "## Key Decisions" >> "$LOG_FILE"
echo "_Updated by orchestrator_" >> "$LOG_FILE"

# ## Cross-Agent Corrections
CORRECTIONS=$(grep -A 5 "## $DATE" "shared-context/FEEDBACK-LOG.md" | grep -v "## $DATE")
if [[ -n "$CORRECTIONS" ]]; then
  echo "## Cross-Agent Corrections" >> "$LOG_FILE"
  echo "$CORRECTIONS" >> "$LOG_FILE"
else
  echo "## Cross-Agent Corrections" >> "$LOG_FILE"
  echo "_None today_" >> "$LOG_FILE"
fi

# ## ACP Score Changes
ACP_COUNT=$(jq -r --arg date "$DATE" '[.[] | select(.timestamp | startswith($date))] | length' "acp/ledger.json" 2>/dev/null || echo 0)
if [[ "$ACP_COUNT" -gt 0 ]]; then
  echo "## ACP Score Changes" >> "$LOG_FILE"
  echo "Today's entries: $ACP_COUNT" >> "$LOG_FILE"
  jq -r --arg date "$DATE" '.[] | select(.timestamp | startswith($date)) | "  - \(.agent_id) task \(.task_id): \(.outcome)"' "acp/ledger.json" 2>/dev/null >> "$LOG_FILE" || true
else
  echo "## ACP Score Changes" >> "$LOG_FILE"
  echo "_None today_" >> "$LOG_FILE"
fi

# ## Budget Status
ROUTING_DIR="logs/routing"
if ls "$ROUTING_DIR"/*.jsonl 2>/dev/null | head -1 | grep -q .; then
  TOTAL_COST=$(cat "$ROUTING_DIR"/*.jsonl 2>/dev/null | jq -r --arg date "$DATE" 'select(.timestamp // "" | startswith($date)) | .costUsdc // 0' 2>/dev/null | awk '{sum += $1} END {printf "%.4f", sum+0}')
  echo "## Budget Status" >> "$LOG_FILE"
  printf "Spent: \$%s USDC today
" "$TOTAL_COST" >> "$LOG_FILE"
else
  echo "## Budget Status" >> "$LOG_FILE"
  echo "_No routing logs today_" >> "$LOG_FILE"
fi

# ## Notes
echo "## Notes" >> "$LOG_FILE"

echo "Created session log: $LOG_FILE"