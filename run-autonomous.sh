#!/bin/bash
# ~/kognai/run-autonomous.sh
# Infinite autonomous loop — restarts Claude Code when context fills up
# State persists via MEMORY.md + workspace/scs001/progress.md

PROMPT_FILE="$HOME/kognai/autonomous-prompt.txt"
PROJECT_DIR="$HOME/kognai"
LOG_DIR="$PROJECT_DIR/logs/autonomous"

mkdir -p "$LOG_DIR"

SESSION=0
while true; do
  SESSION=$((SESSION + 1))
  TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
  LOG_FILE="$LOG_DIR/session-${SESSION}-${TIMESTAMP}.log"

  echo "$(date '+%Y-%m-%d %H:%M:%S') — Starting autonomous session #${SESSION}" | tee -a "$LOG_FILE"

  cd "$PROJECT_DIR" && script -q "$LOG_FILE" claude --dangerously-skip-permissions -p "$(cat "$PROMPT_FILE")"

  EXIT_CODE=$?
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Session #${SESSION} ended (exit code: $EXIT_CODE)" | tee -a "$LOG_FILE"

  # Brief pause before restart
  echo "Restarting in 10s..."
  sleep 10
done
