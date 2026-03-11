#!/bin/bash

# Compute the current date and log file path
DATE=$(date +%Y-%m-%d)
AGENT_DIR="/path/to/agent/directory"  # Replace with actual path
LOG_FILE="$AGENT_DIR/$DATE.md"

# Ensure the agent directory exists
mkdir -p "$AGENT_DIR"

# Check if the log file already exists
if [[ -f "$LOG_FILE" ]]; then
  # Append the session continuation section
  echo "## Session Continuation — $(date +%H:%M)" >> "$LOG_FILE"
  exit 0
fi

# Create the new log file with the full template
echo "# Session Log — $DATE" > "$LOG_FILE"
echo "## Active Sprint" >> "$LOG_FILE"
echo "## Other Sections" >> "$LOG_FILE"
echo "## Additional Notes" >> "$LOG_FILE"

# Optional: Add logic to dynamically populate the Active Sprint section
# For example, by reading from a file or querying a database
# echo "### Sprint Summary" >> "$LOG_FILE"
# echo "This is a placeholder for the sprint summary." >> "$LOG_FILE"

echo "Created session log: $LOG_FILE"