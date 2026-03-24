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
import type { DemoScript, RecordingResult, Scene } from './types';
import { postProduce, headlessRecord } from './post-produce';

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
  if (!script.id) throw new Error('DemoScript missing field: id');
  if (!script.scenes?.length) throw new Error('DemoScript missing field: scenes');
  return script;
}

function ensureOutputDir(scriptId: string): string {
  const dir = resolve(OUTPUT_BASE, scriptId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Scene runner ──────────────────────────────────────────────────────────────

function buildSceneRunner(script: DemoScript, outDir: string): string {
  const runnerPath = resolve(outDir, `${script.id}-runner.sh`);
  const lines: string[] = ['#!/bin/bash'];

  for (const scene of script.scenes) {
    switch (scene.type) {
      case 'comment': break;
      case 'clear':
        lines.push('clear');
        break;
      case 'pause':
        lines.push(`sleep ${(scene.durationMs / 1000).toFixed(2)}`);
        break;
      case 'output': {
        const escaped = scene.text.replace(/'/g, "'\\''");
        lines.push(`printf '%s\\n' '${escaped}'`);
        break;
      }
      case 'type': {
        const delay = (scene.keystrokeDelayMs ?? 80) / 1000;
        for (const char of scene.text) {
          lines.push(`printf '%s' '${char.replace(/'/g, "'\\''")}'`);
          lines.push(`sleep ${delay.toFixed(3)}`);
        }
        lines.push("printf '\\n'");
        lines.push('sleep 0.5');
        break;
      }
    }
  }

  writeFileSync(runnerPath, lines.join('\n') + '\n', { mode: 0o755 });
  return runnerPath;
}

// ── Pipeline stages ────────────────────────────────────────────────────────────

function record(script: DemoScript, outDir: string): string {
  const castPath = resolve(outDir, `${script.id}.cast`);
  const runnerPath = buildSceneRunner(script, outDir);
  const { cols, rows } = script.terminal;
  log(`recording → ${basename(castPath)}`);
  return headlessRecord({ runnerScript: runnerPath, castPath, cols, rows });
}

function renderGif(script: DemoScript, castPath: string, outDir: string): string {
  const gifPath = resolve(outDir, `${script.id}.gif`);
  const { cols, rows, fontSize, theme } = script.terminal;
  log(`rendering GIF → ${basename(gifPath)}`);
  execSync(
    `agg --cols ${cols} --rows ${rows} --font-size ${fontSize} --theme ${theme} "${castPath}" "${gifPath}"`,
    { cwd: REPO_ROOT, stdio: 'inherit' }
  );
  return gifPath;
}

function runPostProduce(script: DemoScript, gifPath: string, outDir: string): string {
  log(`post-producing with title/closing cards → ${script.id}.mp4`);
  return postProduce({
    contentPath: gifPath,
    outDir,
    scriptId: script.id,
    config: script.postProduction,
  });
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

  if (!args[0]) {
    console.error('Usage: npx ts-node scripts/spielberg/index.ts <demo-script.json>');
    process.exit(1);
  }

  requireTool('asciinema'); requireTool('agg'); requireTool('ffmpeg');

  const scriptPath = resolve(args[0]);
  if (!existsSync(scriptPath)) throw new Error(`Script not found: ${scriptPath}`);

  const script = loadScript(scriptPath);
  log(`loaded: ${script.id} — "${script.title}"`);
  const outDir = ensureOutputDir(script.id);
  const t0 = Date.now();

  let castPath = '';
  let gifPath: string | null = null;
  let mp4Path: string | null = null;
  let error: string | undefined;
  let status: RecordingResult['status'] = 'success';

  try { castPath = record(script, outDir); } catch (e) { error = String(e); status = 'failed'; }
  if (castPath && !error) {
    try { gifPath = renderGif(script, castPath, outDir); } catch (e) { error = String(e); status = 'partial'; }
  }
  if (gifPath && !error) {
    try { mp4Path = runPostProduce(script, gifPath, outDir); } catch (e) { error = String(e); status = 'partial'; }
  }

  const result: RecordingResult = {
    scriptId: script.id,
    castPath,
    gifPath,
    mp4Path,
    durationSec: (Date.now() - t0) / 1000,
    recordedAt: new Date().toISOString(),
    status,
    ...(error ? { error } : {}),
  };

  writeFileSync(resolve(outDir, 'meta.json'), JSON.stringify({ script, result }, null, 2));
  log(`done: ${status} (${result.durationSec.toFixed(1)}s)`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => { err(String(e)); process.exit(1); });
