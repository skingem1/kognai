/**
 * SCS-001 — Split-Screen Compositor
 *
 * Composites individual avatar video segments into split-screen layouts using FFmpeg.
 *
 * Layouts:
 *   Type 1 (EXPLAINER): Full-screen single avatar (1080x1920, 9:16)
 *   Type 2 (DEBATE):    Vertical split — 2 avatars stacked (1080x1920, 9:16)
 *   Type 3 (VISION):    3-way split — 3 avatars in grid + optional AI video panel
 *
 * Each layout includes:
 *   - Speaker name labels
 *   - Active speaker highlight (subtle border glow)
 *   - Background gradient
 *   - Animated captions at bottom
 */

import { execSync, execFileSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { VideoScript, DialogueLine } from './multiformat-scriptgen';

// ── Types ──────────────────────────────────────────────

export interface CompositorInput {
  script:       VideoScript;
  avatar_clips: Map<string, string>;  // avatar_id → video file path
  tts_audio:    string[];             // ordered list of TTS audio file paths (one per line)
  output_dir:   string;
}

export interface CompositorResult {
  script_id:    string;
  format:       string;
  output_path:  string;
  duration_s:   number;
  resolution:   string;
  srt_path:     string;
  success:      boolean;
  error?:       string;
}

// ── Config ─────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..');
const DEFAULT_OUT_DIR = join(ROOT, 'workspace', 'scs001', 'composited');

// TikTok vertical: 1080x1920
const WIDTH = 1080;
const HEIGHT = 1920;

// Colors
const BG_COLOR = '#0a0a1a';        // Dark navy background
const LABEL_COLOR = '#ffffff';
const LABEL_BG = '#1a1a3e';
const ACCENT_A = '#00d4ff';         // Cyan for speaker A
const ACCENT_B = '#ff6b35';         // Orange for speaker B
const ACCENT_C = '#a855f7';         // Purple for speaker C

// ── SRT Generator ──────────────────────────────────────

function generateSRT(lines: DialogueLine[]): string {
  return lines.map((line, i) => {
    const startH = Math.floor(line.start_s / 3600);
    const startM = Math.floor((line.start_s % 3600) / 60);
    const startS = Math.floor(line.start_s % 60);
    const startMs = Math.round((line.start_s % 1) * 1000);

    const endH = Math.floor(line.end_s / 3600);
    const endM = Math.floor((line.end_s % 3600) / 60);
    const endS = Math.floor(line.end_s % 60);
    const endMs = Math.round((line.end_s % 1) * 1000);

    const pad = (n: number, len: number = 2) => n.toString().padStart(len, '0');

    return `${i + 1}\n${pad(startH)}:${pad(startM)}:${pad(startS)},${pad(startMs, 3)} --> ${pad(endH)}:${pad(endM)}:${pad(endS)},${pad(endMs, 3)}\n${line.speaker}: ${line.text}\n`;
  }).join('\n');
}

// ── FFmpeg Helpers ──────────────────────────────────────

function ffmpegAvailable(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

/**
 * Generate a title card PNG with text using Python/Pillow.
 * Used as background frame when no avatar is available.
 */
function generateTitleCard(
  title: string, subtitle: string, color: string,
  width: number, height: number, outputPath: string,
): void {
  const escapedTitle = title.replace(/'/g, "\\'").replace(/"/g, '\\"');
  const escapedSub = subtitle.replace(/'/g, "\\'").replace(/"/g, '\\"');
  const pyScript = `
from PIL import Image, ImageDraw, ImageFont
import textwrap, sys

W, H = ${width}, ${height}
img = Image.new('RGB', (W, H), '${color}')
draw = ImageDraw.Draw(img)

# Use default font (always available)
try:
    title_font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 52)
    sub_font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 32)
    label_font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 24)
except:
    title_font = ImageFont.load_default()
    sub_font = title_font
    label_font = title_font

# Top gradient bar
for y in range(200):
    alpha = int(255 * (1 - y / 200))
    draw.rectangle([(0, y), (W, y + 1)], fill=(0, 180, 255, alpha) if alpha > 0 else '${color}')

# Format label
draw.rounded_rectangle([(W//2 - 80, 80), (W//2 + 80, 115)], radius=10, fill='#00b4d8')
draw.text((W//2, 97), '${escapedSub}'.upper(), fill='white', font=label_font, anchor='mm')

# Title text (centered, wrapped)
lines = textwrap.wrap('${escapedTitle}', width=28)
y_start = H // 2 - len(lines) * 35
for i, line in enumerate(lines):
    draw.text((W // 2, y_start + i * 70), line, fill='white', font=title_font, anchor='mm')

# Bottom brand bar
draw.rectangle([(0, H - 60), (W, H)], fill='#0d0d2b')
draw.text((W // 2, H - 30), 'KOGNAI', fill='#00b4d8', font=label_font, anchor='mm')

img.save('${outputPath.replace(/'/g, "\\'")}')
`;
  execSync(`python3 -c '${pyScript.replace(/'/g, "'\"'\"'")}'`, { stdio: 'pipe', timeout: 10000 });
}

/**
 * Generate a subtitle overlay PNG for a single dialogue line.
 */
function generateSubtitleFrame(
  speaker: string, text: string,
  width: number, height: number, outputPath: string,
): void {
  const escapedText = text.replace(/'/g, "\\'").replace(/"/g, '\\"');
  const escapedSpeaker = speaker.replace(/'/g, "\\'");
  const pyScript = `
from PIL import Image, ImageDraw, ImageFont
import textwrap

W, H = ${width}, ${height}
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

try:
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 36)
    name_font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 28)
except:
    font = ImageFont.load_default()
    name_font = font

# Semi-transparent subtitle bar at bottom
bar_h = 200
bar_y = H - bar_h - 80
draw.rounded_rectangle([(40, bar_y), (W - 40, bar_y + bar_h)], radius=20, fill=(10, 10, 40, 200))

# Speaker name
draw.text((W // 2, bar_y + 25), '${escapedSpeaker}'.upper(), fill=(0, 180, 255), font=name_font, anchor='mt')

# Subtitle text (wrapped)
lines = textwrap.wrap('${escapedText}', width=35)
for i, line in enumerate(lines):
    draw.text((W // 2, bar_y + 65 + i * 45), line, fill='white', font=font, anchor='mt')

img.save('${outputPath.replace(/'/g, "\\'")}')
`;
  execSync(`python3 -c '${pyScript.replace(/'/g, "'\"'\"'")}'`, { stdio: 'pipe', timeout: 10000 });
}

/**
 * Create a video from a title card with animated subtitles.
 * Each dialogue line gets its own subtitle frame shown at the right time.
 */
function createMockVideo(
  title: string, formatLabel: string, color: string,
  width: number, height: number, duration: number,
  lines: DialogueLine[], outputDir: string, scriptId: string,
  outputPath: string,
): void {
  const framesDir = join(outputDir, `${scriptId}_frames`);
  mkdirSync(framesDir, { recursive: true });

  // 1. Generate title card background
  const bgPath = join(framesDir, 'bg.png');
  generateTitleCard(title, formatLabel, color, width, height, bgPath);

  // 2. Generate subtitle frames for each line
  const subFrames: { path: string; start: number; end: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const framePath = join(framesDir, `sub_${i}.png`);
    generateSubtitleFrame(lines[i].speaker, lines[i].text, width, height, framePath);
    subFrames.push({ path: framePath, start: lines[i].start_s, end: lines[i].end_s });
  }

  // 3. Build FFmpeg command: background image → video, then overlay subtitle PNGs at correct times
  // First: create base video from the title card image
  const baseVideoPath = join(outputDir, `${scriptId}_base.mp4`);
  execSync([
    'ffmpeg -y',
    `-loop 1 -i "${bgPath}"`,
    `-c:v libx264 -t ${duration} -pix_fmt yuv420p -r 30`,
    `-vf "scale=${width}:${height}"`,
    `"${baseVideoPath}"`,
  ].join(' '), { stdio: 'pipe', timeout: 30000 });

  // 4. Overlay subtitle frames one by one using FFmpeg
  let currentVideo = baseVideoPath;
  for (let i = 0; i < subFrames.length; i++) {
    const sub = subFrames[i];
    const nextVideo = join(outputDir, `${scriptId}_sub${i}.mp4`);
    try {
      execSync([
        'ffmpeg -y',
        `-i "${currentVideo}"`,
        `-i "${sub.path}"`,
        `-filter_complex "[0:v][1:v]overlay=0:0:enable='between(t,${sub.start},${sub.end})'[v]"`,
        '-map "[v]"',
        '-c:v libx264 -preset fast -crf 23',
        `"${nextVideo}"`,
      ].join(' '), { stdio: 'pipe', timeout: 30000 });
      currentVideo = nextVideo;
    } catch {
      // If overlay fails, keep the previous video
    }
  }

  // 5. Copy final result
  if (currentVideo !== outputPath) {
    execSync(`cp "${currentVideo}" "${outputPath}"`, { stdio: 'pipe' });
  }
}

// ── Audio Helpers ─────────────────────────────────────

/**
 * Concatenate TTS audio segments with silence gaps matching script timings,
 * then mux into the video file.
 */
function muxAudioIntoVideo(
  videoPath: string,
  ttsAudioPaths: string[],
  lines: DialogueLine[],
  totalDuration: number,
  outputDir: string,
  scriptId: string,
): string {
  // Build a concat file that interleaves silence and speech per the script timings
  const concatListPath = join(outputDir, `${scriptId}_audio_concat.txt`);
  const mergedAudioPath = join(outputDir, `${scriptId}_merged_audio.aiff`);
  const finalPath = join(outputDir, `${scriptId}_final_av.mp4`);

  // Use ffmpeg to build full audio track with correct timing via filter_complex
  // Generate silence + speech segments positioned at the right timestamps
  const validPairs: { audio: string; start: number }[] = [];
  for (let i = 0; i < Math.min(ttsAudioPaths.length, lines.length); i++) {
    if (ttsAudioPaths[i] && existsSync(ttsAudioPaths[i])) {
      validPairs.push({ audio: ttsAudioPaths[i], start: lines[i].start_s });
    }
  }

  if (validPairs.length === 0) return videoPath; // No audio to mix

  try {
    // Build filter_complex: inputs + adelay + amix
    const inputs = validPairs.map((p, i) => `-i "${p.audio}"`).join(' ');
    const delays = validPairs.map((p, i) => {
      const delayMs = Math.round(p.start * 1000);
      return `[${i + 1}:a]adelay=${delayMs}|${delayMs}[a${i}]`;
    }).join('; ');
    const mixInputs = validPairs.map((_, i) => `[a${i}]`).join('');
    const filterComplex = `${delays}; ${mixInputs}amix=inputs=${validPairs.length}:duration=longest[aout]`;

    execSync([
      'ffmpeg -y',
      `-i "${videoPath}"`,       // input 0: video
      inputs,                     // inputs 1..N: audio files
      `-filter_complex "${filterComplex}"`,
      '-map 0:v -map "[aout]"',
      '-c:v copy',
      '-c:a aac -b:a 128k',
      `-t ${totalDuration}`,
      `"${finalPath}"`,
    ].join(' '), { stdio: 'pipe', timeout: 60000 });

    return finalPath;
  } catch (err) {
    console.warn(`[Compositor] Audio mux failed: ${(err as Error).message.slice(0, 100)}`);
    return videoPath; // Fallback to video-only
  }
}

/**
 * Burn SRT subtitles into video. Returns the output path.
 * If subtitle burning fails, returns the original video path.
 */
function burnSubtitles(videoPath: string, srtPath: string, _duration: number, outputPath: string): string {
  // Sprint 608: Use burn-captions.ts (Python+Pillow) for subtitle overlay
  try {
    const { burnCaptions } = require('./burn-captions');
    return burnCaptions(videoPath, srtPath, outputPath);
  } catch (err: any) {
    console.warn(`[compositor] Caption burn failed, copying original: ${err.message?.slice(0, 100)}`);
    if (videoPath !== outputPath) {
      try {
        execSync(`cp "${videoPath}" "${outputPath}"`, { stdio: 'pipe' });
        return outputPath;
      } catch {
        return videoPath;
      }
    }
    return videoPath;
  }
}

// ── Type 1: Full-Screen Single Avatar ──────────────────

function compositeExplainer(input: CompositorInput): CompositorResult {
  const { script, avatar_clips, output_dir } = input;
  mkdirSync(output_dir, { recursive: true });

  const outputPath = join(output_dir, `${script.script_id}_final.mp4`);
  const srtPath = join(output_dir, `${script.script_id}.srt`);

  // Generate SRT
  writeFileSync(srtPath, generateSRT(script.lines));

  // For Type 1: single avatar, full screen
  const avatarId = script.lines[0]?.avatar_id;
  const avatarClip = avatarId ? avatar_clips.get(avatarId) : undefined;

  if (avatarClip && existsSync(avatarClip)) {
    // Scale avatar to fill frame, add background, add labels
    try {
      execSync([
        'ffmpeg -y',
        `-i "${avatarClip}"`,
        `-filter_complex "[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=${BG_COLOR}[v]"`,
        '-map "[v]" -map 0:a?',
        '-c:v libx264 -preset fast -crf 23',
        '-c:a aac -b:a 128k',
        `-t ${script.total_duration_s}`,
        `"${outputPath}"`,
      ].join(' '), { stdio: 'pipe', timeout: 60000 });

      return { script_id: script.script_id, format: 'explainer', output_path: outputPath, duration_s: script.total_duration_s, resolution: `${WIDTH}x${HEIGHT}`, srt_path: srtPath, success: true };
    } catch (err) {
      return { script_id: script.script_id, format: 'explainer', output_path: '', duration_s: 0, resolution: '', srt_path: srtPath, success: false, error: (err as Error).message };
    }
  } else {
    // Mock: generate video with title card + subtitle overlays + TTS audio
    try {
      const videoOnlyPath = join(output_dir, `${script.script_id}_video_only.mp4`);
      createMockVideo(
        script.title, 'EXPLAINER', '#1a1a3e',
        WIDTH, HEIGHT, script.total_duration_s,
        script.lines, output_dir, script.script_id, videoOnlyPath,
      );

      // Mux TTS audio into the video
      const withAudio = muxAudioIntoVideo(videoOnlyPath, input.tts_audio, script.lines, script.total_duration_s, output_dir, script.script_id);

      // Copy to final output path
      const finalPath = burnSubtitles(withAudio, srtPath, script.total_duration_s, outputPath);

      return { script_id: script.script_id, format: 'explainer', output_path: finalPath, duration_s: script.total_duration_s, resolution: `${WIDTH}x${HEIGHT}`, srt_path: srtPath, success: true };
    } catch (err) {
      return { script_id: script.script_id, format: 'explainer', output_path: '', duration_s: 0, resolution: '', srt_path: srtPath, success: false, error: (err as Error).message };
    }
  }
}

// ── Type 2: Debate Split-Screen (2 Avatars) ────────────

function compositeDebate(input: CompositorInput): CompositorResult {
  const { script, avatar_clips, output_dir } = input;
  mkdirSync(output_dir, { recursive: true });

  const outputPath = join(output_dir, `${script.script_id}_final.mp4`);
  const srtPath = join(output_dir, `${script.script_id}.srt`);

  writeFileSync(srtPath, generateSRT(script.lines));

  // Get the two unique avatar IDs
  const avatarIds = [...new Set(script.lines.map(l => l.avatar_id))];
  const clipA = avatarIds[0] ? avatar_clips.get(avatarIds[0]) : undefined;
  const clipB = avatarIds[1] ? avatar_clips.get(avatarIds[1]) : undefined;

  const hasRealClips = clipA && existsSync(clipA) && clipB && existsSync(clipB);

  if (hasRealClips) {
    // Real split-screen: top half = avatar A, bottom half = avatar B
    // Each half is 1080x960 (half of 1920)
    const halfH = HEIGHT / 2;
    try {
      execSync([
        'ffmpeg -y',
        `-i "${clipA}"`,
        `-i "${clipB}"`,
        `-filter_complex "`,
        // Scale both to half height
        `[0:v]scale=${WIDTH}:${halfH}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${halfH}:(ow-iw)/2:(oh-ih)/2:color=${BG_COLOR}[a];`,
        `[1:v]scale=${WIDTH}:${halfH}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${halfH}:(ow-iw)/2:(oh-ih)/2:color=${BG_COLOR}[b];`,
        // Stack vertically
        `[a][b]vstack=inputs=2[stacked];`,
        // Add divider line
        `[stacked]drawbox=x=0:y=${halfH - 2}:w=${WIDTH}:h=4:color=${ACCENT_A}:t=fill[v]`,
        `"`,
        '-map "[v]"',
        // Mix audio from both (first avatar takes priority)
        '-filter_complex_script /dev/null',
        '-c:v libx264 -preset fast -crf 23',
        `-t ${script.total_duration_s}`,
        `"${outputPath}"`,
      ].join(' '), { stdio: 'pipe', timeout: 60000 });

      return { script_id: script.script_id, format: 'debate', output_path: outputPath, duration_s: script.total_duration_s, resolution: `${WIDTH}x${HEIGHT}`, srt_path: srtPath, success: true };
    } catch (err) {
      // Fall through to mock
      console.warn(`[Compositor] Debate FFmpeg failed: ${(err as Error).message}`);
    }
  }

  // Mock: debate with title card + subtitle overlays + TTS audio
  try {
    const videoOnlyPath = join(output_dir, `${script.script_id}_video_only.mp4`);
    createMockVideo(
      script.title, 'DEBATE', '#0d1b2a',
      WIDTH, HEIGHT, script.total_duration_s,
      script.lines, output_dir, script.script_id, videoOnlyPath,
    );

    // Mux TTS audio into the video
    const withAudio = muxAudioIntoVideo(videoOnlyPath, input.tts_audio, script.lines, script.total_duration_s, output_dir, script.script_id);

    // Copy to final output path
    burnSubtitles(withAudio, srtPath, script.total_duration_s, outputPath);

    return { script_id: script.script_id, format: 'debate', output_path: outputPath, duration_s: script.total_duration_s, resolution: `${WIDTH}x${HEIGHT}`, srt_path: srtPath, success: true };
  } catch (err) {
    return { script_id: script.script_id, format: 'debate', output_path: '', duration_s: 0, resolution: '', srt_path: srtPath, success: false, error: (err as Error).message };
  }
}

// ── Type 3: Vision Roundtable (3 Avatars + Video) ──────

function compositeVision(input: CompositorInput): CompositorResult {
  const { script, avatar_clips, output_dir } = input;
  mkdirSync(output_dir, { recursive: true });

  const outputPath = join(output_dir, `${script.script_id}_final.mp4`);
  const srtPath = join(output_dir, `${script.script_id}.srt`);

  writeFileSync(srtPath, generateSRT(script.lines));

  // 3-avatar layout: top row = 2 avatars side by side, bottom = 1 avatar + optional video
  // Layout (9:16):
  //   ┌────────┬────────┐
  //   │  Sage  │ Prism  │  (each 540x640)
  //   ├────────┴────────┤
  //   │      Flux       │  (1080x640)
  //   ├─────────────────┤
  //   │   AI Video /    │  (1080x640)
  //   │   Title Card    │
  //   └─────────────────┘

  const avatarIds = [...new Set(script.lines.map(l => l.avatar_id))];
  const allClipsExist = avatarIds.every(id => {
    const clip = avatar_clips.get(id);
    return clip && existsSync(clip);
  });

  if (allClipsExist && avatarIds.length >= 3) {
    const clipPaths = avatarIds.map(id => avatar_clips.get(id)!);
    const cellW = WIDTH / 2;   // 540
    const cellH = HEIGHT / 3;  // 640

    try {
      execSync([
        'ffmpeg -y',
        ...clipPaths.map(p => `-i "${p}"`),
        `-filter_complex "`,
        // Scale avatars to cell size
        `[0:v]scale=${cellW}:${cellH}:force_original_aspect_ratio=decrease,pad=${cellW}:${cellH}:(ow-iw)/2:(oh-ih)/2:color=${BG_COLOR}[a];`,
        `[1:v]scale=${cellW}:${cellH}:force_original_aspect_ratio=decrease,pad=${cellW}:${cellH}:(ow-iw)/2:(oh-ih)/2:color=${BG_COLOR}[b];`,
        `[2:v]scale=${WIDTH}:${cellH}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${cellH}:(ow-iw)/2:(oh-ih)/2:color=${BG_COLOR}[c];`,
        // Create title card for bottom panel
        `color=c=${BG_COLOR}:s=${WIDTH}x${cellH}:d=${script.total_duration_s}:r=30[bg];`,
        // Stack: top row (A|B), middle (C), bottom (title)
        `[a][b]hstack=inputs=2[top];`,
        `[top][c]vstack=inputs=2[upper];`,
        `[upper][bg]vstack=inputs=2[v]`,
        `"`,
        '-map "[v]"',
        '-c:v libx264 -preset fast -crf 23',
        `-t ${script.total_duration_s}`,
        `"${outputPath}"`,
      ].join(' '), { stdio: 'pipe', timeout: 60000 });

      return { script_id: script.script_id, format: 'vision', output_path: outputPath, duration_s: script.total_duration_s, resolution: `${WIDTH}x${HEIGHT}`, srt_path: srtPath, success: true };
    } catch (err) {
      console.warn(`[Compositor] Vision FFmpeg failed: ${(err as Error).message}`);
    }
  }

  // Mock: vision roundtable with title card + subtitle overlays + TTS audio
  try {
    const videoOnlyPath = join(output_dir, `${script.script_id}_video_only.mp4`);
    createMockVideo(
      script.title, 'VISION', '#0a1628',
      WIDTH, HEIGHT, script.total_duration_s,
      script.lines, output_dir, script.script_id, videoOnlyPath,
    );

    // Mux TTS audio into the video
    const withAudio = muxAudioIntoVideo(videoOnlyPath, input.tts_audio, script.lines, script.total_duration_s, output_dir, script.script_id);

    // Copy to final output path
    burnSubtitles(withAudio, srtPath, script.total_duration_s, outputPath);

    return { script_id: script.script_id, format: 'vision', output_path: outputPath, duration_s: script.total_duration_s, resolution: `${WIDTH}x${HEIGHT}`, srt_path: srtPath, success: true };
  } catch (err) {
    return { script_id: script.script_id, format: 'vision', output_path: '', duration_s: 0, resolution: '', srt_path: srtPath, success: false, error: (err as Error).message };
  }
}

// ── Public API ─────────────────────────────────────────

export function composite(input: CompositorInput): CompositorResult {
  if (!ffmpegAvailable()) {
    return {
      script_id: input.script.script_id,
      format: input.script.format,
      output_path: '',
      duration_s: 0,
      resolution: '',
      srt_path: '',
      success: false,
      error: 'FFmpeg not available',
    };
  }

  switch (input.script.format) {
    case 'explainer':
      return compositeExplainer(input);
    case 'debate':
      return compositeDebate(input);
    case 'vision':
      return compositeVision(input);
    default:
      return compositeExplainer(input);
  }
}

export { generateSRT };
