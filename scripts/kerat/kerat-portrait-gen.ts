#!/usr/bin/env ts-node
/**
 * TICKET-031-D: Generate chosen Ker@ portrait via fal.ai Flux
 *
 * Reads Godman's selection (A/B/C) from --concept flag, runs fal.ai Flux Dev
 * to generate 4 portrait variants of the chosen concept, then sends them to
 * Godman's Telegram for final avatar pick.
 *
 * Usage:
 *   cd ~/kognai && ts-node scripts/kerat/kerat-portrait-gen.ts --concept B
 *     [--num-images 4] [--model fal-ai/flux/dev]
 *
 * Pipeline:
 *   1. Read concept from workspace/kerat/portrait-concepts.json
 *   2. gen_portrait_fal.py → fal.ai Flux Dev → 4× 1024×1024 JPGs
 *   3. Send each image to Telegram with caption
 *   4. Print JSON result: paths, concept metadata
 */

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import * as https from 'https';
import * as fs from 'fs';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: join(__dirname, '..', '..', '.env') });

// ─── Config ───────────────────────────────────────────────────────────────────

const ROOT          = join(__dirname, '..', '..');
const CONCEPTS_JSON = join(ROOT, 'workspace/kerat/portrait-concepts.json');
const OUT_DIR       = join(ROOT, 'workspace/kerat/portraits');
const GEN_SCRIPT    = join(__dirname, 'gen_portrait_fal.py');
const PYTHON        = '/usr/bin/python3';

const BOT_TOKEN     = process.env.TELEGRAM_BOT_TOKEN!;
const OWNER_ID      = process.env.OWNER_TELEGRAM_CHAT_ID!;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) { process.stdout.write(`[kerat-portrait-gen] ${msg}\n`); }
function die(msg: string): never {
  process.stderr.write(`[kerat-portrait-gen] FATAL: ${msg}\n`);
  process.exit(1);
}

// ─── Telegram sendPhoto ───────────────────────────────────────────────────────

function sendPhotoTelegram(chatId: string, imagePath: string, caption: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const fileData  = fs.readFileSync(imagePath);
    const filename  = imagePath.split('/').pop() ?? 'portrait.jpg';
    const boundary  = '----KgPortraitBoundary' + Date.now().toString(16);

    const parts: Buffer[] = [];
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`));
    parts.push(fileData);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body       = Buffer.concat(parts);
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path:     `/bot${BOT_TOKEN}/sendPhoto`,
        method:   'POST',
        headers:  {
          'Content-Type':   `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            parsed.ok ? resolve() : reject(new Error(`Telegram error: ${parsed.description ?? JSON.stringify(parsed)}`));
          } catch (e) {
            reject(new Error(`Telegram parse error: ${data.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendTextTelegram(chatId: string, text: string): Promise<void> {
  const payload = JSON.stringify({ chat_id: chatId, text });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path:     `/bot${BOT_TOKEN}/sendMessage`,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => {
          const parsed = JSON.parse(data);
          parsed.ok ? resolve() : reject(new Error(parsed.description ?? JSON.stringify(parsed)));
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get  = (flag: string, def?: string) => {
    const i = args.indexOf(flag);
    return i !== -1 && i + 1 < args.length ? args[i + 1] : def;
  };
  const conceptLabel = (get('--concept') ?? 'B').toUpperCase().trim();
  const labelMap: Record<string, number> = { A: 0, B: 1, C: 2 };
  const conceptIdx   = labelMap[conceptLabel] ?? 1;
  return {
    conceptLabel,
    conceptIdx,
    numImages: parseInt(get('--num-images', '4')!, 10),
    model:     get('--model', 'fal-ai/flux/dev')!,
  };
}

async function main() {
  const cfg = parseArgs();

  if (!BOT_TOKEN || !OWNER_ID) die('TELEGRAM_BOT_TOKEN or OWNER_TELEGRAM_CHAT_ID not set');
  if (!existsSync(CONCEPTS_JSON))  die(`portrait-concepts.json not found: ${CONCEPTS_JSON}`);
  if (!existsSync(GEN_SCRIPT))     die(`gen_portrait_fal.py not found: ${GEN_SCRIPT}`);

  mkdirSync(OUT_DIR, { recursive: true });

  const falKey = process.env.FAL_KEY;
  if (!falKey) die('FAL_KEY not set in .env');

  log(`═══════════════════════════════════════`);
  log(`Ker@ Portrait Generation — TICKET-031-D`);
  log(`Concept: ${cfg.conceptLabel} (index ${cfg.conceptIdx})`);
  log(`Images:  ${cfg.numImages}  Model: ${cfg.model}`);
  log(`Out dir: ${OUT_DIR}`);
  log(`═══════════════════════════════════════`);

  // Step 1: Run Python generation script
  log(`Step 1 — Running fal.ai Flux generation...`);
  const result = spawnSync(
    PYTHON,
    [
      GEN_SCRIPT,
      '--concept',       String(cfg.conceptIdx),
      '--concepts-json', CONCEPTS_JSON,
      '--out-dir',       OUT_DIR,
      '--num-images',    String(cfg.numImages),
      '--model',         cfg.model,
    ],
    {
      encoding: 'utf8',
      timeout:  180_000,   // 3 min — fal.ai queue + generation
      env:      { ...process.env as Record<string, string>, FAL_KEY: falKey },
    },
  );

  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0 || result.error) {
    die(`gen_portrait_fal.py failed (exit ${result.status}): ${result.error?.message ?? result.stderr?.slice(0, 300) ?? ''}`);
  }

  // Parse JSON from Python stdout
  let meta: any = {};
  try {
    const jsonLine = result.stdout.trim().split('\n').find(l => l.startsWith('{'));
    meta = JSON.parse(jsonLine ?? '{}');
  } catch (e) {
    die(`JSON parse from gen_portrait_fal.py failed. stdout: ${result.stdout.slice(0, 300)}`);
  }

  const paths: string[] = meta.paths ?? [];
  if (paths.length === 0) die('No images in generation output');

  log(`Step 1 ✅  Generated ${paths.length} images for "${meta.concept_name}"`);

  // Step 2: Send summary message
  log(`Step 2 — Sending to Telegram...`);
  const headerMsg = [
    `🎨 TICKET-031-D: Ker@ Portrait Generated`,
    `Concept B — ${meta.concept_name}`,
    `Mood: ${meta.mood}`,
    ``,
    `${paths.length} variants below. Reply with the number (1-${paths.length}) of your chosen portrait.`,
    `It will be used as the Ker@ avatar for LatentSync lip-sync.`,
  ].join('\n');

  await sendTextTelegram(OWNER_ID, headerMsg);
  log(`  Header sent`);

  // Step 3: Send each portrait image
  for (let i = 0; i < paths.length; i++) {
    const imgPath = paths[i];
    if (!existsSync(imgPath)) {
      log(`  WARNING: image ${i + 1} not found at ${imgPath}, skipping`);
      continue;
    }
    const caption = `Portrait ${i + 1}/${paths.length} — ${meta.concept_name}\nModel: ${cfg.model}`;
    await sendPhotoTelegram(OWNER_ID, imgPath, caption);
    log(`  Portrait ${i + 1}/${paths.length} sent`);
  }

  log(`Step 2 ✅  All portraits sent to Telegram`);
  log(``);
  log(`✅ TICKET-031-D complete — ${paths.length} portraits sent`);
  log(`Next: Godman replies 1-${paths.length} → TICKET-031-E: set as avatar_face for lipsync`);

  // Print JSON result for programmatic callers / logging
  console.log(JSON.stringify({
    ok: true,
    ticket: 'TICKET-031-D',
    concept_label: cfg.conceptLabel,
    concept_name:  meta.concept_name,
    paths,
    model: cfg.model,
    positive_prompt: meta.positive_prompt,
  }));
}

main().catch((err) => {
  process.stderr.write(`[kerat-portrait-gen] FATAL: ${err.message}\n`);
  process.exit(1);
});
