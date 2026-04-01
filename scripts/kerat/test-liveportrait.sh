#!/usr/bin/env bash
# TICKET-030-C: LivePortrait warp pipeline integration test
#
# Finds a dark portrait + a LatentSync output video from the workspace
# and runs kerat_liveportrait_warp.py to validate the pipeline end-to-end.
#
# Usage: bash scripts/kerat/test-liveportrait.sh [--portrait PATH] [--driver PATH]
#
# Exit codes:
#   0  — pipeline ran and produced output (even with warnings)
#   1  — missing assets or pipeline error
#   2  — LivePortrait unavailable (dependencies not installed)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KERAT_DIR="$ROOT/workspace/kerat"
WARP_SCRIPT="$ROOT/scripts/kerat/kerat_liveportrait_warp.py"
COMFYUI_ENV="$HOME/comfyui-env/bin/python"
OUT_DIR="$KERAT_DIR/output"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT="$OUT_DIR/lp_warp_test_$TIMESTAMP.mp4"

echo "[test-liveportrait] TICKET-030-C — LivePortrait warp pipeline test"
echo "[test-liveportrait] Root: $ROOT"

# ─── Locate portrait ──────────────────────────────────────────────────────────
PORTRAIT=""
if [[ "${1:-}" == "--portrait" && -n "${2:-}" ]]; then
  PORTRAIT="$2"
elif ls "$KERAT_DIR/portraits/"*.jpg 2>/dev/null | head -1 | grep -q .; then
  PORTRAIT="$(ls "$KERAT_DIR/portraits/"*.jpg | head -1)"
elif ls "$KERAT_DIR/portraits/"*.png 2>/dev/null | head -1 | grep -q .; then
  PORTRAIT="$(ls "$KERAT_DIR/portraits/"*.png | head -1)"
fi

if [[ -z "$PORTRAIT" || ! -f "$PORTRAIT" ]]; then
  echo "[test-liveportrait] ERROR: No portrait image found in $KERAT_DIR/portraits/" >&2
  exit 1
fi
echo "[test-liveportrait] Portrait: $PORTRAIT"

# ─── Locate driver video (LatentSync output) ──────────────────────────────────
DRIVER=""
# Prefer --driver arg if provided
if [[ "${1:-}" == "--driver" && -n "${2:-}" ]]; then
  DRIVER="$2"
elif [[ "${3:-}" == "--driver" && -n "${4:-}" ]]; then
  DRIVER="$4"
fi

# Auto-find: look for the most recent .mp4 in output/ that is a LatentSync result.
# EXCLUDE test-output files (lp_warp_test_*, kerat_grade_test_*, kerat_gfpgan_test_*)
# to avoid the circular-driver bug where this script uses its own output as input.
if [[ -z "$DRIVER" || ! -f "$DRIVER" ]]; then
  DRIVER="$(ls -t "$OUT_DIR/"*.mp4 2>/dev/null | grep -v 'test' | head -1)"
  if [[ -n "$DRIVER" && -f "$DRIVER" ]]; then
    echo "[test-liveportrait] Auto-selected driver: $DRIVER"
  else
    DRIVER=""
  fi
fi

# Secondary: look in .tmp/ for portrait loop videos (any .mp4)
if [[ -z "$DRIVER" || ! -f "$DRIVER" ]]; then
  TMP_DIR="$KERAT_DIR/.tmp"
  if ls "$TMP_DIR/"*.mp4 2>/dev/null | head -1 | grep -q .; then
    DRIVER="$(ls -t "$TMP_DIR/"*.mp4 | head -1)"
    echo "[test-liveportrait] Fallback driver (portrait loop): $DRIVER"
  fi
fi

if [[ -z "$DRIVER" || ! -f "$DRIVER" ]]; then
  echo "[test-liveportrait] ERROR: No driver video found." >&2
  echo "[test-liveportrait]   Run kerat-lipsync.ts first, or pass --driver /path/to/video.mp4" >&2
  exit 1
fi
echo "[test-liveportrait] Driver: $DRIVER"

# ─── Validate prerequisites ───────────────────────────────────────────────────
if [[ ! -f "$WARP_SCRIPT" ]]; then
  echo "[test-liveportrait] ERROR: kerat_liveportrait_warp.py not found at $WARP_SCRIPT" >&2
  exit 1
fi

if [[ ! -x "$COMFYUI_ENV" ]]; then
  echo "[test-liveportrait] ERROR: comfyui-env Python not found at $COMFYUI_ENV" >&2
  exit 1
fi

# Quick sanity: can we import torch?
if ! "$COMFYUI_ENV" -c "import torch; print('[test-liveportrait] torch', torch.__version__)" 2>&1; then
  echo "[test-liveportrait] ERROR: torch not importable in comfyui-env" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
echo "[test-liveportrait] Output: $OUTPUT"
echo ""
echo "[test-liveportrait] Running kerat_liveportrait_warp.py …"
echo "──────────────────────────────────────────────────────────"

# ─── Run warp pipeline ────────────────────────────────────────────────────────
set +e
RESULT=$("$COMFYUI_ENV" "$WARP_SCRIPT" \
  --portrait "$PORTRAIT" \
  --driver   "$DRIVER" \
  --output   "$OUTPUT" \
  --device   auto \
  2>&1)
EXIT_CODE=$?
set -e

echo "$RESULT"
echo "──────────────────────────────────────────────────────────"

if [[ $EXIT_CODE -eq 2 ]]; then
  echo ""
  echo "[test-liveportrait] RESULT: LivePortrait UNAVAILABLE (exit 2)"
  echo "[test-liveportrait] Caller should fall back to Reinhard grade."
  echo "[test-liveportrait] JSON output:"
  echo "$RESULT" | grep '^{' | tail -1
  exit 2
elif [[ $EXIT_CODE -ne 0 ]]; then
  echo ""
  echo "[test-liveportrait] RESULT: FAILED (exit $EXIT_CODE)"
  exit 1
fi

# ─── Validate output ──────────────────────────────────────────────────────────
if [[ ! -f "$OUTPUT" ]]; then
  echo "[test-liveportrait] RESULT: FAILED — output file not created: $OUTPUT"
  exit 1
fi

SIZE_MB=$(du -m "$OUTPUT" | cut -f1)
echo ""
echo "[test-liveportrait] RESULT: SUCCESS"
echo "[test-liveportrait] Output: $OUTPUT  (${SIZE_MB}MB)"

# Extract and print JSON summary
JSON_LINE=$(echo "$RESULT" | grep '^{.*"ok"' | tail -1)
if [[ -n "$JSON_LINE" ]]; then
  echo "[test-liveportrait] Summary JSON: $JSON_LINE"
fi

exit 0
