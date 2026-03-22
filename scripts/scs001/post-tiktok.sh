#!/usr/bin/env bash
# post-tiktok.sh — Sprint 785 (BROWSER-01)
#
# Production TikTok upload via Browser Use.
# MP4 + caption → navigate → upload → fill → screenshot → optionally post.
#
# Usage:
#   bash scripts/scs001/post-tiktok.sh <video_path> <caption> [--post]
#
# Examples:
#   bash scripts/scs001/post-tiktok.sh output/video.mp4 "AI is wild #ai" --post
#   bash scripts/scs001/post-tiktok.sh output/video.mp4 "Test"  # prepare only
#
# Exit codes:
#   0 = success (prepared or posted)
#   1 = error (missing deps, warmup, video not found)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VENV_DIR="$ROOT/.venv-browser-use"
SCRIPT="$ROOT/scripts/scs001/post-tiktok.py"

# Args
VIDEO_PATH="${1:-}"
CAPTION="${2:-}"
DO_POST=""

# Parse --post flag from remaining args
shift 2 2>/dev/null || true
for arg in "$@"; do
  case "$arg" in
    --post) DO_POST="--post" ;;
  esac
done

if [ -z "$VIDEO_PATH" ]; then
  echo "❌ Usage: post-tiktok.sh <video_path> <caption> [--post]"
  exit 1
fi

if [ ! -f "$VIDEO_PATH" ]; then
  echo "❌ Video not found: $VIDEO_PATH"
  exit 1
fi

# Activate venv
if [ ! -d "$VENV_DIR" ]; then
  echo "❌ Browser Use not installed."
  echo "   Run: bash scripts/scs001/install-browser-use.sh"
  exit 1
fi
source "$VENV_DIR/bin/activate"

# Load .env
if [ -f "$ROOT/.env" ]; then
  set -a
  source "$ROOT/.env"
  set +a
fi

# Extract video ID from filename (e.g., video-88863065.mp4 → video-88863065)
VIDEO_ID="$(basename "$VIDEO_PATH" .mp4)"

# Run the production upload script
python "$SCRIPT" \
  --video "$VIDEO_PATH" \
  --caption "$CAPTION" \
  --video-id "$VIDEO_ID" \
  $DO_POST

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  if [ -n "$DO_POST" ]; then
    echo "✅ Video posted to TikTok: $VIDEO_ID"
  else
    echo "📋 Upload prepared. Review in browser, then run with --post to publish."
  fi
fi

exit $EXIT_CODE
