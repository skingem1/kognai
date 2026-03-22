#!/usr/bin/env bash
# publish-v2-video.sh — Sprint 790 (SCS-001-V2-005)
#
# Bridge between v2 pipeline output and Browser Use TikTok upload.
# Reads a v2 run result.json → extracts video path + scenario → publishes.
#
# Usage:
#   bash scripts/scs001/publish-v2-video.sh <run-dir>           # prepare only
#   bash scripts/scs001/publish-v2-video.sh <run-dir> --post    # actually post
#
# Example:
#   bash scripts/scs001/publish-v2-video.sh workspace/scs001/v2-runs/v2-run-2026-03-22T23-00-00 --post

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

RUN_DIR="${1:-}"
DO_POST=""

# Parse --post flag
shift 1 2>/dev/null || true
for arg in "$@"; do
  case "$arg" in
    --post) DO_POST="--post" ;;
  esac
done

if [ -z "$RUN_DIR" ]; then
  echo "❌ Usage: publish-v2-video.sh <run-dir> [--post]"
  echo "   Run dir contains result.json from run-v2-pipeline.ts"
  exit 1
fi

RESULT_FILE="$RUN_DIR/result.json"
if [ ! -f "$RESULT_FILE" ]; then
  echo "❌ No result.json in $RUN_DIR"
  echo "   Run the v2 pipeline first: npx ts-node scripts/scs001/run-v2-pipeline.ts"
  exit 1
fi

# Extract fields from result.json
STATUS=$(python3 -c "import json; d=json.load(open('$RESULT_FILE')); print(d.get('status',''))")
if [ "$STATUS" != "pass" ]; then
  echo "❌ Pipeline status is '$STATUS', not 'pass'. Cannot publish."
  exit 1
fi

VIDEO_PATH=$(python3 -c "import json; d=json.load(open('$RESULT_FILE')); print(d.get('video',{}).get('file_path',''))")
if [ -z "$VIDEO_PATH" ] || [ ! -f "$VIDEO_PATH" ]; then
  echo "❌ Video file not found: $VIDEO_PATH"
  exit 1
fi

# Build caption from scenario
TITLE=$(python3 -c "import json; d=json.load(open('$RESULT_FILE')); print(d.get('scenario',{}).get('title',''))")
HASHTAGS=$(python3 -c "
import json
d=json.load(open('$RESULT_FILE'))
tags = d.get('scenario',{}).get('hashtags',[])
print(' '.join(['#'+t.replace('#','') for t in tags[:8]]))
")
ANGLE=$(python3 -c "import json; d=json.load(open('$RESULT_FILE')); print(d.get('scenario',{}).get('angle','')[:100])")

CAPTION="$TITLE

$ANGLE

$HASHTAGS"

echo "════════════════════════════════════════════════════════"
echo "  v2 Publishing — Browser Use"
echo "════════════════════════════════════════════════════════"
echo "  Video: $VIDEO_PATH"
echo "  Title: $TITLE"
echo "  Tags:  $HASHTAGS"
echo "  Mode:  $([ -n "$DO_POST" ] && echo "POST" || echo "PREPARE ONLY")"
echo "════════════════════════════════════════════════════════"
echo ""

# Call the existing post-tiktok.sh
bash "$ROOT/scripts/scs001/post-tiktok.sh" "$VIDEO_PATH" "$CAPTION" $DO_POST
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  # Log to publish ledger
  LEDGER="$ROOT/workspace/scs001/publish-ledger.jsonl"
  VIDEO_ID=$(python3 -c "import json; d=json.load(open('$RESULT_FILE')); print(d.get('video',{}).get('video_id',''))")
  SCENARIO_ID=$(python3 -c "import json; d=json.load(open('$RESULT_FILE')); print(d.get('scenario',{}).get('scenario_id',''))")

  python3 -c "
import json, datetime
entry = {
    'video_id': '$VIDEO_ID',
    'scenario_id': '$SCENARIO_ID',
    'pipeline': 'v2',
    'method': 'browser-use',
    'posted': $([ -n "$DO_POST" ] && echo "True" || echo "False"),
    'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'
}
with open('$LEDGER', 'a') as f:
    f.write(json.dumps(entry) + '\n')
"
  echo "📝 Logged to publish-ledger.jsonl"
fi

exit $EXIT_CODE
