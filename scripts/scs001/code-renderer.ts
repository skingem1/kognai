/**
 * code-renderer.ts — Syntax-highlighted code frame renderer
 *
 * Uses Python Pillow to render code frames with typing animation.
 * Dark terminal theme, Menlo font, line numbers, keyword coloring.
 *
 * Sprint 900
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { CodeDemoStep } from './code-demo-scriptgen';

const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const ROOT = join(__dirname, '..', '..');

/**
 * Render PNG frames showing code being typed line-by-line for one step.
 */
export function renderCodeFrames(
  step: CodeDemoStep,
  stepIndex: number,
  totalSteps: number,
  outDir: string,
  fps: number = 30,
): { frameDir: string; frameCount: number } {
  mkdirSync(outDir, { recursive: true });

  const totalFrames = step.duration_s * fps;

  // Write config JSON (avoids any escaping issues between TS and Python)
  const configPath = join(outDir, '_config.json');
  writeFileSync(configPath, JSON.stringify({
    code_lines: step.code_lines,
    language: step.language,
    step_title: step.title,
    step_idx: stepIndex,
    total_steps: totalSteps,
    highlight_lines: step.highlight_lines || [],
    out_dir: outDir,
    fps,
    duration_s: step.duration_s,
  }));

  // The Python render script lives as a separate file
  const pyPath = join(ROOT, 'scripts', 'scs001', 'code-render-frames.py');

  const result = execSync(`python3 "${pyPath}" "${configPath}"`, {
    encoding: 'utf-8',
    timeout: 120000,
  });
  console.log(`    ${result.trim()}`);

  return { frameDir: outDir, frameCount: totalFrames };
}

/**
 * Convert PNG frame directory to MP4 video.
 */
export function framesToVideo(frameDir: string, outPath: string, fps: number = 30): void {
  execSync(
    `${FFMPEG} -y -framerate ${fps} -i "${frameDir}/f_%06d.png" ` +
    `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ` +
    `-vf "scale=1080:1920" "${outPath}"`,
    { stdio: 'pipe', timeout: 60000 }
  );
}
