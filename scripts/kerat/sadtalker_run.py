#!/usr/bin/env python3
"""
SadTalker wrapper for Ker@ pipeline.

Takes a portrait image + audio WAV and produces a talking-head MP4 with
3D head motion and lip sync.  Works on Apple Silicon (MPS/CPU).

Usage:
  python3 sadtalker_run.py \
    --portrait /path/to/portrait.jpg \
    --audio    /path/to/speech.wav \
    --out      /path/to/output.mp4 \
    [--size 512] \
    [--preprocess crop] \
    [--still]
"""

import argparse, os, sys, shutil, subprocess, time

# ── Locate SadTalker repo ─────────────────────────────────────────────────────
SADTALKER_DIR = os.path.expanduser("~/SadTalker")
if not os.path.isdir(SADTALKER_DIR):
    print(f"[sadtalker] ERROR: SadTalker not found at {SADTALKER_DIR}", file=sys.stderr)
    sys.exit(1)

sys.path.insert(0, SADTALKER_DIR)
os.chdir(SADTALKER_DIR)   # SadTalker resolves many paths relative to CWD

# ── Suppress noisy warnings ───────────────────────────────────────────────────
import warnings
warnings.filterwarnings("ignore")
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--portrait",   required=True)
    parser.add_argument("--audio",      required=True)
    parser.add_argument("--out",        required=True)
    parser.add_argument("--size",             type=int,   default=512,
                        help="Output resolution (256 or 512)")
    parser.add_argument("--preprocess",       default="crop",
                        choices=["crop", "resize", "full", "extcrop", "extfull"])
    parser.add_argument("--still",            action="store_true",
                        help="Minimal head motion (only lip sync)")
    parser.add_argument("--enhancer",         default="gfpgan",
                        choices=["gfpgan", "RestoreFormer", "none"],
                        help="Face enhancer — use 'none' for dark/cinematic portraits (L<70)")
    parser.add_argument("--expression-scale", type=float, default=1.2,
                        help="Expression multiplier (1.0=flat, 1.2=natural, 1.5=exaggerated)")
    parser.add_argument("--pose-style",       type=int,   default=1,
                        help="Head motion style 0-45 (0=minimal, 1=natural subtle bob)")
    args = parser.parse_args()

    portrait = os.path.abspath(args.portrait)
    audio    = os.path.abspath(args.audio)
    out_path = os.path.abspath(args.out)

    if not os.path.exists(portrait):
        print(f"[sadtalker] ERROR: portrait not found: {portrait}", file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(audio):
        print(f"[sadtalker] ERROR: audio not found: {audio}", file=sys.stderr)
        sys.exit(1)

    checkpoint_dir = os.path.join(SADTALKER_DIR, "checkpoints")
    config_dir     = os.path.join(SADTALKER_DIR, "src", "config")

    # Verify safetensors checkpoint exists
    ckpt = os.path.join(checkpoint_dir, f"SadTalker_V0.0.2_{args.size}.safetensors")
    if not os.path.exists(ckpt):
        print(f"[sadtalker] ERROR: checkpoint not found: {ckpt}", file=sys.stderr)
        print(f"[sadtalker]   Run: bash ~/SadTalker/scripts/download_models.sh", file=sys.stderr)
        sys.exit(1)

    expr_scale = args.expression_scale
    pose_style = args.pose_style

    print(f"[sadtalker] Portrait: {portrait}")
    print(f"[sadtalker] Audio:    {audio}")
    print(f"[sadtalker] Size:     {args.size}  preprocess={args.preprocess}  still={args.still}")
    print(f"[sadtalker] Expression scale: {expr_scale}  Pose style: {pose_style}  Enhancer: {args.enhancer}")

    # ── Import SadTalker internals ────────────────────────────────────────────
    import torch
    from src.utils.preprocess import CropAndExtract
    from src.test_audio2coeff import Audio2Coeff
    from src.facerender.animate import AnimateFromCoeff
    from src.generate_batch import get_data
    from src.generate_facerender_batch import get_facerender_data
    from src.utils.init_path import init_path
    from src.utils.face_enhancer import enhancer_list

    # Device selection: MPS > CPU (SadTalker doesn't natively support MPS, so CPU is safe)
    if torch.backends.mps.is_available():
        device = "mps"
        print("[sadtalker] Device: mps (with CPU fallback)")
    else:
        device = "cpu"
        print("[sadtalker] Device: cpu")

    sadtalker_paths = init_path(
        checkpoint_dir, config_dir,
        size=args.size,
        old_version=False,
        preprocess=args.preprocess,
    )

    # ── Pipeline ──────────────────────────────────────────────────────────────
    tmp_dir = os.path.join(os.path.dirname(out_path), ".sadtalker_tmp")
    os.makedirs(tmp_dir, exist_ok=True)

    try:
        # Step 1: Preprocess portrait → 3DMM coefficients
        preprocess_model = CropAndExtract(sadtalker_paths, device)

        first_frame_dir = os.path.join(tmp_dir, "first_frame")
        os.makedirs(first_frame_dir, exist_ok=True)

        print("[sadtalker] Extracting 3D face coefficients from portrait ...")
        first_coeff_path, crop_pic_path, crop_info = preprocess_model.generate(
            portrait, first_frame_dir, args.preprocess, source_image_flag=True, pic_size=args.size
        )
        if first_coeff_path is None:
            print("[sadtalker] ERROR: Face not detected in portrait", file=sys.stderr)
            sys.exit(1)

        # Step 2: Audio → expression coefficients
        audio_to_coeff = Audio2Coeff(sadtalker_paths, device)
        batch = get_data(
            first_coeff_path, audio, device,
            ref_eyeblink_coeff_path=None, still=args.still
        )
        print("[sadtalker] Audio → expression coefficients ...")
        coeff_path = audio_to_coeff.generate(batch, tmp_dir, pose_style=pose_style, ref_pose_coeff_path=None)

        # Step 3: Render animated video
        data = get_facerender_data(
            coeff_path, crop_pic_path, first_coeff_path, audio,
            2,
            input_yaw_list=None, input_pitch_list=None, input_roll_list=None,
            expression_scale=expr_scale, still_mode=args.still,
            preprocess=args.preprocess, size=args.size,
        )

        animate_from_coeff = AnimateFromCoeff(sadtalker_paths, device)
        enhancer_arg = args.enhancer if args.enhancer != "none" else None
        if enhancer_arg:
            print(f"[sadtalker] Rendering animated frames + enhancing with {enhancer_arg} ...")
        else:
            print("[sadtalker] Rendering animated frames ...")
        result_path = animate_from_coeff.generate(
            data, tmp_dir, crop_pic_path, crop_info,
            enhancer=enhancer_arg,
            preprocess=args.preprocess, img_size=args.size
        )

        # Copy result to out_path
        if not os.path.exists(result_path):
            print(f"[sadtalker] ERROR: render produced no output at {result_path}", file=sys.stderr)
            sys.exit(1)

        shutil.move(result_path, out_path)
        size_mb = os.path.getsize(out_path) / 1e6
        print(f"[sadtalker] ✅ Done → {out_path}  ({size_mb:.1f}MB)")
        print(f'{{"ok": true, "output": "{out_path}", "size_mb": {size_mb:.2f}}}')

    finally:
        # Clean up tmp
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
