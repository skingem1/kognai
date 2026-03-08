#!/bin/bash
# Kognai Vault Dashboard — Stop
PID_FILE="$(dirname "$0")/.pid"
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  kill "$PID" 2>/dev/null && echo "Dashboard stopped (PID $PID)" || echo "Process $PID not running"
  rm "$PID_FILE"
else
  echo "No PID file found. Trying to find uvicorn..."
  pkill -f "uvicorn server:app.*11436" && echo "Dashboard stopped" || echo "Dashboard not running"
fi
