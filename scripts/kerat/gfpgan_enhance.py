#!/usr/bin/env python3
"""
TICKET-030 Addendum: GFPGAN Face Super-Resolution Enhancement
Runs after LatentSync to restore face quality and remove rectangular seam artifacts.

Usage:
  python3 gfpgan_enhance.py --input /path/to/lipsync.mp4 --output /path/to/enhanced.mp4 \
                             [--model /path/to/GFPGANv1.4.pth]

Algorithm:
  1. Extract frames via cv2.VideoCapture
  2. For each frame: apply GFPGANer.enhance(frame, has_aligned=False, only_center_face=True, paste_back=True)
  3. GFPGAN detects face, enhances at 2x, restores with trained smooth blending
  4. Resize output frame back to original resolution
  5. Write to temp video via cv2.VideoWriter (no audio)
  6. Mux original audio back via ffmpeg
"""

import argparse
import os
import sys
import subprocess
import tempfile
import shutil
import cv2
import numpy as np
from pathlib import Path

# ─── Args ─────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="GFPGAN face enhancement for KeraÃ lipsync output")
    p.add_argument("--input",  required=True, help="Input video (from LatentSync)")
    p.add_argument("--output", required=True, help="Enhanced output video path")
    p.add_argument("--model",  default=str(Path(__file__).parent.parent.parent /
                               "workspace/kerat/GFPGANv1.4.pth"),
                   help="Path to GFPGANv1.4.pth model weights")
    p.add_argument("--upscale", type=int, default=2,
                   help="GFPGAN upscale factor (frames are resized back to original)")
    p.add_argument("--arch",   default="clean", help="GFPGAN architecture")
    p.add_argument("--channel-multiplier", type=int, default=2, dest="channel_multiplier")
    p.add_argument("--bg-upsampler", default="none",
                   help="Background upsampler: 'none' (fast) or 'realesrgan'")
    return p.parse_args()


# ─── GFPGAN Setup ─────────────────────────────────────────────────────────────

def load_restorer(model_path: str, upscale: int, arch: str, channel_multiplier: int):
    """Load GFPGANer. Lazy import so the error is clear if gfpgan not installed."""
    try:
        from gfpgan import GFPGANer
    except ImportError:
        print("[gfpgan_enhance] ERROR: gfpgan not installed. Run: pip install gfpgan", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(model_path):
        print(f"[gfpgan_enhance] ERROR: Model not found: {model_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[gfpgan_enhance] Loading GFPGAN from {model_path} (upscale={upscale})")
    restorer = GFPGANer(
        model_path=model_path,
        upscale=upscale,
        arch=arch,
        channel_multiplier=channel_multiplier,
        bg_upsampler=None,  # no background upsampling — keep original BG
    )
    return restorer


# ─── Video Processing ─────────────────────────────────────────────────────────

def enhance_video(input_path: str, output_path: str, restorer, upscale: int):
    """Process all frames with GFPGAN, write to output_path (no audio)."""
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(f"[gfpgan_enhance] ERROR: Cannot open video: {input_path}", file=sys.stderr)
        sys.exit(1)

    fps    = cap.get(cv2.CAP_PROP_FPS) or 25.0
    w_orig = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h_orig = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"[gfpgan_enhance] Input: {w_orig}×{h_orig} @ {fps:.1f}fps  frames={total}")

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out_tmp = output_path + ".raw.mp4"
    writer = cv2.VideoWriter(out_tmp, fourcc, fps, (w_orig, h_orig))

    frame_idx = 0
    ok_count  = 0
    fail_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1
        if frame_idx % 25 == 0 or frame_idx == 1:
            print(f"[gfpgan_enhance]   frame {frame_idx}/{total} ({100*frame_idx//max(total,1)}%)")

        try:
            # GFPGAN expects BGR (cv2 default is BGR — correct)
            _, _, restored = restorer.enhance(
                frame,
                has_aligned=False,
                only_center_face=True,
                paste_back=True,
            )
            # restored is BGR, same spatial layout as input
            # Resize back to original if upscale changed dimensions
            if restored.shape[0] != h_orig or restored.shape[1] != w_orig:
                restored = cv2.resize(restored, (w_orig, h_orig), interpolation=cv2.INTER_LANCZOS4)
            writer.write(restored)
            ok_count += 1
        except Exception as e:
            # If GFPGAN fails on a frame (no face detected etc.), use original
            print(f"[gfpgan_enhance]   WARNING frame {frame_idx}: GFPGAN failed ({e}), using original")
            writer.write(frame)
            fail_count += 1

    cap.release()
    writer.release()

    print(f"[gfpgan_enhance] Frames enhanced: {ok_count}  fallback: {fail_count}")
    return out_tmp, fps, w_orig, h_orig


def mux_audio(raw_video: str, original_video: str, output_path: str):
    """
    Mux audio from original_video into raw_video → output_path.
    If original has no audio stream, just re-encode raw_video with ffmpeg.
    """
    print(f"[gfpgan_enhance] Muxing audio from {original_video} → {output_path}")

    # Check if original has audio
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0",
         "-show_entries", "stream=codec_type", "-of", "csv=p=0", original_video],
        capture_output=True, text=True
    )
    has_audio = "audio" in probe.stdout.strip()

    if has_audio:
        cmd = [
            "ffmpeg", "-y",
            "-i", raw_video,
            "-i", original_video,
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            "-shortest",
            output_path,
        ]
    else:
        # No audio — just re-encode video
        cmd = [
            "ffmpeg", "-y",
            "-i", raw_video,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            output_path,
        ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[gfpgan_enhance] ERROR: ffmpeg mux failed:\n{result.stderr}", file=sys.stderr)
        # Fallback: just copy raw video
        shutil.copy(raw_video, output_path)
        print("[gfpgan_enhance] WARNING: audio mux failed, copying video without audio")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    if not os.path.exists(args.input):
        print(f"[gfpgan_enhance] ERROR: Input not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    # Load model
    restorer = load_restorer(
        args.model, args.upscale, args.arch, args.channel_multiplier
    )

    # Enhance frames
    raw_video, fps, w, h = enhance_video(args.input, args.output, restorer, args.upscale)

    # Mux audio
    mux_audio(raw_video, args.input, args.output)

    # Cleanup temp file
    try:
        os.remove(raw_video)
    except Exception:
        pass

    size_mb = os.path.getsize(args.output) / 1024 / 1024
    print(f"[gfpgan_enhance] ✅ Done → {args.output}  ({size_mb:.1f}MB)")
    print(f'{{"ok": true, "output": "{args.output}", "size_mb": {size_mb:.2f}}}')


if __name__ == "__main__":
    main()
