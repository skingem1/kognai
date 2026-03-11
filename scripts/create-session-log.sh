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
  PENDING=$(jq -r '.pending_tasks | length' "$SPRINT_FILE")
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
ACP_ENTRIES=$(jq -r --arg date "$DATE" '.[] | select(.date == $date)' "acp/ledger.json")
if [[ -n "$ACP_ENTRIES" ]]; then
  COUNT=$(echo "$ACP_ENTRIES" | jq -r '. | length')
  echo "## ACP Score Changes" >> "$LOG_FILE"
  echo "Today's entries: $COUNT" >> "$LOG_FILE"
  echo "$ACP_ENTRIES" | jq -r '.[] | "  - \(.agent): \(.score_change) (from \(.previous_score) to \(.current_score))"' >> "$LOG_FILE"
else
  echo "## ACP Score Changes" >> "$LOG_FILE"
  echo "_None today_" >> "$LOG_FILE"
fi

# ## Budget Status
TOTAL_COST=$(jq -r --arg date "$DATE" 'select(.date == $date) | .costUsdc' "logs/routing/*.jsonl" | awk '{sum += $1} END {printf "%.2f", sum}' 2>/dev/null || echo 0)
if [[ "$TOTAL_COST" != 0 ]]; then
  echo "## Budget Status" >> "$LOG_FILE"
  echo "Spent: $TOTAL_COST USDC today" >> "$LOG_FILE"
else
  echo "## Budget Status" >> "$LOG_FILE"
  echo "_No routing logs today_" >> "$LOG_FILE"
fi

# ## Notes
echo "## Notes" >> "$LOG_FILE"

echo "Created session log: $LOG_FILE"