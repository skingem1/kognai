#!/usr/bin/env python3.12
"""
TICKET-030-B: Ker@ Kokoro TTS — am_echo voice
Generates 24kHz mono WAV from text using mlx-audio Kokoro.

Usage:
  python3.12 scripts/kerat/tts_kokoro.py \\
    --text "Intelligence is a sovereign right." \\
    --out /tmp/kerat_tts.wav \\
    [--voice am_echo] [--speed 1.0]

Requirements:
  - python3.12 with mlx_audio==0.4.1
  - ESPEAK_DATA_PATH set (espeak-ng 1.52.0 data)
  - Model: mlx-community/Kokoro-82M-bf16 (cached after first run)
"""

import argparse
import os
import sys
import json
import numpy as np

# Must be set before any misaki/espeak import
os.environ.setdefault(
    'ESPEAK_DATA_PATH',
    '/opt/homebrew/Cellar/espeak-ng/1.52.0/share/espeak-ng-data'
)


def generate(text: str, voice: str, speed: float, out_path: str) -> dict:
    """Generate TTS audio and write to WAV. Returns metadata dict."""
    from mlx_audio.tts import load
    import soundfile as sf

    sys.stderr.write(f'[tts_kokoro] Loading Kokoro (voice={voice})...\n')
    model = load('mlx-community/Kokoro-82M-bf16', voice=voice)
    sample_rate = model.sample_rate  # 24000

    sys.stderr.write(f'[tts_kokoro] Generating audio for {len(text)} chars...\n')
    chunks = []
    for result in model.generate(text, speed=speed):
        chunks.append(np.array(result.audio))

    if not chunks:
        raise RuntimeError('[tts_kokoro] No audio chunks generated — empty output')

    audio = np.concatenate(chunks) if len(chunks) > 1 else chunks[0]
    duration_s = len(audio) / sample_rate

    # Ensure output dir exists
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    sf.write(out_path, audio, sample_rate, subtype='PCM_16')

    meta = {
        'path': out_path,
        'duration_s': round(duration_s, 3),
        'sample_rate': sample_rate,
        'samples': len(audio),
        'voice': voice,
        'speed': speed,
        'text_chars': len(text),
    }
    sys.stderr.write(
        f'[tts_kokoro] ✅ Written {out_path} — {duration_s:.2f}s @ {sample_rate}Hz\n'
    )
    return meta


def main():
    parser = argparse.ArgumentParser(description='Kokoro TTS for Ker@')
    parser.add_argument('--text', type=str, required=True, help='Text to synthesize')
    parser.add_argument('--out', type=str, required=True, help='Output WAV path')
    parser.add_argument('--voice', type=str, default='am_echo', help='Kokoro voice ID')
    parser.add_argument('--speed', type=float, default=1.0, help='Speech speed multiplier')
    args = parser.parse_args()

    try:
        meta = generate(args.text, args.voice, args.speed, args.out)
        # Print JSON to stdout so TypeScript caller can parse it
        print(json.dumps(meta))
    except Exception as e:
        sys.stderr.write(f'[tts_kokoro] FATAL: {e}\n')
        sys.exit(1)


if __name__ == '__main__':
    main()
