#!/usr/bin/env bash
# post-tiktok-browser.sh — Sprint 784 (BROWSER-01)
#
# Upload a video to TikTok via Browser Use + Chrome Default profile.
# This wraps browser-upload-test.py for easy use from the publishing pipeline.
#
# Usage:
#   bash scripts/scs001/post-tiktok-browser.sh <video_path> [caption]
#
# Examples:
#   bash scripts/scs001/post-tiktok-browser.sh /path/to/video.mp4 "AI is wild 🤖 #ai #tech"
#   bash scripts/scs001/post-tiktok-browser.sh /path/to/video.mp4  # uses default caption
#
# Prerequisites:
#   1. Run install-browser-use.sh first
#   2. Be logged into TikTok in Chrome
#   3. Warmup must be complete

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VENV_DIR="$ROOT/.venv-browser-use"
SCRIPT="$ROOT/scripts/scs001/browser-upload-test.py"
LOG="$ROOT/logs/browser-post.jsonl"

# Args
VIDEO_PATH="${1:-}"
CAPTION="${2:-}"

if [ -z "$VIDEO_PATH" ]; then
  echo "❌ Usage: post-tiktok-browser.sh <video_path> [caption]"
  exit 1
fi

if [ ! -f "$VIDEO_PATH" ]; then
  echo "❌ Video not found: $VIDEO_PATH"
  exit 1
fi

# Activate venv
if [ ! -d "$VENV_DIR" ]; then
  echo "❌ Browser Use not installed. Run: bash scripts/scs001/install-browser-use.sh"
  exit 1
fi
source "$VENV_DIR/bin/activate"

# Load .env
if [ -f "$ROOT/.env" ]; then
  set -a
  source "$ROOT/.env"
  set +a
fi

echo "══════════════════════════════════════════════════════"
echo "  TIKTOK BROWSER POST"
echo "══════════════════════════════════════════════════════"
echo ""
echo "Video:   $VIDEO_PATH"
echo "Caption: ${CAPTION:-<none provided>}"
echo ""

# Check warmup
WARMUP_FILE="$ROOT/workspace/scs001/warmup-status.json"
if [ ! -f "$WARMUP_FILE" ]; then
  echo "❌ Warmup not started. Run /warmup-start in Telegram."
  exit 1
fi

VERIFIED=$(python3 -c "import json; d=json.load(open('$WARMUP_FILE')); print(d.get('verified', False))" 2>/dev/null)
if [ "$VERIFIED" != "True" ]; then
  echo "❌ Warmup not verified. Complete warmup first."
  exit 1
fi
echo "✅ Warmup verified"

# Run the upload (live mode, prepare but don't post)
python "$SCRIPT" --live --video "$VIDEO_PATH"

# Log
mkdir -p "$(dirname "$LOG")"
echo "{\"event\":\"browser_post\",\"video\":\"$VIDEO_PATH\",\"caption\":\"${CAPTION//\"/\\\"}\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$LOG"

echo ""
echo "✅ Upload prepared. Review in browser and click Post when ready."
