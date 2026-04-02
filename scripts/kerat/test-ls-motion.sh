#!/usr/bin/env bash
# TICKET-030-C: LatentSync motion validation test
#
# Runs LatentSync directly on existing .tmp/ assets with a brightness-boosted portrait.
# Measures inter-frame luminance variation in the mouth region to confirm motion is generated.
#
# Root cause context:
#   The dark Ker@ portrait (L≈40 at mouth = ~16% brightness) is out-of-distribution
#   for LatentSync's diffusion model (trained on well-lit faces). After LatentSync's
#   Normalize([0.5],[0.5]) transform, dark pixels map to ≈-0.69 where the model
#   expects ≈+0.4. Brightness boost (gamma=2.0) brings L≈40 → L≈101 before passing
#   to LatentSync, then LP warp extracts motion delta and applies it to the original dark portrait.
#
# Usage: bash scripts/kerat/test-ls-motion.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KERAT_DIR="$ROOT/workspace/kerat"
LATENTSYNC_DIR="$HOME/ComfyUI/custom_nodes/ComfyUI-LatentSyncWrapper"
COMFYUI_ENV="$HOME/comfyui-env/bin/python"
CHECKPOINT="$LATENTSYNC_DIR/checkpoints/latentsync_unet.pt"
UNET_CONFIG="$LATENTSYNC_DIR/configs/unet/stage2.yaml"
TMP_DIR="$KERAT_DIR/.tmp"
OUT_DIR="$KERAT_DIR/output"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

echo "[test-ls-motion] TICKET-030-C — LatentSync motion validation"
echo "[test-ls-motion] Root: $ROOT"

# ─── Find existing .tmp assets ────────────────────────────────────────────────
# Use the most recent portrait loop + TTS WAV from .tmp/
PORTRAIT_LOOP="$(ls -t "$TMP_DIR"/kerat_portrait_*.mp4 2>/dev/null | head -1)"
TTS_WAV="$(ls -t "$TMP_DIR"/tts_*.wav 2>/dev/null | head -1)"
PORTRAIT_JPG="$(ls -t "$KERAT_DIR/portraits/"*.jpg 2>/dev/null | head -1)"

if [[ -z "$TTS_WAV" || ! -f "$TTS_WAV" ]]; then
  echo "[test-ls-motion] ERROR: No TTS WAV found in $TMP_DIR" >&2
  echo "[test-ls-motion]   Run: cd ~/kognai && ts-node scripts/kerat/kerat-lipsync.ts --text 'Hello world' --skip-grade --skip-gfpgan" >&2
  exit 1
fi

echo "[test-ls-motion] TTS WAV:       $TTS_WAV"

# ─── Create brightness-boosted portrait video ─────────────────────────────────
DURATION_SEC="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TTS_WAV" 2>/dev/null || echo 5)"
VIDEO_DURATION="$(echo "$DURATION_SEC + 1.5" | bc)"

BRIGHT_PORTRAIT_VIDEO="$TMP_DIR/kerat_portrait_bright_${TIMESTAMP}.mp4"

if [[ -n "$PORTRAIT_JPG" && -f "$PORTRAIT_JPG" ]]; then
  echo "[test-ls-motion] Portrait JPG:  $PORTRAIT_JPG"
  echo "[test-ls-motion] Creating brightness-boosted portrait video (gamma=2.0, brings L≈40→L≈101)..."
  ffmpeg -y -loglevel error \
    -loop 1 -i "$PORTRAIT_JPG" \
    -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:black,eq=gamma=2.0:saturation=0.85" \
    -c:v libx264 -t "$VIDEO_DURATION" -r 25 -pix_fmt yuv420p \
    "$BRIGHT_PORTRAIT_VIDEO"
  echo "[test-ls-motion] Bright portrait video: $BRIGHT_PORTRAIT_VIDEO"
elif [[ -n "$PORTRAIT_LOOP" && -f "$PORTRAIT_LOOP" ]]; then
  echo "[test-ls-motion] Using existing portrait loop (applying brightness in filter chain)..."
  ffmpeg -y -loglevel error \
    -i "$PORTRAIT_LOOP" \
    -vf "eq=gamma=2.0:saturation=0.85" \
    -c:v libx264 -pix_fmt yuv420p \
    "$BRIGHT_PORTRAIT_VIDEO"
  echo "[test-ls-motion] Bright portrait video: $BRIGHT_PORTRAIT_VIDEO"
else
  echo "[test-ls-motion] ERROR: No portrait found" >&2
  exit 1
fi

# ─── Run LatentSync on bright portrait ────────────────────────────────────────
RAW_LS_OUT="$OUT_DIR/kerat_ls_motion_test_${TIMESTAMP}.mp4"
echo "[test-ls-motion] Running LatentSync (this takes 1-3 minutes on MPS)..."

# inference.py resolves mask_image_path as "latentsync/utils/mask.png" (relative),
# so we must cd into the LatentSyncWrapper directory before running it.
(
  cd "$LATENTSYNC_DIR"
  PYTHONPATH="$LATENTSYNC_DIR" \
  PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0 \
  PYTORCH_ENABLE_MPS_FALLBACK=1 \
  "$COMFYUI_ENV" \
    "$LATENTSYNC_DIR/scripts/inference.py" \
    --unet_config_path "$UNET_CONFIG" \
    --inference_ckpt_path "$CHECKPOINT" \
    --video_path "$BRIGHT_PORTRAIT_VIDEO" \
    --audio_path "$TTS_WAV" \
    --video_out_path "$RAW_LS_OUT" \
    --inference_steps 20 \
    --guidance_scale 7.0 \
    --device mps
)

if [[ ! -f "$RAW_LS_OUT" ]]; then
  echo "[test-ls-motion] ERROR: LatentSync did not produce output" >&2
  exit 1
fi

echo "[test-ls-motion] Raw LS output: $RAW_LS_OUT"

# ─── Measure inter-frame L variation ─────────────────────────────────────────
echo "[test-ls-motion] Measuring mouth-region L variation..."

export RAW_LS_OUT
"$COMFYUI_ENV" - << 'PYEOF'
import sys, os
sys.path.insert(0, '')
import cv2
import numpy as np

path = os.environ.get('RAW_LS_OUT', '')
if not path or not os.path.exists(path):
    # fall back to env lookup handled by shell
    import glob, subprocess
    result = subprocess.run(['ls', '-t', os.path.expanduser('~/kognai/workspace/kerat/output/kerat_ls_motion_test_*.mp4')],
                           capture_output=True, text=True)
    files = result.stdout.strip().split('\n')
    path = files[0] if files and files[0] else ''

if not path or not os.path.exists(path):
    print("ERROR: cannot find LS output video")
    sys.exit(1)

cap = cv2.VideoCapture(path)
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps = cap.get(cv2.CAP_PROP_FPS)

y1, y2 = int(h*0.50), int(h*0.75)
x1, x2 = int(w*0.30), int(w*0.70)

L_means = []
frame_idx = 0
while True:
    ret, frame = cap.read()
    if not ret: break
    if frame_idx % 3 == 0:
        patch = frame[y1:y2, x1:x2]
        lab = cv2.cvtColor(patch, cv2.COLOR_BGR2LAB)
        L_means.append(float(lab[:,:,0].mean()))
    frame_idx += 1
cap.release()

arr = np.array(L_means)
print(f"\n[motion-diagnostic]")
print(f"  File:   {path}")
print(f"  Frames: {n}  ({w}x{h} @ {fps:.0f}fps)")
print(f"  Mouth-patch L:  min={arr.min():.1f}  max={arr.max():.1f}  range={arr.max()-arr.min():.1f}  std={arr.std():.2f}")
print(f"  First 20 L values: {[f'{v:.1f}' for v in arr[:20]]}")
print()

L_range = arr.max() - arr.min()
if L_range >= 8.0:
    print(f"  ✅ MOTION DETECTED (L range={L_range:.1f} ≥ 8.0) — LatentSync is producing lip movement")
    print(f"     LP warp can now transfer this motion to the dark portrait")
elif L_range >= 3.0:
    print(f"  ⚠️  WEAK MOTION (L range={L_range:.1f}, 3.0-8.0) — subtle but may be usable")
    print(f"     Consider increasing guidance_scale or inference_steps")
else:
    print(f"  ❌ NO MOTION (L range={L_range:.1f} < 3.0) — LatentSync not animating")
    print(f"     Try: higher gamma (gamma=3.0), or use a different portrait")
PYEOF

echo ""
echo "[test-ls-motion] Raw LS output saved at: $RAW_LS_OUT"
echo "[test-ls-motion] To run LP warp test on this output:"
echo "  bash scripts/kerat/test-liveportrait.sh --driver $RAW_LS_OUT"
