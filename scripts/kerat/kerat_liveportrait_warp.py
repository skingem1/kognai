#!/usr/bin/env python3
"""
TICKET-030-C v2: Direct Tone-Matched Lip Compositing

Root cause of LP approach failure (confirmed):
  LivePortrait's Motion Extractor cannot extract clean lip motion from
  LatentSync output because LatentSync re-renders the ENTIRE face (not just
  lips). The ME interprets the bright rectangular patch as general face noise,
  not lip shape changes → zero lip motion in output.

Direct compositing approach:
  1. Extract 512×512 face crop from source portrait (CropperFaceAlignment)
  2. For each LatentSync frame:
       a. Detect 203-pt facial landmarks in LS frame
       b. Compute affine: LS native space → portrait crop space (RANSAC, 6 anchors)
       c. Warp LS frame to align with portrait crop coordinate space
       d. Reinhard Lab colour-transfer: LS lip stats → portrait lip stats
       e. Blend lip region (feathered convex-hull mask, indices 48–107) onto crop
  3. Composite blended 512×512 crop onto full-resolution portrait (M_c2o)
  4. Mux audio → final mp4

Usage:
  python3 kerat_liveportrait_warp.py \
      --portrait  /path/to/portrait.jpg \
      --driver    /path/to/latentsync.mp4 \
      --output    /path/to/output.mp4 \
      [--audio    /path/to/original.wav]
      [--device   mps|cpu]
      [--dtype    fp32|fp16]          # kept for CLI compat, not used
  # Exit codes: 0=ok, 1=input/runtime error, 2=liveportrait_unavailable
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
from pathlib import Path

import cv2
import numpy as np
from tqdm import tqdm

LP_ROOT = os.path.expanduser(
    "~/ComfyUI/custom_nodes/ComfyUI-LivePortraitKJ"
)
sys.path.insert(0, LP_ROOT)

try:
    from liveportrait.utils.cropper import CropperFaceAlignment
    from liveportrait.utils.landmark_runner import LandmarkRunnerTorch
    from liveportrait.utils.crop import _transform_pts
    _LP_AVAILABLE = True
except Exception as _lp_import_err:
    _LP_AVAILABLE = False
    _LP_IMPORT_ERROR = str(_lp_import_err)

# ─── 1.5. PyTorch 2.6+ compat: patch landmark_runner to load with weights_only=False
import liveportrait.utils.landmark_runner as _lr_mod
_torch_load_orig = torch.load
def _torch_load_weights_compat(path, *args, **kwargs):
    if "weights_only" not in kwargs and str(path).endswith(".pth"):
        kwargs["weights_only"] = False
    return _torch_load_orig(path, *args, **kwargs)
_lr_mod.torch.load = _torch_load_weights_compat

# Patch to_ndarray: MPS/CUDA tensors that have requires_grad=True cannot call
# .numpy() directly.  Must call .detach() first.
def _to_ndarray_detach(obj):
    if isinstance(obj, torch.Tensor):
        return obj.cpu().detach().numpy()
    elif isinstance(obj, np.ndarray):
        return obj
    else:
        return np.array(obj)
_lr_mod.to_ndarray = _to_ndarray_detach

# ─── 1.6. Fix "from ...face_alignment" relative import in CropperFaceAlignment ──
import importlib as _importlib
_fa_mod = _importlib.import_module('face_alignment')   # LP's bundled version

# ── Phase A: underscore form (for cropper.py relative import) ────────────────
_klp_pkg_us = types.ModuleType('ComfyUI_LivePortraitKJ')
_klp_pkg_us.__path__ = [LP_ROOT]
sys.modules.setdefault('ComfyUI_LivePortraitKJ', _klp_pkg_us)
sys.modules['ComfyUI_LivePortraitKJ.face_alignment'] = _fa_mod

# ── Phase B: hyphen form (for api.py's importlib.import_module) ──────────────
_klp_pkg_hy = types.ModuleType('ComfyUI-LivePortraitKJ')
_klp_pkg_hy.__path__ = [LP_ROOT]
sys.modules.setdefault('ComfyUI-LivePortraitKJ', _klp_pkg_hy)
sys.modules['ComfyUI-LivePortraitKJ.face_alignment'] = _fa_mod

# ── Patch cropper.__package__ for Phase A ────────────────────────────────────
sys.modules['liveportrait.utils.cropper'].__package__ = (
    'ComfyUI_LivePortraitKJ.liveportrait.utils'
)


# ─── 2. Constants ─────────────────────────────────────────────────────────────

MODEL_DIR = os.path.expanduser("~/ComfyUI/models/liveportrait")

# LP 203-point landmark indices for the lip region (48–107):
#   48-66  outer upper lip
#   67-84  outer lower lip
#   85-107 inner lip
LIP_ALL = list(range(48, 108))

# Six anchor landmark indices used for affine estimation between LS and crop spaces.
# Chosen to span the face broadly (nose bridge, cheekbones, chin corners, lip corners).
AFFINE_ANCHORS = [0, 12, 24, 36, 48, 66]


# ─── 3. Args ──────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(
        description="TICKET-030-C: Direct tone-matched lip compositing"
    )
    p.add_argument("--portrait", required=True, help="Source portrait image (jpg/png)")
    p.add_argument("--driver",   required=True, help="LatentSync output video (driving frames)")
    p.add_argument("--output",   required=True, help="Output video path")
    p.add_argument("--device",   default="auto",
                   choices=["auto", "mps", "cpu", "cuda"],
                   help="Compute device (default: auto)")
    p.add_argument("--dtype",    default="fp32",
                   choices=["fp32", "fp16"],
                   help="Kept for CLI compat, not used in compositing pipeline")
    p.add_argument("--audio",    default=None,
                   help="Original audio file to mux into output (WAV/MP3/AAC). "
                        "If not set, audio is taken from the driver video.")
    return p.parse_args()


# ─── 4. Build cropper ─────────────────────────────────────────────────────────

def build_cropper(device: torch.device):
    """Build CropperFaceAlignment using face_alignment (no insightface needed)."""
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


# ─── 5. Portrait preparation ──────────────────────────────────────────────────

def build_polygon_mask(lmk_crop: np.ndarray, indices: list, size: int = 512,
                       dilate_px: int = 8, blur_px: int = 21) -> np.ndarray:
    """Build a feathered convex-hull mask for a subset of landmarks.

    Args:
        lmk_crop: (N, 2) landmark array in crop coordinate space
        indices:  indices into lmk_crop to include in the hull
        size:     output mask size (square)
        dilate_px: dilation radius in pixels
        blur_px:   Gaussian blur kernel size (must be odd)

    Returns:
        float32 mask, shape (size, size), values in [0, 1]
    """
    pts = lmk_crop[indices].astype(np.float32)
    hull = cv2.convexHull(pts.reshape(-1, 1, 2).astype(np.int32))
    mask = np.zeros((size, size), dtype=np.uint8)
    cv2.fillConvexPoly(mask, hull, 255)

    if dilate_px > 0:
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (2 * dilate_px + 1, 2 * dilate_px + 1)
        )
        mask = cv2.dilate(mask, kernel)

    # Ensure blur_px is odd
    bk = blur_px if blur_px % 2 == 1 else blur_px + 1
    mask_f = cv2.GaussianBlur(mask.astype(np.float32), (bk, bk), 0) / 255.0
    return mask_f


def compute_masked_lab_stats(img_bgr: np.ndarray, mask: np.ndarray):
    """Compute per-channel Lab mean/std using only mask-selected pixels.

    Returns list of (mean, std) tuples for L, a, b channels.
    """
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    stats = []
    for ch in range(3):
        pixels = lab[:, :, ch][mask > 0.1]
        if len(pixels) < 10:
            # Fallback: use full image stats
            pixels = lab[:, :, ch].ravel()
        m = float(pixels.mean())
        s = float(max(pixels.std(), 0.5))
        stats.append((m, s))
    return stats


def build_lip_boundary_ring(lmk_crop: np.ndarray, size: int = 512,
                            inner_dilate_px: int = 4,
                            outer_dilate_px: int = 22) -> np.ndarray:
    """Annular ring of skin pixels immediately surrounding the lip blend zone.

    Sampling the ring (rather than the lip interior) gives the colour transfer
    the correct target for dark/colour-graded portraits where the lip interior
    has a different Lab distribution than the surrounding skin.

    inner_dilate_px: small dilation — just clears the lip edge itself
    outer_dilate_px: how wide the ring extends outward into cheek/chin skin

    Returns float32 mask (size, size), 1.0 inside ring, 0.0 elsewhere.
    """
    pts = lmk_crop[LIP_ALL].astype(np.int32)
    hull = cv2.convexHull(pts.reshape(-1, 1, 2))

    def _dilated(px: int) -> np.ndarray:
        m = np.zeros((size, size), dtype=np.uint8)
        cv2.fillConvexPoly(m, hull, 255)
        if px > 0:
            k = cv2.getStructuringElement(
                cv2.MORPH_ELLIPSE, (2 * px + 1, 2 * px + 1)
            )
            m = cv2.dilate(m, k)
        return m

    inner = _dilated(inner_dilate_px)
    outer = _dilated(outer_dilate_px)
    ring = np.clip(outer.astype(np.float32) - inner.astype(np.float32), 0, 255)
    return (ring / 255.0).astype(np.float32)


def prepare_portrait(portrait_bgr: np.ndarray, cropper):
    """Run face detection on source portrait and build all needed data structures.

    Returns dict with:
        crop_512:    (512, 512, 3) uint8 BGR — source portrait in crop space
        M_o2c:       (3, 3) float64 — portrait native → 512×512 crop affine
        M_c2o:       (3, 3) float64 — 512×512 crop → portrait native affine
        lmk_crop:    (203, 2) float32 — LP landmarks in crop coordinate space
        lip_mask:    (512, 512) float32 — feathered lip polygon mask in crop space
        lip_stats:   list of (mean, std) per Lab channel, computed from lip region
        ph, pw:      portrait height, width (int)
    """
    portrait_rgb = cv2.cvtColor(portrait_bgr, cv2.COLOR_BGR2RGB)
    ph, pw = portrait_bgr.shape[:2]

    crop_info, _ = cropper.crop_single_image(
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

    M_o2c = crop_info["M_o2c"]   # (3,3): portrait native → 512×512 crop
    M_c2o = crop_info["M_c2o"]   # (3,3): 512×512 crop → portrait native

    # lmk_crop: 203 landmarks from LandmarkRunnerTorch.
    # The runner returns them in portrait native space (back-transformed via M_c2o).
    # We need them in crop space: apply M_o2c forward transform.
    lmk_native = crop_info["lmk_crop"]                       # (203, 2) portrait space
    lmk_crop = _transform_pts(lmk_native, M_o2c)            # (203, 2) crop space

    # Build 512×512 crop via warpAffine
    crop_512 = cv2.warpAffine(
        portrait_bgr,
        M_o2c[:2, :],
        (512, 512),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT,
    )

    # Build feathered lip mask in crop space
    lip_mask = build_polygon_mask(lmk_crop, LIP_ALL, size=512, dilate_px=6, blur_px=19)

    # Compute Lab stats from the annular ring SURROUNDING the lip boundary.
    # For dark/colour-graded portraits the lip interior has very different Lab
    # values from the surrounding skin; sampling the ring ensures the Reinhard
    # transfer targets the actual skin tone at the blend edge, not the lips.
    boundary_ring = build_lip_boundary_ring(lmk_crop, size=512,
                                            inner_dilate_px=4,
                                            outer_dilate_px=22)
    lip_stats = compute_masked_lab_stats(crop_512, boundary_ring)

    print(f"[lp_warp] Portrait face detected. Crop shape: {crop_512.shape}")
    print(f"[lp_warp] Boundary ring L mean={lip_stats[0][0]:.1f}  a mean={lip_stats[1][0]:.1f}")

    return {
        "crop_512":  crop_512,
        "M_o2c":     M_o2c,
        "M_c2o":     M_c2o,
        "lmk_crop":  lmk_crop,
        "lip_mask":  lip_mask,
        "lip_stats": lip_stats,
        "ph":        ph,
        "pw":        pw,
    }


# ─── 6. Reinhard Lab colour transfer ─────────────────────────────────────────

def reinhard_transfer(frame_bgr: np.ndarray, src_stats: list,
                      strength: float = 1.0) -> np.ndarray:
    """Apply Reinhard (2001) Lab colour transfer.

    Transfers the colour distribution of src_stats (from portrait lip region)
    onto frame_bgr (a LatentSync frame), then blends by strength.

    Args:
        frame_bgr:  (H, W, 3) uint8 BGR frame to colour-correct
        src_stats:  [(L_mean, L_std), (a_mean, a_std), (b_mean, b_std)]
        strength:   0.0 = identity, 1.0 = full transfer

    Returns:
        colour-corrected (H, W, 3) uint8 BGR frame
    """
    lab = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    result = lab.copy()
    for ch in range(3):
        s_mean, s_std = src_stats[ch]
        t_mean = float(lab[:, :, ch].mean())
        t_std  = float(max(lab[:, :, ch].std(), 0.5))
        transferred = (lab[:, :, ch] - t_mean) / t_std * s_std + s_mean
        result[:, :, ch] = (1.0 - strength) * lab[:, :, ch] + strength * transferred
    result = np.clip(result, 0, 255).astype(np.uint8)
    return cv2.cvtColor(result, cv2.COLOR_LAB2BGR)


# ─── 7. Affine: LS space → portrait crop space ────────────────────────────────

def compute_ls_to_crop_affine(ls_lmk: np.ndarray, crop_lmk: np.ndarray):
    """Estimate 2D affine mapping from LatentSync landmark space to portrait crop space.

    Uses RANSAC with AFFINE_ANCHORS (6 key points).  Falls back to exact 3-point
    getAffineTransform if RANSAC returns None (degenerate geometry).

    Args:
        ls_lmk:    (203, 2) landmarks detected in the LS frame
        crop_lmk:  (203, 2) landmarks for the source portrait in crop space

    Returns:
        M: (2, 3) float64 affine matrix suitable for cv2.warpAffine
    """
    src_pts = ls_lmk[AFFINE_ANCHORS].astype(np.float32)    # 6 points in LS space
    dst_pts = crop_lmk[AFFINE_ANCHORS].astype(np.float32)  # 6 points in crop space

    M, inliers = cv2.estimateAffine2D(
        src_pts, dst_pts,
        method=cv2.RANSAC,
        ransacReprojThreshold=8.0,
        maxIters=2000,
        confidence=0.99,
    )

    if M is None:
        # Fallback: exact affine from first 3 anchor points
        print("[lp_warp] WARNING: RANSAC failed, using 3-point affine fallback")
        M = cv2.getAffineTransform(src_pts[:3], dst_pts[:3])

    return M  # (2, 3)


# ─── 8. Per-frame compositing ─────────────────────────────────────────────────

def composite_lip_onto_portrait(
    ls_frame_bgr: np.ndarray,
    ls_lmk: np.ndarray,
    portrait_data: dict,
) -> np.ndarray:
    """Composite animated lip from one LS frame onto the source portrait.

    Pipeline (per frame):
      a. Compute M_ls2crop via RANSAC affine (6 anchor landmarks)
      b. Warp LS frame to align with portrait 512×512 crop space
      c. Colour-match warped LS to portrait grade:
           - L channel: global scale = mean(portrait lip L) / mean(LS lip L),
             applied uniformly — preserves relative motion contrast across frames
             while bringing overall brightness to match the dark portrait
           - a/b channels: flat constant = boundary-ring mean a/b (surrounding
             skin colour, not portrait lip pixels which retain warm tones even
             in a blue-lit portrait — copying those caused orange artefacts)
      d. Blend lip region using feathered mask: alpha * colour_matched + (1-alpha) * crop_512
      e. Warp blended 512×512 back to portrait native space via M_c2o
      f. Alpha-blend face region onto full-res portrait using face convex-hull mask

    Args:
        ls_frame_bgr:   (H, W, 3) uint8 BGR — one LatentSync output frame
        ls_lmk:         (203, 2) float32 — LP landmarks detected in ls_frame
        portrait_data:  dict from prepare_portrait()

    Returns:
        (ph, pw, 3) uint8 BGR composite frame
    """
    crop_512  = portrait_data["crop_512"]
    M_c2o     = portrait_data["M_c2o"]
    crop_lmk  = portrait_data["lmk_crop"]
    lip_mask  = portrait_data["lip_mask"]
    lip_stats = portrait_data["lip_stats"]   # boundary-ring skin stats
    ph        = portrait_data["ph"]
    pw        = portrait_data["pw"]

    # ── (a) Affine: LS space → 512×512 crop space
    M_ls2crop = compute_ls_to_crop_affine(ls_lmk, crop_lmk)

    # ── (b) Warp LS frame to crop coordinate space
    ls_warped = cv2.warpAffine(
        ls_frame_bgr,
        M_ls2crop,
        (512, 512),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )

    # ── (c) Global L scale + portrait chrominance copy
    #
    # Per-pixel ratio was wrong: portrait_L/ls_L * ls_L = portrait_L, so the
    # corrected frame became identical to the portrait — zero motion visible.
    #
    # Fix: compute ONE global scale = mean(portrait lip L) / mean(ls lip L).
    # Apply it uniformly to the entire LS L channel.  This preserves the
    # relative L variation across frames (= lip motion) while bringing the
    # overall level down to match the dark portrait.
    # Copy portrait a/b chrominance to preserve the stylistic colour grade.
    portrait_lab = cv2.cvtColor(crop_512,  cv2.COLOR_BGR2LAB).astype(np.float32)
    ls_lab       = cv2.cvtColor(ls_warped, cv2.COLOR_BGR2LAB).astype(np.float32)

    portrait_L = portrait_lab[:, :, 0]
    ls_L       = ls_lab[:, :, 0]

    lip_region       = lip_mask > 0.1
    portrait_lip_L   = float(portrait_L[lip_region].mean()) if lip_region.any() else 64.0
    ls_lip_L         = float(np.maximum(ls_L[lip_region], 1.0).mean()) if lip_region.any() else 128.0
    l_scale          = float(np.clip(portrait_lip_L / max(ls_lip_L, 1.0), 0.05, 1.5))

    # Chrominance: use the SURROUNDING SKIN mean a/b (boundary ring stats),
    # not the portrait's own lip pixels.  The portrait's lip pixels have warm
    # (reddish) a/b even in a blue-lit face, causing orange artefacts.
    # A flat skin-tone constant eliminates spatial alignment issues and ensures
    # the lip patch chrominance matches the surrounding face grade exactly.
    skin_a = float(lip_stats[1][0])   # mean a of surrounding skin (dark-blue grade)
    skin_b = float(lip_stats[2][0])   # mean b of surrounding skin

    corrected_lab = ls_lab.copy()
    corrected_lab[:, :, 0] = np.clip(ls_lab[:, :, 0] * l_scale, 0.0, 255.0)
    corrected_lab[:, :, 1] = skin_a   # flat surrounding-skin a (no spatial misalign)
    corrected_lab[:, :, 2] = skin_b   # flat surrounding-skin b
    ls_corrected = cv2.cvtColor(corrected_lab.astype(np.uint8), cv2.COLOR_LAB2BGR)

    # ── (d) Blend lip region onto source crop
    alpha = lip_mask[:, :, np.newaxis]            # (512, 512, 1) float32
    blended_crop = (
        alpha * ls_corrected.astype(np.float32) +
        (1.0 - alpha) * crop_512.astype(np.float32)
    ).astype(np.uint8)

    # ── (e) Warp blended crop back to portrait native space
    blended_on_canvas = cv2.warpAffine(
        blended_crop,
        M_c2o[:2, :],
        (pw, ph),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )

    # ── (f) Build a face-region blend mask from crop_lmk projected to portrait space
    # Project crop landmarks to portrait space for face mask
    face_hull_pts = _transform_pts(crop_lmk, M_c2o).astype(np.int32)
    face_hull = cv2.convexHull(face_hull_pts.reshape(-1, 1, 2))
    face_mask_hard = np.zeros((ph, pw), dtype=np.uint8)
    cv2.fillConvexPoly(face_mask_hard, face_hull, 255)
    # Feather the face boundary to avoid hard seam
    face_mask_f = cv2.GaussianBlur(
        face_mask_hard.astype(np.float32), (31, 31), 0
    ) / 255.0
    face_alpha = face_mask_f[:, :, np.newaxis]

    # Build the portrait we want to write (will be populated by caller)
    # Read original portrait (passed in via portrait_data key)
    portrait_bgr = portrait_data["portrait_bgr"]
    result = (
        face_alpha * blended_on_canvas.astype(np.float32) +
        (1.0 - face_alpha) * portrait_bgr.astype(np.float32)
    ).astype(np.uint8)

    return result


# ─── 9. Load driving video ────────────────────────────────────────────────────

def load_driving_frames(driver_path: str) -> list:
    """Read all frames from driver video as BGR numpy arrays.

    Returns:
        frames_bgr: list of (H, W, 3) uint8 numpy arrays
    """
    cap = cv2.VideoCapture(driver_path)
    if not cap.isOpened():
        raise RuntimeError(f"[lp_warp] Cannot open driver video: {driver_path}")

    frames = []
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frames.append(frame)
    cap.release()

    if not frames:
        raise RuntimeError("[lp_warp] Driver video has no frames")

    print(f"[lp_warp] Driver: {len(frames)} frames loaded")
    return frames


# ─── 10. Extract driving landmarks ───────────────────────────────────────────

def extract_driving_landmarks(frames_bgr: list, cropper) -> list:
    """Run LP face detection on each LS driving frame to get 203-pt landmarks.

    Returns a list of (203, 2) float32 arrays — one per frame, in LS native space.
    Frames where detection fails inherit last successful landmarks.
    """
    landmarks = []
    last_lmk = None
    failed = 0

    print(f"[lp_warp] Extracting driving landmarks from {len(frames_bgr)} frames …")
    for i, frame_bgr in enumerate(frames_bgr):
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        try:
            crop_info, _ = cropper.crop_single_image(
                frame_rgb,
                dsize=512,
                scale=2.3,
                vy_ratio=-0.125,
                vx_ratio=0.0,
                face_index=0,
                face_index_order="large-small",
                rotate=True,
            )
            if crop_info and crop_info.get("lmk_crop") is not None:
                # lmk_crop is returned in portrait native space by LandmarkRunnerTorch.
                # For the LS frame we want landmarks in LS native (512×512) space.
                # Apply M_o2c (portrait→crop) to get crop-equivalent coords.
                # lmk_crop from landmark_runner is in the image's native pixel space.
                # For LS frames this IS the LS frame coordinate space (0-512),
                # which is exactly what warpAffine needs as source coords.
                # Do NOT apply M_o2c here — that would transform to LS crop subspace.
                lmk_ls = crop_info["lmk_crop"]   # (203, 2) in LS frame native space
                last_lmk = lmk_ls
                landmarks.append(lmk_ls)
            else:
                failed += 1
                landmarks.append(last_lmk)
        except Exception:
            failed += 1
            landmarks.append(last_lmk)

    if last_lmk is None:
        raise RuntimeError("[lp_warp] No face detected in any driving frame!")

    # Fill any leading Nones (frames before first detection)
    for i in range(len(landmarks)):
        if landmarks[i] is None:
            landmarks[i] = last_lmk

    if failed > 0:
        print(f"[lp_warp] WARNING: {failed}/{len(frames_bgr)} driver frames had no face (using fallback)")

    print("[lp_warp] Driving landmarks extracted ✓")
    return landmarks


# ─── 11. Video info ───────────────────────────────────────────────────────────

def get_video_info(path: str):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    w   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    return fps, w, h


# ─── 12. Write composited video ──────────────────────────────────────────────

def write_composited_video(
    frames_bgr: list,
    driving_landmarks: list,
    portrait_data: dict,
    fps: float,
    output_path: str,
) -> str:
    """Composite each driving frame onto portrait and write to temp mp4.

    Returns path to raw video (no audio).
    """
    ph = portrait_data["ph"]
    pw = portrait_data["pw"]

    tmp_path = output_path + ".raw.mp4"
    fourcc   = cv2.VideoWriter_fourcc(*"mp4v")
    writer   = cv2.VideoWriter(tmp_path, fourcc, fps, (pw, ph))

    total = len(frames_bgr)
    print(f"[lp_warp] Compositing {total} frames onto portrait ({pw}×{ph}) …")

    for i in tqdm(range(total)):
        ls_frame_bgr = frames_bgr[i]
        ls_lmk       = driving_landmarks[i]

        if ls_lmk is None:
            # No landmarks at all — write static portrait
            writer.write(portrait_data["portrait_bgr"])
            continue

        try:
            out_bgr = composite_lip_onto_portrait(ls_frame_bgr, ls_lmk, portrait_data)
        except Exception as e:
            print(f"[lp_warp] WARNING: frame {i} composite failed ({e}), using portrait")
            out_bgr = portrait_data["portrait_bgr"]

        writer.write(out_bgr)

    writer.release()
    print(f"[lp_warp] {total} frames written → {tmp_path}")
    return tmp_path


# ─── 13. Audio mux ────────────────────────────────────────────────────────────

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


# ─── 14. Main ─────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    # ── Guard: fail fast with exit code 2 if LP couldn't be imported
    if not _LP_AVAILABLE:
        import json as _json
        print(_json.dumps({
            "ok": False,
            "error": "liveportrait_unavailable",
            "detail": _LP_IMPORT_ERROR,
            "fallback": "reinhard",
        }))
        sys.exit(2)

    # ── Device
    if args.device == "auto":
        device = _autodetect_device()
    else:
        device = torch.device(args.device)
    mm_mock.get_torch_device = lambda: device
    print(f"[lp_warp] Device: {device}  (compositing pipeline — no neural net models)")

    # ── Validate inputs
    for p in [args.portrait, args.driver]:
        if not os.path.exists(p):
            print(f"[lp_warp] ERROR: Not found: {p}", file=sys.stderr)
            sys.exit(1)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    # ── Load source portrait
    portrait_bgr = cv2.imread(args.portrait)
    if portrait_bgr is None:
        print(f"[lp_warp] ERROR: Cannot read portrait: {args.portrait}", file=sys.stderr)
        sys.exit(1)
    ph, pw = portrait_bgr.shape[:2]
    print(f"[lp_warp] Portrait: {pw}×{ph}")

    # ── Driver video info
    fps, drv_w, drv_h = get_video_info(args.driver)
    print(f"[lp_warp] Driver: {drv_w}×{drv_h} @ {fps:.1f}fps")

    # ── Build cropper (face_alignment + LandmarkRunnerTorch)
    cropper = build_cropper(device)

    # ── Detect face in portrait and compute all crop-space data
    with torch.no_grad():
        portrait_data = prepare_portrait(portrait_bgr, cropper)

    # Store portrait_bgr in portrait_data so composite_lip_onto_portrait can access it
    portrait_data["portrait_bgr"] = portrait_bgr

    # ── Load all driving frames (BGR list, no tensors needed)
    frames_bgr = load_driving_frames(args.driver)

    # ── Extract per-frame LP landmarks from LS frames
    with torch.no_grad():
        driving_landmarks = extract_driving_landmarks(frames_bgr, cropper)

    gc.collect()

    # ── Composite + write
    tmp_video = write_composited_video(
        frames_bgr, driving_landmarks, portrait_data, fps, args.output
    )

    # ── Mux audio
    audio_src = args.audio if args.audio else args.driver
    mux_audio(tmp_video, audio_src, args.output)

    # ── Cleanup
    try:
        os.remove(tmp_video)
    except Exception:
        pass

    size_mb  = os.path.getsize(args.output) / 1024 / 1024
    n_frames = len(frames_bgr)
    print(f"[lp_warp] ✅ Done → {args.output}  ({size_mb:.1f}MB)  frames={n_frames}",
          file=sys.stderr)
    import json as _json
    print(_json.dumps({
        "ok": True,
        "output": args.output,
        "frames": n_frames,
        "size_mb": round(size_mb, 2),
    }))


if __name__ == "__main__":
    main()
