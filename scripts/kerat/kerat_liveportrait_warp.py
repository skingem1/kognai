#!/usr/bin/env python3
"""
TICKET-030-C: LivePortrait Warp Pipeline — Source Pixel Warp, No Injection

Root cause of previous artifacts (TICKET-030-A/B):
  LatentSync INJECTS newly-generated face pixels that are bright/studio-tone
  onto a dark, colour-graded source portrait.  No colour correction can fully
  hide the boundary because the injected pixels fundamentally differ from the
  source in texture and statistics.

LivePortrait fix:
  Instead of generating new face pixels, LivePortrait WARPS the source
  portrait's own pixels using implicit 3-D keypoint motion extracted from the
  LatentSync driving video.  Since every output pixel originates from the dark
  source portrait, there is zero colour mismatch by construction.

Pipeline:
  source portrait (static image)
        │
        ▼  CropperFaceAlignment  →  256×256 face crop + affine M_o2c
        │  LivePortraitWrapper   →  appearance features f_s, keypoints x_s
        │
  LatentSync output video (driving frames)
        │  LivePortraitPipeline.execute()
        │    • extracts lip motion delta per driving frame
        │    • warps source appearance features → 512×512 output crop
        │
        ▼  inverse affine M_c2o + gaussian feather mask → composite on source frame
        │
  ffmpeg mux audio → final output

Usage:
  python3 kerat_liveportrait_warp.py \
      --portrait  /path/to/portrait.jpg \
      --driver    /path/to/latentsync.mp4 \
      --output    /path/to/liveportrait.mp4 \
      [--audio    /path/to/original.wav] # if set, mux this audio; else use driver audio
      [--device   mps|cpu]              # default: auto (mps if available)
      [--dtype    fp32|fp16]            # default: fp32 (fp16 can be used on CUDA)
      # Exit codes: 0=ok, 1=input/runtime error, 2=liveportrait_unavailable (caller may fallback)
"""

# ─── 0. Inject comfy + folder_paths mocks BEFORE any LP import ────────────────
import sys
import os
import types

# Lift the MPS memory cap before torch is imported.  MPS defaults to a ~30 GB
# hard watermark on M-series chips.  Setting 0.0 lets MPS use all available
# unified memory (system enforces the real limit instead).
os.environ.setdefault("PYTORCH_MPS_HIGH_WATERMARK_RATIO", "0.0")

# Determine device early so mocks can reference it
import torch
import torch.fx.graph_module  # required for landmark_model.pth safe-global registration

# PyTorch ≥2.6 made weights_only=True the default.  landmark_model.pth is a
# compiled torch.fx.GraphModule — its pickled representation uses
# reduce_graph_module which is not in the default allowlist.
# Register it before ANY torch.load call executes (including inside LP library).
torch.serialization.add_safe_globals([torch.fx.graph_module.reduce_graph_module])

def _autodetect_device():
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


# ── comfy.model_management mock ──────────────────────────────────────────────
def _get_autocast_device(device):
    d = str(device)
    return d.split(":")[0]  # "mps", "cpu", "cuda"

_comfy_device = _autodetect_device()

mm_mock = types.ModuleType("comfy.model_management")
mm_mock.get_torch_device = lambda: _comfy_device
mm_mock.soft_empty_cache = lambda: None
mm_mock.is_device_mps = lambda d: str(d).startswith("mps")
mm_mock.should_use_fp16 = lambda: False
mm_mock.get_autocast_device = _get_autocast_device

# ── comfy.utils mock ──────────────────────────────────────────────────────────
class _ProgressBar:
    def __init__(self, total): pass
    def update(self, n=1): pass

def _load_torch_file(path, safe_load=False):
    from safetensors.torch import load_file as _sf_load
    if path.endswith(".safetensors"):
        return _sf_load(path)
    return torch.load(path, map_location="cpu", weights_only=False)

import torch.nn.functional as _F
def _common_upscale(tensor, w, h, method, crop):
    return _F.interpolate(tensor, size=(h, w), mode="bilinear", align_corners=False)

utils_mock = types.ModuleType("comfy.utils")
utils_mock.ProgressBar = _ProgressBar
utils_mock.load_torch_file = _load_torch_file
utils_mock.common_upscale = _common_upscale

# ── folder_paths mock ─────────────────────────────────────────────────────────
fp_mock = types.ModuleType("folder_paths")
fp_mock.models_dir = os.path.expanduser("~/ComfyUI/models")

# Register all mocks before any import from the LP node
comfy_pkg = types.ModuleType("comfy")
comfy_pkg.model_management = mm_mock
comfy_pkg.utils = utils_mock
sys.modules["comfy"] = comfy_pkg
sys.modules["comfy.model_management"] = mm_mock
sys.modules["comfy.utils"] = utils_mock
sys.modules["folder_paths"] = fp_mock

# ─── 1. Real imports (now safe) ───────────────────────────────────────────────
import argparse
import subprocess
import shutil
import gc
from contextlib import nullcontext
from pathlib import Path

import cv2
import numpy as np
import yaml
from tqdm import tqdm

LP_ROOT = os.path.expanduser(
    "~/ComfyUI/custom_nodes/ComfyUI-LivePortraitKJ"
)
sys.path.insert(0, LP_ROOT)

try:
    from liveportrait.live_portrait_pipeline import LivePortraitPipeline
    from liveportrait.live_portrait_wrapper import LivePortraitWrapper
    from liveportrait.utils.cropper import CropperFaceAlignment
    from liveportrait.utils.landmark_runner import LandmarkRunnerTorch
    from liveportrait.utils.crop import _transform_img_kornia
    from liveportrait.utils.camera import get_rotation_matrix
    from liveportrait.modules.appearance_feature_extractor import AppearanceFeatureExtractor
    from liveportrait.modules.motion_extractor import MotionExtractor
    from liveportrait.modules.warping_network import WarpingNetwork
    from liveportrait.modules.spade_generator import SPADEDecoder
    from liveportrait.modules.stitching_retargeting_network import StitchingRetargetingNetwork
    _LP_AVAILABLE = True
except Exception as _lp_import_err:
    _LP_AVAILABLE = False
    _LP_IMPORT_ERROR = str(_lp_import_err)

# ─── 1.5. PyTorch 2.6+ compat: patch landmark_runner to load with weights_only=False
# landmark_model.pth is a torch.fx.GraphModule — torch.load needs weights_only=False.
# Patching only the reference inside landmark_runner avoids global scope changes.
import liveportrait.utils.landmark_runner as _lr_mod
_torch_load_orig = torch.load
def _torch_load_weights_compat(path, *args, **kwargs):
    # Default to weights_only=False for .pth files that contain compiled GraphModules
    # (these are official LP checkpoints from a trusted source)
    if "weights_only" not in kwargs and str(path).endswith(".pth"):
        kwargs["weights_only"] = False
    return _torch_load_orig(path, *args, **kwargs)
_lr_mod.torch.load = _torch_load_weights_compat

# Patch to_ndarray: MPS/CUDA tensors that have requires_grad=True cannot call
# .numpy() directly.  Must call .detach() first.  LandmarkRunnerTorch.run() calls
# the module-level to_ndarray() from its __globals__ dict — replacing the name in
# the module dict is enough to fix all call sites in that module.
def _to_ndarray_detach(obj):
    if isinstance(obj, torch.Tensor):
        return obj.cpu().detach().numpy()
    elif isinstance(obj, np.ndarray):
        return obj
    else:
        return np.array(obj)
_lr_mod.to_ndarray = _to_ndarray_detach

# ─── 1.6. Fix "from ...face_alignment" relative import in CropperFaceAlignment ──
# cropper.py is liveportrait.utils.cropper.  The `from ...face_alignment` import
# needs 3 package levels above the module:
#   liveportrait.utils  →  liveportrait  →  (no parent, top-level) = ERROR
#
# Python's _resolve_name() does:
#   bits = package.rsplit('.', level-1)   # 'liveportrait.utils'.rsplit('.', 2) → 2 parts
#   if len(bits) < level: raise ImportError('beyond top-level package')
#
# TWO-PHASE FIX:
#
# Phase A — fix cropper.py's relative import:
#   (a) Load LP's bundled face_alignment (LP_ROOT is first in sys.path → LP version)
#   (b) Register synthetic parent package 'ComfyUI_LivePortraitKJ' (underscore form)
#       + register face_alignment under it
#   (c) Patch cropper.__package__ to 'ComfyUI_LivePortraitKJ.liveportrait.utils' →
#       rsplit gives 3 parts → _resolve_name returns 'ComfyUI_LivePortraitKJ.face_alignment'
#       which is already in sys.modules → import succeeds.
#
# Phase B — fix api.py's dynamic importlib.import_module call:
#   face_alignment/api.py:78 computes package_directory_name from __file__ path:
#     os.path.basename(os.path.dirname(os.path.dirname(__file__)))
#     = os.path.basename('/…/ComfyUI-LivePortraitKJ') = 'ComfyUI-LivePortraitKJ'
#   Then calls: importlib.import_module('.face_alignment.detection.sfd',
#                                       package='ComfyUI-LivePortraitKJ')
#   → resolves to 'ComfyUI-LivePortraitKJ.face_alignment.detection.sfd' (hyphen form)
#   Register the HYPHEN form too so Python can walk the package hierarchy.
import importlib as _importlib
_fa_mod = _importlib.import_module('face_alignment')   # LP's bundled version (LP_ROOT first)

# ── Phase A: underscore form (for cropper.py relative import) ────────────────
_klp_pkg_us = types.ModuleType('ComfyUI_LivePortraitKJ')
_klp_pkg_us.__path__ = [LP_ROOT]
sys.modules.setdefault('ComfyUI_LivePortraitKJ', _klp_pkg_us)
sys.modules['ComfyUI_LivePortraitKJ.face_alignment'] = _fa_mod

# ── Phase B: hyphen form (for api.py's importlib.import_module) ──────────────
# Python can store any string key in sys.modules.  By pre-registering the parent
# package and the face_alignment subpackage, Python's dynamic import will walk
# _fa_mod.__path__ to find detection/sfd without needing a valid identifier name.
_klp_pkg_hy = types.ModuleType('ComfyUI-LivePortraitKJ')
_klp_pkg_hy.__path__ = [LP_ROOT]
sys.modules.setdefault('ComfyUI-LivePortraitKJ', _klp_pkg_hy)
sys.modules['ComfyUI-LivePortraitKJ.face_alignment'] = _fa_mod

# ── Patch cropper.__package__ for Phase A ────────────────────────────────────
# Gives 3 components: ComfyUI_LivePortraitKJ · liveportrait · utils
# _resolve_name returns 'ComfyUI_LivePortraitKJ.face_alignment' → found above.
sys.modules['liveportrait.utils.cropper'].__package__ = (
    'ComfyUI_LivePortraitKJ.liveportrait.utils'
)


# ─── 2. Args ──────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(
        description="LivePortrait warp: animate portrait using LatentSync driving video"
    )
    p.add_argument("--portrait", required=True, help="Source portrait image (jpg/png)")
    p.add_argument("--driver",   required=True, help="LatentSync output video (driving frames)")
    p.add_argument("--output",   required=True, help="Output video path")
    p.add_argument("--device",   default="auto",
                   choices=["auto", "mps", "cpu", "cuda"],
                   help="Compute device (default: auto)")
    p.add_argument("--dtype",    default="fp32",
                   choices=["fp32", "fp16"],
                   help="Model precision (fp32 recommended for MPS, fp16 for CUDA)")
    p.add_argument("--audio",    default=None,
                   help="Original audio file to mux into output (WAV/MP3/AAC). "
                        "If not set, audio is taken from the driver video.")
    return p.parse_args()


# ─── 3. Model loading ─────────────────────────────────────────────────────────

MODEL_DIR = os.path.expanduser("~/ComfyUI/models/liveportrait")
NODE_DIR  = LP_ROOT
YAML_PATH = os.path.join(NODE_DIR, "liveportrait", "config", "models.yaml")
MASK_PATH = os.path.join(
    NODE_DIR, "liveportrait", "utils", "resources", "mask_template.png"
)


def load_models(device: torch.device, dtype_str: str):
    dtype = torch.float16 if dtype_str == "fp16" else torch.float32
    use_half = dtype_str == "fp16"

    with open(YAML_PATH, "r") as f:
        cfg = yaml.safe_load(f)

    def _load(path):
        sd = _load_torch_file(path)
        return sd

    print("[lp_warp] Loading appearance feature extractor …")
    params = cfg["model_params"]["appearance_feature_extractor_params"]
    afe = AppearanceFeatureExtractor(**params).to(device).eval()
    afe.load_state_dict(_load(os.path.join(MODEL_DIR, "appearance_feature_extractor.safetensors")))

    print("[lp_warp] Loading motion extractor …")
    params = cfg["model_params"]["motion_extractor_params"]
    me = MotionExtractor(**params).to(device).eval()
    me.load_state_dict(_load(os.path.join(MODEL_DIR, "motion_extractor.safetensors")))

    print("[lp_warp] Loading warping module …")
    params = cfg["model_params"]["warping_module_params"]
    wm = WarpingNetwork(**params).to(device).eval()
    wm.load_state_dict(_load(os.path.join(MODEL_DIR, "warping_module.safetensors")))

    print("[lp_warp] Loading SPADE generator …")
    params = cfg["model_params"]["spade_generator_params"]
    sg = SPADEDecoder(**params).to(device).eval()
    sg.load_state_dict(_load(os.path.join(MODEL_DIR, "spade_generator.safetensors")))

    print("[lp_warp] Loading stitching + retargeting module …")
    sr_cfg = cfg["model_params"]["stitching_retargeting_module_params"]
    ckpt   = _load(os.path.join(MODEL_DIR, "stitching_retargeting_module.safetensors"))

    def _filter(ckpt, prefix):
        return {k.replace(prefix + "_module.", ""): v
                for k, v in ckpt.items() if k.startswith(prefix)}

    stitcher = StitchingRetargetingNetwork(**sr_cfg["stitching"]).to(device).eval()
    stitcher.load_state_dict(_filter(ckpt, "retarget_shoulder"))

    lip = StitchingRetargetingNetwork(**sr_cfg["lip"]).to(device).eval()
    lip.load_state_dict(_filter(ckpt, "retarget_mouth"))

    eye = StitchingRetargetingNetwork(**sr_cfg["eye"]).to(device).eval()
    eye.load_state_dict(_filter(ckpt, "retarget_eye"))

    sr_module = {"stitching": stitcher, "lip": lip, "eye": eye}

    # InferenceConfig defined inline (mirrors nodes.py class)
    class InferenceCfg:
        def __init__(self):
            self.flag_use_half_precision   = use_half
            self.flag_lip_zero             = False
            self.lip_zero_threshold        = 0.03
            self.flag_eye_retargeting      = False
            self.flag_lip_retargeting      = False
            self.flag_stitching            = True
            self.input_shape               = (256, 256)
            self.device_id                 = device
            self.flag_do_rot               = True
            self.eyes_retargeting_multiplier = 1.0
            self.lip_retargeting_multiplier  = 1.0

    inf_cfg = InferenceCfg()

    pipeline = LivePortraitPipeline(afe, me, wm, sg, sr_module, inf_cfg)
    print("[lp_warp] All models loaded ✓")
    return pipeline


# ─── 4. Face detection + cropping ────────────────────────────────────────────

def build_cropper(device: torch.device):
    """Build CropperFaceAlignment using face_alignment (no insightface needed)."""
    # LandmarkRunnerTorch uses landmark_model.pth (already downloaded)
    lm_path = os.path.join(MODEL_DIR, "landmark_model.pth")
    print(f"[lp_warp] Loading landmark runner from {lm_path} …")
    cropper = CropperFaceAlignment(
        onnx_device="torch_gpu",   # uses LandmarkRunnerTorch
        face_detector="sfd",       # sfd = RetinaFace, reliable on single portrait
        face_detector_device=str(device),
        face_detector_dtype=torch.float32,
        device_id=device,
    )
    return cropper


def get_crop_info(portrait_bgr: np.ndarray, cropper, pipeline):
    """Run face detection + 3D keypoint extraction on source portrait."""
    portrait_rgb = cv2.cvtColor(portrait_bgr, cv2.COLOR_BGR2RGB)

    crop_info, cropped_256 = cropper.crop_single_image(
        portrait_rgb,
        dsize=512,
        scale=2.3,
        vy_ratio=-0.125,
        vx_ratio=0.0,
        face_index=0,
        face_index_order="large-small",
        rotate=True,
    )

    if not crop_info:
        raise RuntimeError("[lp_warp] No face detected in portrait image!")

    # Prepare source for the pipeline wrapper
    I_s = pipeline.live_portrait_wrapper.prepare_source(cropped_256)
    x_s_info = pipeline.live_portrait_wrapper.get_kp_info(I_s)
    x_s = pipeline.live_portrait_wrapper.transform_keypoint(x_s_info)
    R_s = get_rotation_matrix(x_s_info["pitch"], x_s_info["yaw"], x_s_info["roll"])
    f_s = pipeline.live_portrait_wrapper.extract_feature_3d(I_s)
    del I_s

    crop_info_dict = {
        "crop_info_list":  [crop_info],
        "source_rot_list": [R_s],
        "f_s_list":        [f_s],
        "x_s_list":        [x_s],
        "source_info":     [x_s_info],
    }
    return crop_info_dict, cropped_256


# ─── 5. Load driving video ────────────────────────────────────────────────────

def load_driving_frames(driver_path: str, device: torch.device) -> torch.Tensor:
    """Read all frames from driver video → (N, 3, H, W) float tensor in [0,1]."""
    cap = cv2.VideoCapture(driver_path)
    if not cap.isOpened():
        raise RuntimeError(f"[lp_warp] Cannot open driver video: {driver_path}")

    frames = []
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frames.append(frame_rgb)
    cap.release()

    if not frames:
        raise RuntimeError("[lp_warp] Driver video has no frames")

    print(f"[lp_warp] Driver: {len(frames)} frames loaded")

    # Stack → (N, H, W, 3) → (N, 3, H, W), normalise
    arr = np.stack(frames).astype(np.float32) / 255.0
    t = torch.from_numpy(arr).permute(0, 3, 1, 2)   # N,H,W,3 → N,3,H,W

    # Resize to 256×256 for the network
    t256 = torch.nn.functional.interpolate(
        t, size=(256, 256), mode="bilinear", align_corners=False
    )
    return t256.to(device)


# ─── 6. Video info helpers ────────────────────────────────────────────────────

def get_video_info(path: str):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    w   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    return fps, w, h


# ─── 7. Composite + write frames ─────────────────────────────────────────────

def write_output_video(
    out_list, crop_info_dict, portrait_bgr, fps, output_path, device
):
    """Composite warped face back onto full-resolution portrait and write video."""
    h, w = portrait_bgr.shape[:2]
    crop_info = crop_info_dict["crop_info_list"]

    # Load feather mask template (512×512, BGR)
    mask_template_bgr = cv2.imread(MASK_PATH)
    if mask_template_bgr is None:
        raise RuntimeError(f"[lp_warp] Mask template not found: {MASK_PATH}")
    crop_mask_np = mask_template_bgr.astype(np.float32) / 255.0
    crop_mask = torch.from_numpy(crop_mask_np).unsqueeze(0)   # (1, 512, 512, 3)

    # Prepare source frame tensor: (1, 3, H, W) in [0,1]
    portrait_rgb = cv2.cvtColor(portrait_bgr, cv2.COLOR_BGR2RGB)
    src_t = torch.from_numpy(portrait_rgb.astype(np.float32) / 255.0)
    src_t = src_t.permute(2, 0, 1).unsqueeze(0)   # (1, 3, H, W)

    # Temp raw video
    tmp_path = output_path + ".raw.mp4"
    fourcc   = cv2.VideoWriter_fourcc(*"mp4v")
    writer   = cv2.VideoWriter(tmp_path, fourcc, fps, (w, h))

    total = len(out_list)
    print(f"[lp_warp] Compositing {total} frames …")

    for i in tqdm(range(total)):
        safe_idx = min(i, len(crop_info) - 1)

        if not out_list[i]:
            # No face in this frame — use plain source portrait
            out_bgr = portrait_bgr.copy()
        else:
            # Warped 512×512 face crop (float, 0-1), shape: (1, 3, 512, 512)
            warped = torch.clamp(out_list[i]["out"], 0, 1)                # (1,3,512,512)
            warped_hwc = warped.permute(0, 2, 3, 1)                       # (1,512,512,3)

            # M_c2o = 3×3 affine: crop-space → original-image-space
            M_c2o = crop_info[safe_idx]["M_c2o"]

            # Warp face back to original dimensions
            face_on_canvas = _transform_img_kornia(
                warped_hwc, M_c2o, dsize=(w, h), device=device
            )   # (1, 3, H, W)

            # Warp mask back to original dimensions
            mask_on_canvas = _transform_img_kornia(
                crop_mask, M_c2o, dsize=(w, h), device=device
            )   # (1, 3, H, W)

            src_dev  = src_t.to(device)
            blended  = torch.clamp(
                mask_on_canvas * face_on_canvas +
                (1 - mask_on_canvas) * src_dev,
                0, 1
            )   # (1, 3, H, W)

            # Convert back to BGR uint8
            out_rgb = (blended[0].permute(1, 2, 0).cpu().numpy() * 255).astype(np.uint8)
            out_bgr = cv2.cvtColor(out_rgb, cv2.COLOR_RGB2BGR)

        writer.write(out_bgr)

    writer.release()
    print(f"[lp_warp] {total} frames written → {tmp_path}")
    return tmp_path


# ─── 8. Audio mux ────────────────────────────────────────────────────────────

def mux_audio(raw_video: str, audio_source: str, output_path: str):
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
        print(f"[lp_warp] ERROR: ffmpeg failed:\n{result.stderr}", file=sys.stderr)
        shutil.copy(raw_video, output_path)
        print("[lp_warp] WARNING: audio mux failed, copying video without audio")


# ─── 9. Main ─────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    # ── Guard: fail fast with exit code 2 if LivePortrait could not be imported
    if not _LP_AVAILABLE:
        import json as _json
        print(_json.dumps({
            "ok": False,
            "error": "liveportrait_unavailable",
            "detail": _LP_IMPORT_ERROR,
            "fallback": "reinhard",
        }))
        sys.exit(2)

    # Device
    if args.device == "auto":
        device = _autodetect_device()
    else:
        device = torch.device(args.device)
    # Update mock so pipeline uses the right device
    mm_mock.get_torch_device = lambda: device
    print(f"[lp_warp] Device: {device}  dtype: {args.dtype}")

    # Validate inputs
    for p in [args.portrait, args.driver]:
        if not os.path.exists(p):
            print(f"[lp_warp] ERROR: Not found: {p}", file=sys.stderr)
            sys.exit(1)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    # Load source portrait
    portrait_bgr = cv2.imread(args.portrait)
    if portrait_bgr is None:
        print(f"[lp_warp] ERROR: Cannot read portrait: {args.portrait}", file=sys.stderr)
        sys.exit(1)

    # Get driver video info (fps, size)
    fps, drv_w, drv_h = get_video_info(args.driver)
    print(f"[lp_warp] Driver: {drv_w}×{drv_h} @ {fps:.1f}fps")

    # ── Load models
    pipeline = load_models(device, args.dtype)

    # ── Build cropper
    cropper = build_cropper(device)

    # ── Detect face in portrait + extract keypoints
    # torch.no_grad() prevents the feature extractor / keypoint model from
    # building autograd graphs, which would keep intermediate tensors alive on
    # MPS and fill all 30+ GB of unified memory.
    with torch.no_grad():
        crop_info_dict, cropped_256 = get_crop_info(portrait_bgr, cropper, pipeline)
    M_c2o = crop_info_dict["crop_info_list"][0]["M_c2o"]
    print(f"[lp_warp] Face detected. Crop-to-original matrix computed.")

    # ── Load driving frames
    driving_t = load_driving_frames(args.driver, device)

    # ── Free any MPS cached memory before the expensive animation loop
    if device.type == "mps":
        torch.mps.empty_cache()
    gc.collect()

    # ── Run LivePortrait animation
    print(f"[lp_warp] Running LivePortrait on {driving_t.shape[0]} frames …")
    if args.dtype == "fp16":
        driving_t = driving_t.to(torch.float16)

    with torch.no_grad():
        out = pipeline.execute(
            driving_images=driving_t,
            crop_info=crop_info_dict,
            driving_landmarks=None,
            delta_multiplier=1.0,
            relative_motion_mode="relative",
            driving_smooth_observation_variance=3e-6,
            mismatch_method="constant",
        )
    out_list = out["out_list"]
    print(f"[lp_warp] Animation done. {len(out_list)} output frames.")

    # ── Composite + write
    tmp_video = write_output_video(
        out_list, crop_info_dict, portrait_bgr, fps, args.output, device
    )

    # ── Mux audio from driver
    audio_src = args.audio if args.audio else args.driver
    mux_audio(tmp_video, audio_src, args.output)

    # ── Cleanup
    try:
        os.remove(tmp_video)
    except Exception:
        pass

    size_mb = os.path.getsize(args.output) / 1024 / 1024
    n_frames = len(out_list)
    print(f"[lp_warp] ✅ Done → {args.output}  ({size_mb:.1f}MB)  frames={n_frames}", file=sys.stderr)
    import json as _json
    print(_json.dumps({"ok": True, "output": args.output, "frames": n_frames, "size_mb": round(size_mb, 2)}))


if __name__ == "__main__":
    main()
