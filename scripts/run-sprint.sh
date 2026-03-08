FILE: scripts/run-sprint.sh
#!/bin/bash
# Run a sprint through the orchestrator swarm.
# Usage: ./scripts/run-sprint.sh [sprint-NNN.json]
# If no arg given, finds the newest pending sprint in workspace/sprints/
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -n "$1" ]; then
  SPRINT="$1"
else
  # Find newest sprint with pending tasks
  SPRINT=$(python3 -c "
import json, glob, sys
files = sorted(glob.glob('workspace/sprints/sprint-*.json'), reverse=True)
for f in files:
    data = json.load(open(f))
    if any(t.get('status') == 'pending' for t in data.get('tasks', [])):
        print(f); break
else:
    print('', end='')
")
  if [ -z "$SPRINT" ]; then
    echo 'No pending sprints found in workspace/sprints/'
    exit 1
  fi
fi

echo "Launching swarm on: $SPRINT"
npx ts-node --transpile-only scripts/orchestrate-agents-v2.ts "$SPRINT"