#!/usr/bin/env ts-node
/**
 * Spielberg — Batch Demo Runner
 * Sprint 989
 *
 * Runs all demo scripts in workspace/spielberg-scripts/ in sequence.
 * Produces a manifest of results at workspace/scs001/code-demo-runs/batch-manifest.json.
 *
 * Usage:
 *   npx ts-node scripts/spielberg/batch-run.ts [--dry-run] [--only pact-demo signal-demo]
 *
 * Options:
 *   --dry-run         Validate scripts without recording
 *   --only <ids...>   Only run demos with matching IDs
 *   --dir <path>      Demo scripts directory (default: workspace/spielberg-scripts)
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, resolve } from 'path';
import type { DemoScript } from './types';

const REPO_ROOT = resolve(__dirname, '../..');
const DEFAULT_SCRIPTS_DIR = resolve(REPO_ROOT, 'workspace/spielberg-scripts');
const OUTPUT_BASE = resolve(REPO_ROOT, 'workspace/scs001/code-demo-runs');
const MANIFEST_PATH = resolve(OUTPUT_BASE, 'batch-manifest.json');

interface BatchResult {
  scriptId: string;
  scriptPath: string;
  status: 'success' | 'skipped' | 'failed';
  mp4Path?: string;
  durationSec?: number;
  error?: string;
}

interface BatchManifest {
  runAt: string;
  dryRun: boolean;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  results: BatchResult[];
}

function log(msg: string) { console.log(`[batch] ${msg}`); }

function loadScript(path: string): DemoScript | null {
  try {
    const s = JSON.parse(readFileSync(path, 'utf-8')) as DemoScript;
    if (!s.id || !s.scenes?.length) throw new Error('Missing id or scenes');
    return s;
  } catch (e) {
    return null;
  }
}

function runDemo(scriptPath: string, dryRun: boolean): BatchResult {
  const script = loadScript(scriptPath);
  if (!script) {
    return { scriptId: basename(scriptPath), scriptPath, status: 'failed', error: 'Invalid JSON or missing fields' };
  }

  if (dryRun) {
    log(`  [dry-run] ${script.id} — ${script.scenes.length} scenes — OK`);
    return { scriptId: script.id, scriptPath, status: 'skipped' };
  }

  const t0 = Date.now();
  try {
    const out = execSync(
      `npx ts-node "${resolve(__dirname, 'index.ts')}" "${scriptPath}"`,
      { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 300_000 }
    );
    // Sprint 1214: index.ts pretty-prints JSON (multi-line), so filtering lines starting with '{' and
    // joining produces invalid JSON when nested objects are present. Instead, find the last top-level
    // JSON object in the output (everything after the last '\n{' boundary).
    const jsonStart = out.lastIndexOf('\n{');
    const jsonStr = jsonStart >= 0 ? out.slice(jsonStart + 1) : out.trim();
    const result = JSON.parse(jsonStr);
    const durationSec = (Date.now() - t0) / 1000;
    return { scriptId: script.id, scriptPath, status: result.status === 'success' ? 'success' : 'failed', mp4Path: result.mp4Path ?? undefined, durationSec, error: result.error };
  } catch (e) {
    return { scriptId: script.id, scriptPath, status: 'failed', durationSec: (Date.now() - t0) / 1000, error: String(e) };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlyIdx = args.indexOf('--only');
  const onlyIds = onlyIdx >= 0 ? args.slice(onlyIdx + 1).filter(a => !a.startsWith('--')) : [];
  const dirIdx = args.indexOf('--dir');
  const scriptsDir = dirIdx >= 0 ? resolve(args[dirIdx + 1]) : DEFAULT_SCRIPTS_DIR;

  if (!existsSync(scriptsDir)) {
    console.error(`Scripts dir not found: ${scriptsDir}`);
    process.exit(1);
  }

  const files = readdirSync(scriptsDir).filter(f => f.endsWith('.json')).sort().map(f => resolve(scriptsDir, f));
  const filtered = onlyIds.length > 0 ? files.filter(f => onlyIds.some(id => f.includes(id))) : files;

  log(`found ${filtered.length} demo scripts${dryRun ? ' [DRY RUN]' : ''}`);
  mkdirSync(OUTPUT_BASE, { recursive: true });

  const results: BatchResult[] = [];
  for (const file of filtered) {
    log(`running: ${basename(file)}`);
    results.push(runDemo(file, dryRun));
  }

  const manifest: BatchManifest = {
    runAt: new Date().toISOString(),
    dryRun,
    total: results.length,
    passed: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    results,
  };

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  log(`manifest → ${MANIFEST_PATH}`);
  log(`results: ${manifest.passed} passed, ${manifest.failed} failed, ${manifest.skipped} skipped`);
  console.log(JSON.stringify(manifest, null, 2));
  if (manifest.failed > 0) process.exit(1);
}

main().catch(e => { console.error(String(e)); process.exit(1); });
