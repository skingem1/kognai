#!/usr/bin/env python3
"""
TICKET-030-B Fix: Reinhard Lab Color Transfer — Full-Frame Colour Matching

The core artifact in LatentSync output on dark/stylised portraits is a
brightness mismatch between the generated face (bright, trained on studio
faces) and the source portrait (dark / colour-graded).  GFPGAN makes this
*worse* by restoring faces to natural brightness.

This script applies Reinhard (2001) Lab colour transfer to the ENTIRE
LatentSync output frame, so both the background and the generated face shift
to match the source portrait's colour palette.  Since both regions move
together, the paste boundary becomes invisible.

Algorithm:
  1. Compute mean/std of each Lab channel from the SOURCE PORTRAIT (reference).
  2. For each output frame from LatentSync:
       a. Convert frame to Lab.
       b. Scale each channel: ch' = (ch - tgt_mean) / tgt_std * src_std + src_mean
       c. Clamp to [0, 255], convert back to BGR.
  3. Write graded frames to a temp mp4 (no audio).
  4. Mux audio from the original LatentSync video via ffmpeg.

Usage:
  python3 kerat_color_grade.py \
      --input  /path/to/latentsync.mp4 \
      --reference /path/to/portrait.jpg \
      --output /path/to/graded.mp4 \
      [--strength 1.0]   # 0.0 = no grade, 1.0 = full transfer (default)
"""

import argparse
import os
import sys
import subprocess
import shutil
import cv2
import numpy as np
from pathlib import Path


# ─── Args ─────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(
        description="Reinhard Lab colour transfer for Ker@ lipsync output"
    )
    p.add_argument("--input",     required=True,  help="Input video (LatentSync output)")
    p.add_argument("--reference", required=True,  help="Source portrait image (colour reference)")
    p.add_argument("--output",    required=True,  help="Colour-graded output video path")
    p.add_argument("--strength",  type=float, default=1.0,
                   help="Grade strength: 0.0 = no change, 1.0 = full Reinhard transfer")
    return p.parse_args()


# ─── Reinhard Lab Transfer ────────────────────────────────────────────────────

def compute_lab_stats(img_bgr: np.ndarray):
    """Return (mean, std) per Lab channel from a BGR image."""
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    stats = []
    for ch in range(3):
        m = float(lab[:, :, ch].mean())
        s = float(max(lab[:, :, ch].std(), 0.5))   # floor avoids div/0
        stats.append((m, s))
    return stats   # [(L_mean, L_std), (a_mean, a_std), (b_mean, b_std)]


def reinhard_frame(frame_bgr: np.ndarray, src_stats, strength: float) -> np.ndarray:
    """
    Apply Reinhard Lab transfer from src_stats to frame_bgr.
    strength: 0.0 = identity, 1.0 = full transfer
    """
    lab = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    result = lab.copy()
    for ch in range(3):
        s_mean, s_std = src_stats[ch]
        t_mean = float(lab[:, :, ch].mean())
        t_std  = float(max(lab[:, :, ch].std(), 0.5))
        transferred = (lab[:, :, ch] - t_mean) / t_std * s_std + s_mean
        # Blend with original according to strength
        result[:, :, ch] = (1.0 - strength) * lab[:, :, ch] + strength * transferred
    result = np.clip(result, 0, 255).astype(np.uint8)
    return cv2.cvtColor(result, cv2.COLOR_LAB2BGR)


# ─── Video Processing ─────────────────────────────────────────────────────────

def grade_video(input_path: str, output_path: str,
                src_stats, strength: float) -> str:
    """Grade all frames, return path to temp raw video (no audio)."""
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(f"[color_grade] ERROR: Cannot open: {input_path}", file=sys.stderr)
        sys.exit(1)

    fps    = cap.get(cv2.CAP_PROP_FPS) or 25.0
    w      = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h      = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"[color_grade] Input: {w}×{h} @ {fps:.1f}fps  frames={total}  strength={strength:.2f}")

    tmp_path = output_path + ".raw.mp4"
    fourcc   = cv2.VideoWriter_fourcc(*"mp4v")
    writer   = cv2.VideoWriter(tmp_path, fourcc, fps, (w, h))

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1
        if frame_idx % 25 == 0 or frame_idx == 1:
            pct = 100 * frame_idx // max(total, 1)
            print(f"[color_grade]   frame {frame_idx}/{total} ({pct}%)")

        graded = reinhard_frame(frame, src_stats, strength)
        writer.write(graded)

    cap.release()
    writer.release()
    print(f"[color_grade] {frame_idx} frames graded → {tmp_path}")
    return tmp_path


def mux_audio(raw_video: str, audio_source: str, output_path: str):
    """Mux audio from audio_source into raw_video → output_path."""
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0",
         "-show_entries", "stream=codec_type", "-of", "csv=p=0", audio_source],
        capture_output=True, text=True
    )
    has_audio = "audio" in probe.stdout.strip()

    if has_audio:
        cmd = [
            "ffmpeg", "-y",
            "-i", raw_video,
            "-i", audio_source,
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k",
            "-shortest",
            output_path,
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-i", raw_video,
            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
            output_path,
        ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[color_grade] ERROR: ffmpeg mux failed:\n{result.stderr}", file=sys.stderr)
        shutil.copy(raw_video, output_path)
        print("[color_grade] WARNING: audio mux failed, copying video without audio")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    if not os.path.exists(args.input):
        print(f"[color_grade] ERROR: Input not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(args.reference):
        print(f"[color_grade] ERROR: Reference not found: {args.reference}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    # Load reference portrait and compute Lab stats
    ref_img = cv2.imread(args.reference)
    if ref_img is None:
        print(f"[color_grade] ERROR: Cannot read reference image: {args.reference}", file=sys.stderr)
        sys.exit(1)

    src_stats = compute_lab_stats(ref_img)
    print(f"[color_grade] Reference stats:")
    print(f"  L  mean={src_stats[0][0]:.1f}  std={src_stats[0][1]:.1f}  "
          f"(brightness; typical portrait≈100, dark portrait≈17)")
    print(f"  a  mean={src_stats[1][0]:.1f}  std={src_stats[1][1]:.1f}  (green↔red)")
    print(f"  b  mean={src_stats[2][0]:.1f}  std={src_stats[2][1]:.1f}  (blue↔yellow)")

    # Grade video
    raw_video = grade_video(args.input, args.output, src_stats, args.strength)

    # Mux audio
    mux_audio(raw_video, args.input, args.output)

    # Cleanup
    try:
        os.remove(raw_video)
    except Exception:
        pass

    size_mb = os.path.getsize(args.output) / 1024 / 1024
    print(f"[color_grade] ✅ Done → {args.output}  ({size_mb:.1f}MB)")
    print(f'{{"ok": true, "output": "{args.output}", "size_mb": {size_mb:.2f}}}')


if __name__ == "__main__":
    main()
