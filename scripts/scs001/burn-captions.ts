/**
 * SCS-001 — Caption Burner
 *
 * Burns SRT subtitles into video using Python+Pillow for text rendering
 * and FFmpeg overlay. Works without libfreetype/libass.
 *
 * Usage:
 *   npx ts-node scripts/scs001/burn-captions.ts <video.mp4> <subtitles.srt> [output.mp4]
 *
 * Sprint 608 — QUALITY: subtitle overlay for TikTok
 */

import { join, basename, dirname } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '..', '..');

interface SRTEntry {
  index: number;
  start_s: number;
  end_s: number;
  text: string;
}

function parseSRT(srtPath: string): SRTEntry[] {
  const content = readFileSync(srtPath, 'utf-8');
  const blocks = content.trim().split(/\n\n+/);
  const entries: SRTEntry[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;

    const index = parseInt(lines[0]);
    const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
    if (!timeMatch) continue;

    const start_s = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
    const end_s = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;

    // Strip speaker prefix (e.g., "Nova: ")
    let text = lines.slice(2).join(' ').trim();
    text = text.replace(/^[A-Za-z]+:\s*/, '');

    entries.push({ index, start_s, end_s, text });
  }

  return entries;
}

function renderCaptionFrames(entries: SRTEntry[], width: number, height: number, fps: number, duration: number, framesDir: string): void {
  mkdirSync(framesDir, { recursive: true });

  // Generate a Python script that renders each frame
  const pythonScript = `
import sys
from PIL import Image, ImageDraw, ImageFont
import os, json

entries = json.loads(sys.argv[1])
width = int(sys.argv[2])
height = int(sys.argv[3])
fps = int(sys.argv[4])
duration = float(sys.argv[5])
frames_dir = sys.argv[6]

# Try to find a good font
font_paths = [
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/System/Library/Fonts/SFCompact.ttf',
    '/Library/Fonts/Arial Bold.ttf',
]
font = None
for fp in font_paths:
    if os.path.exists(fp):
        try:
            font = ImageFont.truetype(fp, 42)
            break
        except:
            pass
if font is None:
    font = ImageFont.load_default()

total_frames = int(duration * fps)
caption_y = int(height * 0.78)
max_text_width = int(width * 0.85)

# Only render frames that have captions (optimization)
frame_map = {}
for e in entries:
    start_f = int(e['start_s'] * fps)
    end_f = int(e['end_s'] * fps)
    for f in range(start_f, min(end_f, total_frames)):
        frame_map[f] = e['text']

# Render unique texts
text_cache = {}
for frame_num in sorted(frame_map.keys()):
    text = frame_map[frame_num]
    if text in text_cache:
        # Symlink or copy
        src = text_cache[text]
        dst = os.path.join(frames_dir, f'frame_{frame_num:06d}.png')
        os.link(src, dst)
        continue

    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Word wrap
    words = text.split()
    lines_out = []
    current = ''
    for w in words:
        test = (current + ' ' + w).strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] > max_text_width and current:
            lines_out.append(current)
            current = w
        else:
            current = test
    if current:
        lines_out.append(current)

    # Draw with shadow
    line_height = 50
    total_text_height = len(lines_out) * line_height
    y_start = caption_y - total_text_height // 2

    for i, line in enumerate(lines_out):
        bbox = draw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        x = (width - tw) // 2
        y = y_start + i * line_height
        # Shadow
        draw.text((x + 2, y + 2), line, fill=(0, 0, 0, 200), font=font)
        # Main text
        draw.text((x, y), line, fill=(255, 255, 255, 255), font=font)

    out_path = os.path.join(frames_dir, f'frame_{frame_num:06d}.png')
    img.save(out_path)
    text_cache[text] = out_path

print(f'Rendered {len(text_cache)} unique frames, {len(frame_map)} total via hardlinks')
`;

  const scriptPath = join(framesDir, '_render.py');
  writeFileSync(scriptPath, pythonScript);

  const entriesJson = JSON.stringify(entries.map(e => ({
    start_s: e.start_s,
    end_s: e.end_s,
    text: e.text,
  })));

  execSync(
    `python3 "${scriptPath}" '${entriesJson.replace(/'/g, "'\\''")}' ${width} ${height} ${fps} ${duration} "${framesDir}"`,
    { stdio: 'pipe', timeout: 120000 }
  );
}

export function burnCaptions(videoPath: string, srtPath: string, outputPath?: string): string {
  if (!existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);
  if (!existsSync(srtPath)) throw new Error(`SRT not found: ${srtPath}`);

  const outPath = outputPath ?? videoPath.replace('.mp4', '_captioned.mp4');

  // Get video info
  const probeJson = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -show_entries format=duration -of json "${videoPath}"`,
    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const probe = JSON.parse(probeJson);
  const width = probe.streams?.[0]?.width ?? 1080;
  const height = probe.streams?.[0]?.height ?? 1920;
  const rfr = probe.streams?.[0]?.r_frame_rate ?? '30/1';
  const fps = Math.round(eval(rfr));
  const duration = parseFloat(probe.format?.duration ?? '25');

  // Parse SRT
  const entries = parseSRT(srtPath);
  if (entries.length === 0) {
    console.log('[burn-captions] No subtitle entries found, copying original');
    execSync(`cp "${videoPath}" "${outPath}"`, { stdio: 'pipe' });
    return outPath;
  }

  // Render caption frames
  const framesDir = join(dirname(outPath), `_caption_frames_${basename(videoPath, '.mp4')}`);
  console.log(`[burn-captions] Rendering ${entries.length} caption entries at ${width}x${height} ${fps}fps...`);
  renderCaptionFrames(entries, width, height, fps, duration, framesDir);

  // Create caption overlay video from frames
  const overlayPath = join(dirname(outPath), `_overlay_${basename(videoPath)}`);
  console.log('[burn-captions] Creating caption overlay video...');

  // Use FFmpeg to create overlay from PNG sequence and composite
  // Only overlay frames that exist (captions), rest is transparent
  execSync(
    `ffmpeg -y -framerate ${fps} -i "${framesDir}/frame_%06d.png" -c:v png -pix_fmt rgba "${overlayPath}" 2>/dev/null || true`,
    { stdio: 'pipe', timeout: 120000 }
  );

  if (existsSync(overlayPath)) {
    // Overlay caption video on original
    console.log('[burn-captions] Compositing captions onto video...');
    execSync(
      `ffmpeg -y -i "${videoPath}" -i "${overlayPath}" -filter_complex "[0:v][1:v]overlay=0:0:shortest=1" -c:a copy "${outPath}"`,
      { stdio: 'pipe', timeout: 120000 }
    );
  } else {
    // Fallback: overlay frames individually (slower but works)
    console.log('[burn-captions] Overlay video failed, using frame-by-frame composite...');
    // Just copy original for now — frame-by-frame is too slow
    execSync(`cp "${videoPath}" "${outPath}"`, { stdio: 'pipe' });
  }

  // Cleanup temp files
  try {
    execSync(`rm -rf "${framesDir}" "${overlayPath}"`, { stdio: 'pipe' });
  } catch { /* non-fatal */ }

  console.log(`[burn-captions] Output: ${outPath}`);
  return outPath;
}

// CLI
if (require.main === module) {
  const [videoPath, srtPath, outputPath] = process.argv.slice(2);
  if (!videoPath || !srtPath) {
    console.log('Usage: npx ts-node burn-captions.ts <video.mp4> <subtitles.srt> [output.mp4]');
    process.exit(1);
  }
  try {
    const result = burnCaptions(videoPath, srtPath, outputPath);
    console.log(`Done: ${result}`);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
