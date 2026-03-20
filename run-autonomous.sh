#!/bin/bash
# ~/kognai/run-autonomous.sh
# Infinite autonomous loop — restarts Claude Code when context fills up
# State persists via MEMORY.md + workspace/scs001/progress.md
#
# COST OPTIMIZATION (v2):
# Before each session, Qwen3:14b (local, $0) reads all state files and produces
# a condensed sprint brief (~2500 tokens). Claude reads ONLY the brief instead
# of raw files (~100K+ tokens). Saves ~95% on input tokens.

PROMPT_FILE="$HOME/kognai/autonomous-prompt.txt"
PROJECT_DIR="$HOME/kognai"
LOG_DIR="$PROJECT_DIR/logs/autonomous"
BRIEF_SCRIPT="$PROJECT_DIR/scripts/generate-sprint-brief.py"

mkdir -p "$LOG_DIR"

SESSION=0
while true; do
  SESSION=$((SESSION + 1))
  TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
  LOG_FILE="$LOG_DIR/session-${SESSION}-${TIMESTAMP}.log"

  echo "$(date '+%Y-%m-%d %H:%M:%S') — Starting autonomous session #${SESSION}" | tee -a "$LOG_FILE"

  # --- PRE-FLIGHT: Generate sprint brief with Qwen ($0) ---
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Running Qwen pre-flight brief generator..." | tee -a "$LOG_FILE"
  cd "$PROJECT_DIR" && python3 "$BRIEF_SCRIPT" 2>&1 | tee -a "$LOG_FILE"
  BRIEF_EXIT=$?
  if [ $BRIEF_EXIT -ne 0 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') — WARNING: Brief generation failed (exit $BRIEF_EXIT). Claude will read raw files." | tee -a "$LOG_FILE"
  else
    echo "$(date '+%Y-%m-%d %H:%M:%S') — Brief generated successfully. Claude will use condensed context." | tee -a "$LOG_FILE"
  fi

  # --- RUN CLAUDE SESSION ---
  cd "$PROJECT_DIR" && claude --dangerously-skip-permissions -p "$(cat "$PROMPT_FILE")" 2>&1 | tee -a "$LOG_FILE"

  EXIT_CODE=$?
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Session #${SESSION} ended (exit code: $EXIT_CODE)" | tee -a "$LOG_FILE"

  # Pause before restart (30s to reduce session churn + let Qwen pre-flight run)
  echo "Restarting in 30s..."
  sleep 30
done
