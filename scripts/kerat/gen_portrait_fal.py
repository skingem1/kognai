#!/usr/bin/env python3
"""
TICKET-031-D: Ker@ portrait generation via fal.ai Flux

Generates portrait images for the chosen Ker@ concept using fal.ai Flux Dev.
Outputs JSON with local file paths for the TypeScript wrapper to send to Telegram.

Usage:
  python3 scripts/kerat/gen_portrait_fal.py \
    --concept 1 \
    --concepts-json workspace/kerat/portrait-concepts.json \
    --out-dir workspace/kerat/portraits \
    [--num-images 4] \
    [--model fal-ai/flux/dev]
"""

import argparse
import os
import sys
import json
import urllib.request

# FAL_KEY must be in env before importing fal_client
if not os.environ.get('FAL_KEY'):
    sys.stderr.write('[portrait-gen] FATAL: FAL_KEY not set\n')
    sys.exit(1)


def generate(
    positive_prompt: str,
    concept_name: str,
    out_dir: str,
    num_images: int = 4,
    model: str = 'fal-ai/flux/dev',
) -> list:
    """Generate portrait images via fal.ai. Returns list of local file paths."""
    import fal_client

    sys.stderr.write(f'[portrait-gen] Generating {num_images} image(s) via {model}\n')
    sys.stderr.write(f'[portrait-gen] Prompt: {positive_prompt[:100]}\n')

    result = fal_client.run(
        model,
        arguments={
            'prompt': positive_prompt,
            'image_size': 'square_hd',       # 1024×1024 — best for 512×512 lipsync
            'num_inference_steps': 28,
            'guidance_scale': 3.5,
            'num_images': num_images,
            'enable_safety_checker': False,
        },
    )

    images = result.get('images', [])
    if not images:
        raise RuntimeError(f'[portrait-gen] fal.ai returned no images: {json.dumps(result)[:200]}')

    os.makedirs(out_dir, exist_ok=True)
    paths = []
    safe_name = concept_name.lower().replace(' ', '_')

    for i, img in enumerate(images):
        url = img.get('url', '')
        if not url:
            sys.stderr.write(f'[portrait-gen] WARNING: image {i+1} has no URL, skipping\n')
            continue
        ext = url.split('.')[-1].split('?')[0] or 'jpg'
        filename = f'kerat_portrait_{safe_name}_{i+1:02d}.{ext}'
        path = os.path.join(out_dir, filename)
        sys.stderr.write(f'[portrait-gen] Downloading {i+1}/{len(images)}: {path}\n')
        urllib.request.urlretrieve(url, path)
        paths.append(path)
        sys.stderr.write(f'[portrait-gen] ✅ Saved: {path}\n')

    return paths


def main():
    parser = argparse.ArgumentParser(description='Ker@ portrait generation via fal.ai Flux')
    parser.add_argument('--concept', type=int, required=True, help='0-based concept index (A=0, B=1, C=2)')
    parser.add_argument('--concepts-json', type=str, required=True, help='Path to portrait-concepts.json')
    parser.add_argument('--out-dir', type=str, required=True, help='Output directory for generated images')
    parser.add_argument('--num-images', type=int, default=4, help='Number of images to generate')
    parser.add_argument('--model', type=str, default='fal-ai/flux/dev', help='fal.ai model ID')
    args = parser.parse_args()

    with open(args.concepts_json, 'r') as f:
        data = json.load(f)

    concepts = data.get('concepts', [])
    if args.concept >= len(concepts):
        sys.stderr.write(f'[portrait-gen] FATAL: concept index {args.concept} out of range (have {len(concepts)})\n')
        sys.exit(1)

    concept = concepts[args.concept]
    sys.stderr.write(f'[portrait-gen] Concept {args.concept}: {concept["name"]} — {concept["mood"]}\n')

    paths = generate(
        positive_prompt=concept['positive_prompt'],
        concept_name=concept['name'],
        out_dir=args.out_dir,
        num_images=args.num_images,
        model=args.model,
    )

    if not paths:
        sys.stderr.write('[portrait-gen] FATAL: no images generated\n')
        sys.exit(1)

    meta = {
        'concept_index': args.concept,
        'concept_name': concept['name'],
        'mood': concept['mood'],
        'positive_prompt': concept['positive_prompt'],
        'negative_prompt': concept.get('negative_prompt', ''),
        'model': args.model,
        'num_generated': len(paths),
        'paths': paths,
    }
    print(json.dumps(meta))


if __name__ == '__main__':
    main()
