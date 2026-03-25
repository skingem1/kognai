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
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';

const ROOT = join(__dirname, '..', '..');

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

  mkdirSync(dirname(outPath), { recursive: true });

  const models: Array<'kling' | 'ltx'> = preferredModel === 'kling'
    ? ['kling', 'ltx']
    : ['ltx', 'kling'];

  for (const model of models) {
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

      const outerCode = [
        'import subprocess, sys, json',
        `proc = subprocess.Popen([sys.executable, ${JSON.stringify(innerScript)}],`,
        '    stdout=subprocess.PIPE, stderr=subprocess.PIPE)',
        'try:',
        '    out, err = proc.communicate(timeout=85)',
        '    data = json.loads(out.decode().strip())',
        '    print(json.dumps(data))',
        'except subprocess.TimeoutExpired:',
        '    proc.kill()',
        // Sprint 1332: use timeout=5 to prevent hanging if grandchildren hold the pipe open
        '    try: proc.communicate(timeout=5)',
        '    except subprocess.TimeoutExpired: pass',
        '    raise TimeoutError("fal.ai subscribe timed out after 85s")',
        'except Exception as e:',
        '    proc.kill()',
        '    try: proc.communicate(timeout=5)',
        '    except subprocess.TimeoutExpired: pass',
        '    raise',
      ].join('\n');

      writeFileSync(innerScript, innerCode);
      writeFileSync(outerScript, outerCode);

      const result = execSync(`python3 "${outerScript}"`, {
        timeout: 120000,  // Sprint 1332: 120s safety net (35s past Python 85s kill)
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

      return { path: outPath, source: model, cost_usd: cost, duration_s: durationS };

    } catch (err: any) {
      console.warn(`  [fal.ai] ❌ ${model} failed: ${err.message?.slice(0, 200)}`);
      if (model === models[models.length - 1]) {
        throw new Error(`All fal.ai models failed. Last error: ${err.message?.slice(0, 200)}`);
      }
    }
  }

  throw new Error('fal.ai: unreachable');
}
