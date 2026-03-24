#!/usr/bin/env ts-node
/**
 * Spielberg — Demo Recording Orchestrator
 * Sprint 956 / Spec 545-03
 *
 * Usage:
 *   npx ts-node scripts/spielberg/index.ts <demo-script.json>
 *   npx ts-node scripts/spielberg/index.ts --verify
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, resolve } from 'path';
import type { DemoScript, DemoStep, RecordingResult } from './types.js';

const REPO_ROOT = resolve(__dirname, '../..');
const OUTPUT_BASE = resolve(REPO_ROOT, 'workspace/scs001/code-demo-runs');

function log(msg: string) { console.log(`[spielberg] ${msg}`); }
function err(msg: string) { console.error(`[spielberg:ERROR] ${msg}`); }

function requireTool(name: string): void {
  if (spawnSync('which', [name]).status !== 0)
    throw new Error(`Required tool not found: ${name}. Install: brew install ${name}`);
}

function loadScript(path: string): DemoScript {
  const script = JSON.parse(readFileSync(path, 'utf-8')) as DemoScript;
  if (!script.id) throw new Error('DemoScript missing required field: id');
  if (!script.steps?.length) throw new Error('DemoScript missing required field: steps');
  return script;
}

function ensureOutputDir(scriptId: string): string {
  const dir = resolve(OUTPUT_BASE, scriptId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Scene runner script ───────────────────────────────────────────────────────

function buildSceneRunner(script: DemoScript, outDir: string): string {
  const runnerPath = resolve(outDir, `${script.id}-runner.sh`);
  const lines: string[] = ['#!/bin/bash'];

  const term = script.terminal ?? {};
  if (term.cwd) lines.push(`cd "${term.cwd}"`);
  if (term.env) {
    for (const [k, v] of Object.entries(term.env)) lines.push(`export ${k}="${v}"`);
  }

  for (const step of script.steps) {
    const delayMs = step.typingSpeedMs ?? 50;
    const pauseMs = step.pauseAfterMs ?? 500;

    if (step.type === 'wait') {
      lines.push(`sleep ${((step.waitMs ?? 1000) / 1000).toFixed(2)}`);
    } else if (step.type === 'command' && step.command) {
      for (const char of step.command) {
        lines.push(`printf '%s' '${char.replace(/'/g, "'\\''")}'`);
        lines.push(`sleep ${(delayMs / 1000).toFixed(3)}`);
      }
      if (step.autoEnter !== false) lines.push("printf '\\n'");
      lines.push(`sleep ${(pauseMs / 1000).toFixed(2)}`);
    } else if (step.type === 'narration') {
      // narration is a post-production overlay, not a terminal action
      lines.push(`# narration: ${step.narration ?? ''}`);
    }

    for (const ke of step.keyEvents ?? []) {
      if (ke.type === 'pause') lines.push(`sleep ${(ke.durationMs / 1000).toFixed(2)}`);
    }
  }

  writeFileSync(runnerPath, lines.join('\n') + '\n', { mode: 0o755 });
  return runnerPath;
}

// ── Pipeline stages ────────────────────────────────────────────────────────────

function record(script: DemoScript, outDir: string): string {
  const castPath = resolve(outDir, `${script.id}.cast`);
  const runnerPath = buildSceneRunner(script, outDir);
  const cols = script.terminal?.cols ?? 120;
  const rows = script.terminal?.rows ?? 35;
  log(`recording → ${basename(castPath)}`);
  execSync(
    `asciinema rec --cols ${cols} --rows ${rows} --overwrite "${castPath}" -- bash "${runnerPath}"`,
    { cwd: REPO_ROOT, stdio: 'inherit' }
  );
  return castPath;
}

function renderGif(script: DemoScript, castPath: string, outDir: string): string {
  const gifPath = resolve(outDir, `${script.id}.gif`);
  const cols = script.terminal?.cols ?? 120;
  const rows = script.terminal?.rows ?? 35;
  log(`rendering GIF → ${basename(gifPath)}`);
  execSync(
    `agg --cols ${cols} --rows ${rows} --font-size 14 "${castPath}" "${gifPath}"`,
    { cwd: REPO_ROOT, stdio: 'inherit' }
  );
  return gifPath;
}

function postProduce(script: DemoScript, gifPath: string, outDir: string): string {
  const videoPath = resolve(outDir, `${script.id}.mp4`);
  const pp = script.postProduction ?? {};
  const w = pp.resolution?.width ?? 1920;
  const h = pp.resolution?.height ?? 1080;
  const fps = pp.fps ?? 30;
  const scaleFilter = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`;
  log(`post-producing MP4 → ${basename(videoPath)}`);
  execSync(
    `ffmpeg -y -i "${gifPath}" -vf "${scaleFilter}" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -r ${fps} "${videoPath}"`,
    { cwd: REPO_ROOT, stdio: 'inherit' }
  );
  return videoPath;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] === '--verify') {
    log('verifying dependencies...');
    requireTool('asciinema');
    requireTool('agg');
    requireTool('ffmpeg');
    const v = execSync('asciinema --version', { encoding: 'utf-8' }).trim();
    log(`✓ asciinema: ${v}`);
    log('✓ agg: found');
    log('✓ ffmpeg: found');
    log('All dependencies OK');
    return;
  }

  if (!args[0]) { console.error('Usage: npx ts-node scripts/spielberg/index.ts <demo-script.json>'); process.exit(1); }

  requireTool('asciinema'); requireTool('agg'); requireTool('ffmpeg');

  const scriptPath = resolve(args[0]);
  if (!existsSync(scriptPath)) throw new Error(`Script not found: ${scriptPath}`);

  const script = loadScript(scriptPath);
  log(`loaded: ${script.id} — "${script.title}"`);
  const outDir = ensureOutputDir(script.id);
  const t0 = Date.now();
  const errors: string[] = [];

  let castFile = '';
  let gifFile: string | undefined;
  let videoFile: string | undefined;

  try { castFile = record(script, outDir); } catch (e) { errors.push(`record: ${e}`); }
  if (castFile && !errors.length) {
    try { gifFile = renderGif(script, castFile, outDir); } catch (e) { errors.push(`gif: ${e}`); }
  }
  if (gifFile && !errors.length) {
    try { videoFile = postProduce(script, gifFile, outDir); } catch (e) { errors.push(`mp4: ${e}`); }
  }

  const result: RecordingResult = {
    scriptId: script.id,
    castFile,
    gifFile,
    videoFile,
    durationSec: (Date.now() - t0) / 1000,
    postProcessed: !!videoFile,
    errors,
    completedAt: new Date().toISOString(),
  };

  writeFileSync(resolve(outDir, 'meta.json'), JSON.stringify({ script, result }, null, 2));
  log(`done: ${errors.length ? 'PARTIAL/FAIL' : 'OK'} (${result.durationSec.toFixed(1)}s)`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => { err(String(e)); process.exit(1); });
