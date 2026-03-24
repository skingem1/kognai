#!/bin/bash
# ARCH-001 — Start kognai-amd21 tmux session
# Sprint 958 / ARCH-001 Task 01
#
# Creates a named tmux session with 4 windows:
#   0: orchestrator   — main orchestration loop
#   1: observer-1     — observer agent A
#   2: observer-2     — observer agent B
#   3: observer-3     — observer agent C

set -e

SESSION="kognai-amd21"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Kill existing session if present
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Create session with first window
tmux new-session -d -s "$SESSION" -n "orchestrator" -c "$REPO_ROOT"

# Add observer windows
tmux new-window -t "$SESSION:1" -n "observer-1" -c "$REPO_ROOT"
tmux new-window -t "$SESSION:2" -n "observer-2" -c "$REPO_ROOT"
tmux new-window -t "$SESSION:3" -n "observer-3" -c "$REPO_ROOT"

# Select orchestrator window
tmux select-window -t "$SESSION:0"

# Set status bar
tmux set-option -t "$SESSION" status-right "#[fg=green]kognai-amd21#[default] %H:%M"

echo "[arch001] session '$SESSION' created — 4 windows"
echo "[arch001] attach: tmux attach -t $SESSION"
echo "[arch001] windows: orchestrator | observer-1 | observer-2 | observer-3"
