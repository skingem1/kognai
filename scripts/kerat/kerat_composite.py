#!/usr/bin/env python3
"""
Ker@ Composite — place SadTalker face video onto a background image.

Usage:
  python3 scripts/kerat/kerat_composite.py \
    --face  workspace/kerat/output/natural_test.mp4 \
    --bg    workspace/kerat/backgrounds/city.jpg \
    --out   workspace/kerat/output/composite.mp4 \
    [--scale 0.45]          # face size as fraction of output height
    [--position bottom]     # top | center | bottom
    [--output-size 1080x1920]  # WxH (portrait 9:16 default)
    [--fade-edge 20]        # px of soft edge fade
    [--shadow]              # add drop shadow behind face

Requires: ffmpeg with libx264
"""

import argparse
import json
import os
import subprocess
import sys


def probe_video(path: str) -> dict:
    """Get video dimensions and duration via ffprobe."""
    cmd = [
        'ffprobe', '-v', 'quiet', '-print_format', 'json',
        '-show_streams', '-show_format', path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    info = json.loads(result.stdout)
    vs = next(s for s in info['streams'] if s['codec_type'] == 'video')
    return {
        'width': int(vs['width']),
        'height': int(vs['height']),
        'duration': float(info['format'].get('duration', 0)),
        'fps': vs.get('r_frame_rate', '25/1'),
    }


def build_filter(
    face_w: int, face_h: int,
    out_w: int, out_h: int,
    scale: float,
    position: str,
    fade_edge: int,
    shadow: bool,
) -> str:
    """Build ffmpeg filter_complex string."""
    # Target face height = scale * output height
    target_h = int(out_h * scale)
    target_w = int(face_w * (target_h / face_h))
    # Ensure even dimensions
    target_w = target_w + (target_w % 2)
    target_h = target_h + (target_h % 2)

    # Position: center horizontally, variable vertically
    x = f'(W-w)/2'
    if position == 'top':
        y = str(int(out_h * 0.05))
    elif position == 'center':
        y = f'(H-h)/2'
    else:  # bottom (default — news anchor style)
        y = str(int(out_h - target_h - out_h * 0.08))

    parts = []

    # Scale face video
    parts.append(f'[1:v]scale={target_w}:{target_h}[face_scaled]')

    # Create rounded-rect alpha mask using geq
    # Elliptical soft edge: smoothstep from edge inward
    if fade_edge > 0:
        fe = fade_edge
        # Ellipse equation: ((x-cx)/rx)^2 + ((y-cy)/ry)^2
        # Soft edge via clamped linear falloff
        rx = target_w / 2
        ry = target_h / 2
        # Alpha = 255 inside ellipse, fade at edge
        alpha_expr = (
            f"'if(lt("
            f"(X-{rx})*(X-{rx})/({rx-fe}*{rx-fe})"
            f"+(Y-{ry})*(Y-{ry})/({ry-fe}*{ry-fe})"
            f",1),255,"
            f"if(lt("
            f"(X-{rx})*(X-{rx})/({rx}*{rx})"
            f"+(Y-{ry})*(Y-{ry})/({ry}*{ry})"
            f",1),"
            f"255*(1-("
            f"sqrt((X-{rx})*(X-{rx})/({rx}*{rx})+(Y-{ry})*(Y-{ry})/({ry}*{ry}))"
            f"-{(rx-fe)/rx})/({fe/rx})),"
            f"0))'"
        )
        parts.append(
            f'[face_scaled]format=rgba,'
            f'geq=r=r(X\\,Y):g=g(X\\,Y):b=b(X\\,Y):a={alpha_expr}'
            f'[face_masked]'
        )
        overlay_input = 'face_masked'
    else:
        overlay_input = 'face_scaled'

    # Optional drop shadow
    if shadow:
        sh_off = max(4, target_h // 80)  # shadow offset proportional to size
        sh_blur = max(8, target_h // 40)
        parts.append(
            f'[{overlay_input}]split[fg][shadow_src]'
        )
        parts.append(
            f'[shadow_src]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.45,'
            f'boxblur={sh_blur}:{sh_blur}'
            f'[shadow_layer]'
        )
        parts.append(
            f'[0:v][shadow_layer]overlay={x}+{sh_off}:{y}+{sh_off}:format=auto[bg_shadow]'
        )
        parts.append(
            f'[bg_shadow][fg]overlay={x}:{y}:format=auto[out]'
        )
    else:
        parts.append(
            f'[0:v][{overlay_input}]overlay={x}:{y}:format=auto[out]'
        )

    return ';'.join(parts)


def composite(
    face_path: str,
    bg_path: str,
    out_path: str,
    scale: float,
    position: str,
    output_size: str,
    fade_edge: int,
    shadow: bool,
) -> dict:
    """Run ffmpeg composite and return metadata."""
    face_info = probe_video(face_path)
    out_w, out_h = [int(x) for x in output_size.split('x')]

    sys.stderr.write(f'[composite] Face: {face_info["width"]}x{face_info["height"]} '
                     f'→ scale={scale} on {out_w}x{out_h} bg\n')

    filtergraph = build_filter(
        face_info['width'], face_info['height'],
        out_w, out_h, scale, position, fade_edge, shadow,
    )

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)

    cmd = [
        'ffmpeg', '-y',
        '-loop', '1', '-i', bg_path,          # input 0: background (looped still)
        '-i', face_path,                        # input 1: face video
        '-filter_complex', filtergraph,
        '-map', '[out]',
        '-map', '1:a?',                         # copy audio from face video if present
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
        '-c:a', 'aac', '-b:a', '128k',
        '-pix_fmt', 'yuv420p',
        '-shortest',                            # stop when face video ends
        '-t', str(face_info['duration']),        # explicit duration cap
        out_path,
    ]

    sys.stderr.write(f'[composite] Running ffmpeg...\n')
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        sys.stderr.write(f'[composite] ffmpeg stderr:\n{result.stderr[-2000:]}\n')
        raise RuntimeError(f'ffmpeg failed with exit code {result.returncode}')

    size_mb = os.path.getsize(out_path) / 1e6
    sys.stderr.write(f'[composite] ✅ {out_path} ({size_mb:.1f}MB)\n')

    return {
        'path': out_path,
        'size_mb': round(size_mb, 2),
        'output_size': output_size,
        'face_scale': scale,
        'position': position,
        'duration': face_info['duration'],
    }


def main():
    parser = argparse.ArgumentParser(description='Ker@ Composite — face on background')
    parser.add_argument('--face',        required=True, help='SadTalker face video')
    parser.add_argument('--bg',          required=True, help='Background image (JPG/PNG)')
    parser.add_argument('--out',         required=True, help='Output MP4 path')
    parser.add_argument('--scale',       type=float, default=0.45,
                        help='Face height as fraction of output (0.3=small, 0.45=medium, 0.6=large)')
    parser.add_argument('--position',    default='bottom', choices=['top', 'center', 'bottom'])
    parser.add_argument('--output-size', default='1080x1920', help='WxH (default 1080x1920 portrait)')
    parser.add_argument('--fade-edge',   type=int, default=25, help='Soft edge fade in pixels (0=hard)')
    parser.add_argument('--shadow',      action='store_true', help='Add drop shadow')
    args = parser.parse_args()

    try:
        meta = composite(
            args.face, args.bg, args.out,
            args.scale, args.position, args.output_size,
            args.fade_edge, args.shadow,
        )
        print(json.dumps(meta))
    except Exception as e:
        sys.stderr.write(f'[composite] FATAL: {e}\n')
        sys.exit(1)


if __name__ == '__main__':
    main()
