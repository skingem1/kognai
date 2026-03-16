#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(dirname "$SCRIPT_DIR")
cd "$PROJECT_ROOT"

echo 'SCS-001 Pipeline Smoke Test'
echo '==========================='
echo ''

npx ts-node scripts/smoke-test-pipeline.ts
EXIT_CODE=$?

echo ''
if [ $EXIT_CODE -eq 0 ]; then
  echo 'Pipeline smoke test PASSED'
else
  echo 'Pipeline smoke test FAILED (exit '$EXIT_CODE')'
fi

exit $EXIT_CODE
