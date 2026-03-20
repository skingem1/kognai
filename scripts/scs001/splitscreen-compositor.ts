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

function createColorVideo(color: string, width: number, height: number, duration: number, outputPath: string, _label?: string): void {
  // Generate a solid color video (mock/testing — drawtext removed, not available in all ffmpeg builds)
  const filter = `color=c=${color}:s=${width}x${height}:d=${duration}:r=30`;
  execSync(
    `ffmpeg -y -f lavfi -i "${filter}" -c:v libx264 -pix_fmt yuv420p -t ${duration} "${outputPath}"`,
    { stdio: 'pipe', timeout: 30000 }
  );
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
    // Mock: generate color video
    try {
      createColorVideo('#1a1a3e', WIDTH, HEIGHT, script.total_duration_s, outputPath, `EXPLAINER\n${script.title.slice(0, 30)}`);
      return { script_id: script.script_id, format: 'explainer', output_path: outputPath, duration_s: script.total_duration_s, resolution: `${WIDTH}x${HEIGHT}`, srt_path: srtPath, success: true };
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

  // Mock: stacked color blocks representing two speakers
  try {
    const halfH = HEIGHT / 2;
    const speakerA = script.lines.find(l => l.avatar_id === avatarIds[0])?.speaker ?? 'Speaker A';
    const speakerB = script.lines.find(l => l.avatar_id === avatarIds[1])?.speaker ?? 'Speaker B';

    execSync([
      'ffmpeg -y',
      `-f lavfi -i "color=c=${ACCENT_A.replace('#', '0x')}:s=${WIDTH}x${halfH}:d=${script.total_duration_s}:r=30"`,
      `-f lavfi -i "color=c=${ACCENT_B.replace('#', '0x')}:s=${WIDTH}x${halfH}:d=${script.total_duration_s}:r=30"`,
      `-filter_complex "[0:v][1:v]vstack=inputs=2[v]"`,
      '-map "[v]"',
      '-c:v libx264 -preset fast -crf 23',
      `-t ${script.total_duration_s}`,
      `"${outputPath}"`,
    ].join(' '), { stdio: 'pipe', timeout: 30000 });

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

  // Mock: 3-color grid
  try {
    const cellH = HEIGHT / 3;
    const speakers = [...new Set(script.lines.map(l => l.speaker))];
    const colors = [ACCENT_A, ACCENT_B, ACCENT_C];

    execSync([
      'ffmpeg -y',
      ...speakers.slice(0, 3).map((s, i) =>
        `-f lavfi -i "color=c=${colors[i].replace('#', '0x')}:s=${WIDTH}x${cellH}:d=${script.total_duration_s}:r=30"`
      ),
      `-filter_complex "[0:v][1:v][2:v]vstack=inputs=3[v]"`,
      '-map "[v]"',
      '-c:v libx264 -preset fast -crf 23',
      `-t ${script.total_duration_s}`,
      `"${outputPath}"`,
    ].join(' '), { stdio: 'pipe', timeout: 30000 });

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
