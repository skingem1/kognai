/**
 * fal-video-client.ts — B-roll video generation via fal.ai
 *
 * Wraps fal_client.subscribe() for Kling 2.5 Turbo and LTX-2.3.
 * Used by video-segment-generator.ts for VISUAL scenes.
 *
 * Env: FAL_KEY (from .env)
 * Cost: Kling ~$0.07/sec (~$0.35/5s), LTX ~$0.04/sec (~$0.24/6s)
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

const ROOT = join(__dirname, '..', '..');

// Sprint 1404: Persisted circuit breaker — survives process restarts
const FAL_CIRCUIT_PATH = join(ROOT, 'data', 'fal-circuit.json');
const FAL_CIRCUIT_TTL_MS = 10 * 60_000; // 10 minutes

function loadPersistedCircuit(): void {
  try {
    if (existsSync(FAL_CIRCUIT_PATH)) {
      const d = JSON.parse(readFileSync(FAL_CIRCUIT_PATH, 'utf-8'));
      const elapsed = Date.now() - new Date(d.tripped_at).getTime();
      if (elapsed < FAL_CIRCUIT_TTL_MS) {
        falConsecutiveTimeouts = FAL_CIRCUIT_THRESHOLD; // trip immediately
        console.warn(`  [fal.ai] Circuit still open from ${Math.round(elapsed / 60000)}min ago — skipping fal.ai calls`);
      } else {
        unlinkSync(FAL_CIRCUIT_PATH); // TTL expired, clear it
      }
    }
  } catch { /* skip */ }
}

function tripPersistedCircuit(): void {
  try {
    writeFileSync(FAL_CIRCUIT_PATH, JSON.stringify({ tripped_at: new Date().toISOString(), ttl_ms: FAL_CIRCUIT_TTL_MS }));
  } catch { /* skip */ }
}

function clearPersistedCircuit(): void {
  try { if (existsSync(FAL_CIRCUIT_PATH)) unlinkSync(FAL_CIRCUIT_PATH); } catch { /* skip */ }
}

// Sprint 1413: Per-call disk check — handles concurrent pipeline runs that loaded the module
// BEFORE a sibling run wrote the circuit file. loadPersistedCircuit() only runs at import time
// so a second overlapping run can't benefit from a circuit tripped after it started.
function checkDiskCircuit(): void {
  if (falConsecutiveTimeouts >= FAL_CIRCUIT_THRESHOLD) return; // already tripped in-memory
  try {
    if (existsSync(FAL_CIRCUIT_PATH)) {
      const d = JSON.parse(readFileSync(FAL_CIRCUIT_PATH, 'utf-8'));
      const elapsed = Date.now() - new Date(d.tripped_at).getTime();
      if (elapsed < FAL_CIRCUIT_TTL_MS) {
        falConsecutiveTimeouts = FAL_CIRCUIT_THRESHOLD;
        console.warn(`  [fal.ai] Circuit open (sibling tripped ${Math.round(elapsed / 60000)}min ago) — skipping fal.ai calls`);
      }
    }
  } catch { /* skip */ }
}

function loadFalKey(): string {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  try {
    const envFile = join(ROOT, '.env');
    const lines = require('fs').readFileSync(envFile, 'utf-8').split('\n');
    for (const line of lines) {
      if (line.startsWith('FAL_KEY=')) {
        const key = line.split('=').slice(1).join('=').trim();
        process.env.FAL_KEY = key;
        return key;
      }
    }
  } catch {}
  return '';
}

export interface BrollResult {
  path: string;
  source: 'kling' | 'ltx';
  cost_usd: number;
  duration_s: number;
}

// Circuit breaker: after FAL_CIRCUIT_THRESHOLD consecutive ETIMEDOUT failures,
// skip fal.ai calls immediately rather than waiting 150s each time.
// Sprint 1404: also persisted to data/fal-circuit.json so restarts don't reset it.
let falConsecutiveTimeouts = 0;
const FAL_CIRCUIT_THRESHOLD = 2;
loadPersistedCircuit(); // Sprint 1404: check disk on startup

function isTimeoutError(err: any): boolean {
  return (
    err?.code === 'ETIMEDOUT' ||
    err?.message?.includes('ETIMEDOUT') ||
    err?.message?.includes('spawnSync') ||
    err?.message?.includes('timed out')
  );
}

const MODEL_SLUGS = {
  kling: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
  ltx: 'fal-ai/ltx-2.3/text-to-video',
} as const;

/**
 * Generate a B-roll video clip via fal.ai.
 * Tries Kling first, falls back to LTX if Kling fails.
 */
export async function generateBrollVideo(
  prompt: string,
  durationS: number = 5,
  outPath: string,
  preferredModel: 'kling' | 'ltx' = 'kling',
): Promise<BrollResult> {
  const falKey = loadFalKey();
  if (!falKey) throw new Error('FAL_KEY not set in .env');

  checkDiskCircuit(); // Sprint 1413: re-check disk on each call for concurrent-run safety

  mkdirSync(dirname(outPath), { recursive: true });

  const models: Array<'kling' | 'ltx'> = preferredModel === 'kling'
    ? ['kling', 'ltx']
    : ['ltx', 'kling'];

  for (const model of models) {
    // Circuit breaker: fal.ai unreachable this run — skip immediately
    if (falConsecutiveTimeouts >= FAL_CIRCUIT_THRESHOLD) {
      throw new Error(`fal.ai circuit open after ${falConsecutiveTimeouts} consecutive timeouts — skipping`);
    }

    try {
      console.log(`  [fal.ai] Generating ${model} video: "${prompt.slice(0, 50)}..."`);

      const fullPrompt = prompt.replace(/['"]/g, '') + ' cinematic vertical 9:16, high quality, trending style';

      const args: Record<string, unknown> = {
        prompt: fullPrompt,
        aspect_ratio: '9:16',
      };

      if (model === 'kling') {
        args.duration = String(durationS >= 8 ? 10 : 5); // Kling only accepts '5' or '10'
      } else {
        args.num_frames = Math.min(Math.max(durationS * 16, 49), 161);
        args.resolution = '1080p';
      }

      // Write two Python scripts: an inner script that calls fal_client.subscribe,
      // and an outer script that spawns it via subprocess.Popen with a hard kill
      // on timeout. This is more reliable than signal.alarm(90) which can be
      // blocked by fal_client C extensions holding the GIL.
      const ts = Date.now();
      const innerScript = join('/tmp', `fal_inner_${ts}.py`);
      const outerScript = join('/tmp', `fal_outer_${ts}.py`);

      const innerCode = [
        'import fal_client, os, json',
        `os.environ["FAL_KEY"] = ${JSON.stringify(falKey)}`,
        `result = fal_client.subscribe(`,
        `    ${JSON.stringify(MODEL_SLUGS[model])},`,
        `    arguments=${JSON.stringify(args)},`,
        `)`,
        `url = result.get("video", {}).get("url", "")`,
        `print(json.dumps({"url": url}))`,
      ].join('\n');

      // Sprint 1370: use start_new_session=True + os.killpg(SIGKILL) to kill entire
      // process group (inner Python + all fal_client grandchildren). Grandchildren
      // inherited the pipe write-end so proc.communicate(timeout=5) could block even
      // after proc.kill(). Group kill closes all pipe writers instantly. Use
      // proc.wait(timeout=3) — no pipe drain needed after SIGKILL to the group.
      const outerCode = [
        'import subprocess, sys, json, os, signal',
        `proc = subprocess.Popen([sys.executable, ${JSON.stringify(innerScript)}],`,
        '    stdout=subprocess.PIPE, stderr=subprocess.PIPE,',
        '    start_new_session=True)',
        'try:',
        '    out, err = proc.communicate(timeout=85)',
        '    data = json.loads(out.decode().strip())',
        '    print(json.dumps(data))',
        'except subprocess.TimeoutExpired:',
        '    try: os.killpg(os.getpgid(proc.pid), signal.SIGKILL)',
        '    except Exception: proc.kill()',
        '    try: proc.wait(timeout=3)',
        '    except subprocess.TimeoutExpired: pass',
        '    raise TimeoutError("fal.ai subscribe timed out after 85s")',
        'except Exception as e:',
        '    try: os.killpg(os.getpgid(proc.pid), signal.SIGKILL)',
        '    except Exception: proc.kill()',
        '    try: proc.wait(timeout=3)',
        '    except subprocess.TimeoutExpired: pass',
        '    raise',
      ].join('\n');

      writeFileSync(innerScript, innerCode);
      writeFileSync(outerScript, outerCode);

      const result = execSync(`python3 "${outerScript}"`, {
        timeout: 150000,  // Sprint 1370: 150s (Python 85s+group kill+3s wait = ~88s; 62s margin)
        encoding: 'utf-8',
      });

      try { unlinkSync(innerScript); } catch {}
      try { unlinkSync(outerScript); } catch {}

      const { url } = JSON.parse(result.trim());
      if (!url) throw new Error(`${model}: no video URL in response`);

      execSync(`curl -s -L -o "${outPath}" "${url}"`, { timeout: 60000 });

      if (!existsSync(outPath)) throw new Error(`${model}: download failed`);

      const costPerSec = model === 'kling' ? 0.07 : 0.04;
      const cost = costPerSec * durationS;

      console.log(`  [fal.ai] ✅ ${model} video saved: ${outPath} (~$${cost.toFixed(2)})`);
      falConsecutiveTimeouts = 0; // reset circuit on success
      clearPersistedCircuit(); // Sprint 1404: clear disk circuit on success

      return { path: outPath, source: model, cost_usd: cost, duration_s: durationS };

    } catch (err: any) {
      if (isTimeoutError(err)) {
        falConsecutiveTimeouts++;
        console.warn(`  [fal.ai] ❌ ${model} ETIMEDOUT (consecutive: ${falConsecutiveTimeouts}/${FAL_CIRCUIT_THRESHOLD})`);
        if (falConsecutiveTimeouts >= FAL_CIRCUIT_THRESHOLD) tripPersistedCircuit(); // Sprint 1404
      } else {
        console.warn(`  [fal.ai] ❌ ${model} failed: ${err.message?.slice(0, 200)}`);
      }
      if (model === models[models.length - 1]) {
        throw new Error(`All fal.ai models failed. Last error: ${err.message?.slice(0, 200)}`);
      }
    }
  }

  throw new Error('fal.ai: unreachable');
}
