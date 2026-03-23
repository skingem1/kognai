/**
 * video-segment-generator.ts — Real video segment generation for SCS-001 v2
 *
 * Routes each Scene to the appropriate video source based on visual_style:
 *   TALKING (react_cam, documentary) → Captions.ai avatar
 *   VISUAL (kinetic_text, b_roll_montage, split_screen, meme_template) → fal.ai Kling 2.5
 *   CODE (screen_recording) → Pillow terminal animation ($0)
 *
 * Used by MovieEditor.assemble() to replace color-block placeholders with real video.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Scene, VisualStyle } from '../../contracts/scs-001-v2/scenario-bundle-v1';

const ROOT = join(__dirname, '..', '..');

export interface SegmentVideoResult {
  path: string;
  source: 'captions' | 'kling' | 'ltx' | 'wan' | 'pillow' | 'color-fallback';
  cost_usd: number;
  duration_s: number;
}

// Which visual styles get avatar treatment vs B-roll
const TALKING_STYLES: Set<VisualStyle> = new Set(['react_cam', 'documentary']);
const CODE_STYLES: Set<VisualStyle> = new Set(['screen_recording']);
// Everything else → B-roll via fal.ai

/**
 * Generate a real video segment for a single Scene.
 * This is the core routing function that Scorsese's visual_style controls.
 */
export async function generateSegmentVideo(
  scene: Scene,
  outDir: string,
  sceneIndex: number,
): Promise<SegmentVideoResult> {
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `scene_${sceneIndex}_${scene.scene_name}.mp4`);

  // If already generated (idempotent), return cached
  if (existsSync(outPath)) {
    return { path: outPath, source: 'color-fallback', cost_usd: 0, duration_s: scene.duration_s };
  }

  try {
    if (TALKING_STYLES.has(scene.visual_style)) {
      return await generateAvatarSegment(scene, outPath);
    } else if (CODE_STYLES.has(scene.visual_style)) {
      return generateTerminalSegment(scene, outPath);
    } else {
      return await generateBrollSegment(scene, outPath);
    }
  } catch (err: any) {
    console.warn(`  [SegGen] ❌ ${scene.scene_name} failed (${err.message}), using color fallback`);
    return generateColorFallback(scene, outPath);
  }
}

// ── Avatar (Captions.ai) ──────────────────────────────

async function generateAvatarSegment(scene: Scene, outPath: string): Promise<SegmentVideoResult> {
  const { generateAvatarVideo } = await import('./avatar-presenter');

  console.log(`  [SegGen] 🎤 Avatar for "${scene.scene_name}" (${scene.duration_s}s)...`);

  // Retry once on timeout (Captions.ai can be slow)
  let result: { path: string; cost_credits: number };
  try {
    result = await generateAvatarVideo(
      scene.voiceover,
      outPath,
      process.env.CAPTIONS_CREATOR ?? 'Jason',
    );
  } catch (err: any) {
    if (err.message?.includes('timeout')) {
      console.log(`  [SegGen] ⏱️ Avatar timeout — retrying once...`);
      result = await generateAvatarVideo(
        scene.voiceover,
        outPath,
        process.env.CAPTIONS_CREATOR ?? 'Jason',
      );
    } else {
      throw err;
    }
  }

  // Captions.ai outputs high-res, scale to 1080x1920 for consistency
  const scaledPath = outPath.replace('.mp4', '_scaled.mp4');
  try {
    execSync(
      `/opt/homebrew/bin/ffmpeg -y -i "${result.path}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -t ${scene.duration_s} -c:v libx264 -c:a aac "${scaledPath}"`,
      { timeout: 30000, stdio: 'pipe' },
    );
    // Replace original with scaled
    execSync(`mv "${scaledPath}" "${outPath}"`, { stdio: 'pipe' });
  } catch {
    // If scaling fails, use original
  }

  return {
    path: outPath,
    source: 'captions',
    cost_usd: 0, // Captions uses credits, not USD
    duration_s: scene.duration_s,
  };
}

// ── B-roll (fal.ai Kling 2.5 / LTX-2.3) ─────────────

async function generateBrollSegment(scene: Scene, outPath: string): Promise<SegmentVideoResult> {
  const { generateBrollVideo } = await import('./fal-video-client');

  console.log(`  [SegGen] 🎬 B-roll for "${scene.scene_name}" (${scene.duration_s}s)...`);

  const result = await generateBrollVideo(
    scene.visual_description || scene.voiceover,
    scene.duration_s,
    outPath,
    'kling', // Kling 2.5 preferred for quality
  );

  // Trim to exact duration if needed
  try {
    const trimPath = outPath.replace('.mp4', '_trim.mp4');
    execSync(
      `/opt/homebrew/bin/ffmpeg -y -i "${result.path}" -t ${scene.duration_s} -c:v libx264 -c:a aac "${trimPath}"`,
      { timeout: 30000, stdio: 'pipe' },
    );
    execSync(`mv "${trimPath}" "${outPath}"`, { stdio: 'pipe' });
  } catch {
    // If trim fails, use as-is
  }

  return {
    path: outPath,
    source: result.source,
    cost_usd: result.cost_usd,
    duration_s: scene.duration_s,
  };
}

// ── Terminal animation (Pillow + FFmpeg, $0) ──────────

function generateTerminalSegment(scene: Scene, outPath: string): SegmentVideoResult {
  console.log(`  [SegGen] 💻 Terminal for "${scene.scene_name}" (${scene.duration_s}s)...`);

  // Extract "code-like" lines from visual_description or voiceover
  const text = scene.visual_description || scene.voiceover;
  const lines = text.split(/[.!?]\s+/).map(s => `$ ${s.trim()}`).slice(0, 10);

  // Generate via Python Pillow (same approach as tested earlier)
  const pyScript = `
import os, subprocess
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, DUR = 1080, 1920, 30, ${scene.duration_s}
FRAMES = FPS * DUR
OUT_DIR = "/tmp/seg_term_frames"
os.makedirs(OUT_DIR, exist_ok=True)

lines = ${JSON.stringify(lines)}
font_path = "/System/Library/Fonts/Menlo.ttc"
try:
    font = ImageFont.truetype(font_path, 28)
except:
    font = ImageFont.load_default()

for f in range(FRAMES):
    img = Image.new("RGB", (W, H), (15, 15, 25))
    draw = ImageDraw.Draw(img)
    total_chars = f * 3
    y, used = 80, 0
    for line in lines:
        if used >= total_chars: break
        vis = line[:total_chars - used]
        used += len(line) + 1
        color = (0, 255, 100) if vis.startswith("$") else (200, 200, 200)
        draw.text((40, y), vis, fill=color, font=font)
        y += 36
    img.save(f"{OUT_DIR}/f_{f:04d}.png")

subprocess.run(["/opt/homebrew/bin/ffmpeg", "-y", "-framerate", str(FPS),
    "-i", f"{OUT_DIR}/f_%04d.png", "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "${outPath}"], capture_output=True)
import shutil
shutil.rmtree(OUT_DIR, ignore_errors=True)
`;

  try {
    execSync(`python3 -c ${JSON.stringify(pyScript)}`, { timeout: 60000, stdio: 'pipe' });
  } catch {
    // Fallback to color block
    return generateColorFallback(scene, outPath);
  }

  return { path: outPath, source: 'pillow', cost_usd: 0, duration_s: scene.duration_s };
}

// ── Color block fallback (FFmpeg, $0) ─────────────────

function generateColorFallback(scene: Scene, outPath: string): SegmentVideoResult {
  const colors: Record<string, string> = {
    kinetic_text: '1a1a3e', b_roll_montage: '0d1b2a', split_screen: '1e3a5f',
    react_cam: '2d1b4e', screen_recording: '0a1628', meme_template: '3e1a1a',
    documentary: '1a2e1a',
  };
  const color = colors[scene.visual_style] ?? '1a1a2e';

  execSync(
    `/opt/homebrew/bin/ffmpeg -y -f lavfi -i "color=c=0x${color}:s=1080x1920:d=${scene.duration_s}:r=30" -c:v libx264 -pix_fmt yuv420p "${outPath}"`,
    { timeout: 15000, stdio: 'pipe' },
  );

  return { path: outPath, source: 'color-fallback', cost_usd: 0, duration_s: scene.duration_s };
}

/**
 * Generate all scene videos for a ScenarioBundle.
 * Returns array of results in scene order.
 */
export async function generateAllSegments(
  scenes: Scene[],
  outDir: string,
): Promise<SegmentVideoResult[]> {
  const results: SegmentVideoResult[] = [];
  let totalCost = 0;

  for (let i = 0; i < scenes.length; i++) {
    const result = await generateSegmentVideo(scenes[i], outDir, i);
    results.push(result);
    totalCost += result.cost_usd;
  }

  console.log(`  [SegGen] ${results.length} segments generated (cost: $${totalCost.toFixed(2)})`);
  return results;
}
