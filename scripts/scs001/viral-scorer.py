#!/usr/bin/env python3
"""Viral scorer — scene density, audio excitement, clip-topic alignment.
Reads JSON from stdin, writes JSON to stdout. Graceful degradation on missing deps."""

import json
import sys
import os

# --- Scene Density (PySceneDetect) ---
def scene_density(video_path: str) -> float:
    try:
        from scenedetect import open_video, SceneManager
        from scenedetect.detectors import ContentDetector
        video = open_video(video_path)
        sm = SceneManager()
        sm.add_detector(ContentDetector(threshold=27.0))
        sm.detect_scenes(video)
        scenes = sm.get_scene_list()
        duration = video.duration.get_seconds()
        if duration <= 0:
            return 0.5
        density = len(scenes) / max(duration / 5.0, 1.0)
        return min(1.0, max(0.0, density))
    except ImportError:
        print("WARN: scenedetect not installed, using fallback 0.5", file=sys.stderr)
        return 0.5
    except Exception as e:
        print(f"WARN: scene_density error: {e}", file=sys.stderr)
        return 0.5


# --- Audio Excitement (librosa) ---
def audio_excitement(video_path: str) -> float:
    try:
        import librosa
        import subprocess
        import tempfile
        # Extract audio via ffmpeg
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            subprocess.run(
                ["ffmpeg", "-i", video_path, "-ac", "1", "-ar", "22050", "-y", tmp_path],
                capture_output=True, timeout=30
            )
            y, sr = librosa.load(tmp_path, sr=22050)
            rms = librosa.feature.rms(y=y)[0].mean()
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            tempo_val = float(tempo) if hasattr(tempo, '__float__') else float(tempo[0]) if len(tempo) > 0 else 120.0
            # Normalize: RMS 0-0.3 → 0-1, tempo 60-180 → 0-1
            rms_score = min(1.0, rms / 0.3)
            tempo_score = min(1.0, max(0.0, (tempo_val - 60) / 120))
            return round((rms_score * 0.6 + tempo_score * 0.4), 4)
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    except ImportError:
        print("WARN: librosa not installed, using fallback 0.5", file=sys.stderr)
        return 0.5
    except Exception as e:
        print(f"WARN: audio_excitement error: {e}", file=sys.stderr)
        return 0.5


# --- Clip-Topic Alignment (OpenCLIP) ---
def clip_topic_alignment(video_path: str, topics: list) -> float:
    try:
        import open_clip
        import torch
        from PIL import Image
        import subprocess
        import tempfile
        import glob as g

        model, _, preprocess = open_clip.create_model_and_transforms("ViT-B-32", pretrained="openai")
        tokenizer = open_clip.get_tokenizer("ViT-B-32")
        model.eval()

        # Extract 1 frame per second
        with tempfile.TemporaryDirectory() as tmpdir:
            subprocess.run(
                ["ffmpeg", "-i", video_path, "-vf", "fps=1", f"{tmpdir}/frame_%04d.jpg"],
                capture_output=True, timeout=60
            )
            frames = sorted(g.glob(f"{tmpdir}/frame_*.jpg"))
            if not frames or not topics:
                return 0.5

            # Encode frames
            images = torch.stack([preprocess(Image.open(f)) for f in frames[:15]])  # cap at 15 frames
            with torch.no_grad():
                image_features = model.encode_image(images)
                text_tokens = tokenizer(topics)
                text_features = model.encode_text(text_tokens)
                image_features /= image_features.norm(dim=-1, keepdim=True)
                text_features /= text_features.norm(dim=-1, keepdim=True)
                similarity = (image_features @ text_features.T).mean().item()
            # Cosine sim typically 0.15-0.35 for related content; normalize to 0-1
            return round(min(1.0, max(0.0, (similarity - 0.1) / 0.3)), 4)
    except ImportError:
        print("WARN: open_clip not installed, using fallback 0.5", file=sys.stderr)
        return 0.5
    except Exception as e:
        print(f"WARN: clip_topic_alignment error: {e}", file=sys.stderr)
        return 0.5


if __name__ == "__main__":
    data = json.loads(sys.stdin.read()) if not sys.stdin.isatty() else {}
    vpath, topics = data.get("video_path", ""), data.get("topics", [])
    FALLBACK = {"scene_density_score": 0.5, "audio_excitement": 0.5, "clip_topic_alignment": 0.5, "partial_viral_score": 0.5}
    if not vpath or not os.path.exists(vpath):
        json.dump(FALLBACK, sys.stdout)
    else:
        sd, ae, ca = scene_density(vpath), audio_excitement(vpath), clip_topic_alignment(vpath, topics)
        json.dump({"scene_density_score": sd, "audio_excitement": ae,
                    "clip_topic_alignment": ca, "partial_viral_score": round(ca*0.35 + ae*0.35 + sd*0.30, 4)}, sys.stdout)
