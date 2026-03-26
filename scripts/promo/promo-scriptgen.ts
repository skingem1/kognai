#!/usr/bin/env npx ts-node
/**
 * promo-scriptgen.ts — Sprint TICKET-008-PROMO-02
 *
 * Generates a 7-beat AIDA promotional script from ProductData using
 * qwen3:14b at OLLAMA_HOST (local, $0 cost).
 *
 * Usage:
 *   npx ts-node scripts/promo/promo-scriptgen.ts --job-id <id> [--tone professional|enthusiastic|conversational]
 *   npx ts-node scripts/promo/promo-scriptgen.ts --job-id <id> --dry-run
 *
 * Input:  workspace/promo-jobs/{jobId}/product.json
 * Output: workspace/promo-jobs/{jobId}/script.json
 *
 * PromoScript schema:
 *   { jobId, productName, tone, totalDuration, beats: [ { beat, text, image_index, duration_s } ] }
 *   beat values: hook | problem | solution | benefit1 | benefit2 | proof | cta
 *   image_index: null (avatar only) or integer index into product.images[]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { request } from 'http';
import { URL } from 'url';

const ROOT = join(__dirname, '..', '..');
const PROMO_JOBS_DIR = join(ROOT, 'workspace', 'promo-jobs');

const AIDA_BEATS = ['hook', 'problem', 'solution', 'benefit1', 'benefit2', 'proof', 'cta'] as const;
type Beat = typeof AIDA_BEATS[number];
type Tone = 'professional' | 'enthusiastic' | 'conversational';

export interface PromoScriptBeat {
  beat: Beat;
  text: string;
  image_index: number | null;
  duration_s: number;
}

export interface PromoScript {
  jobId: string;
  productName: string;
  tone: Tone;
  totalDuration: number;
  beats: PromoScriptBeat[];
}

const TONE_GUIDE: Record<Tone, string> = {
  professional: 'Clear, authoritative, benefit-focused. No slang. Command respect.',
  enthusiastic: 'High energy, excited, emotional appeal. Use power words like "game-changer", "transform", "finally".',
  conversational: 'Friendly, casual, relatable. Like talking to a trusted friend who found a great deal.',
};

// PROMO-05: Enhanced with hook strength + CTA clarity criteria
const BEAT_GUIDE: Record<Beat, { desc: string; duration: string; quality: string }> = {
  hook:     { desc: 'Grab attention with a BOLD CLAIM, shocking stat, or provocative question', duration: '5-7s',
              quality: 'Must start with "Did you know...", a number, a question, or a power statement. NO generic openers.' },
  problem:  { desc: 'Name the specific pain point — make viewer feel seen', duration: '5-8s',
              quality: 'Be specific about the frustration. Use "tired of...", "stop wasting...", "what if..."' },
  solution: { desc: 'Introduce product as THE answer — confident, not tentative', duration: '7-10s',
              quality: 'Use product name explicitly. "Introducing [name]..." or "[Name] is the solution."' },
  benefit1: { desc: 'Most important feature — quantify if possible (hours saved, $ saved, % better)', duration: '6-9s',
              quality: 'Use numbers: "saves 3 hours", "lasts 5x longer", "rated #1". Do not use vague adjectives alone.' },
  benefit2: { desc: 'Supporting feature that addresses a secondary concern', duration: '5-8s',
              quality: 'Complement benefit1. If benefit1 is performance, benefit2 should be convenience or value.' },
  proof:    { desc: 'Social proof: rating + review count + one specific positive claim', duration: '5-7s',
              quality: 'Format: "X stars from Y customers. [Quote or stat from reviews]."' },
  cta:      { desc: 'Clear action verb + urgency signal', duration: '4-6s',
              quality: 'Must include: action verb (Get/Order/Shop/Try) + urgency (today/now/limited/link in bio). NO "check it out".' },
};

function buildPrompt(product: Record<string, unknown>, tone: Tone): string {
  const imageCount = Array.isArray(product.images) ? product.images.length : 0;

  return `You are a promotional video scriptwriter. Generate a 7-beat AIDA script for this product.

PRODUCT:
Name: ${product.name}
Brand: ${product.brand || 'N/A'}
Price: ${product.price}
Description: ${(product.description as string || '').slice(0, 300)}
Key features: ${(product.bulletPoints as string[] || []).slice(0, 4).join(', ')}
Rating: ${product.rating || 'N/A'} (${product.reviewCount || 'N/A'})
Category: ${product.category || 'N/A'}
Available images: ${imageCount} product images (indices 0 to ${imageCount - 1})

TONE: ${tone.toUpperCase()} — ${TONE_GUIDE[tone]}

BEATS TO GENERATE:
${AIDA_BEATS.map(b => `- ${b}: ${BEAT_GUIDE[b].desc} (target ${BEAT_GUIDE[b].duration})\n  Quality rule: ${BEAT_GUIDE[b].quality}`).join('\n')}

RULES:
- Each beat must be 1-2 short sentences spoken aloud (for video voiceover)
- duration_s must be realistic for speech speed (~130 wpm)
- image_index: choose a product image index (0-${imageCount - 1}) to show during that beat, or null for avatar-only
- Use image_index=0 for hook, null for cta, and vary others across available images
- Total duration must be 45-65 seconds
- Output ONLY valid JSON. No markdown. No explanation.

OUTPUT FORMAT:
{
  "beats": [
    {"beat": "hook", "text": "...", "image_index": 0, "duration_s": 6},
    {"beat": "problem", "text": "...", "image_index": null, "duration_s": 7},
    {"beat": "solution", "text": "...", "image_index": 1, "duration_s": 8},
    {"beat": "benefit1", "text": "...", "image_index": 2, "duration_s": 7},
    {"beat": "benefit2", "text": "...", "image_index": 1, "duration_s": 6},
    {"beat": "proof", "text": "...", "image_index": 0, "duration_s": 6},
    {"beat": "cta", "text": "...", "image_index": null, "duration_s": 5}
  ]
}`;
}

function callOllama(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const model = process.env.VAULT_LOCAL_MODEL_POWER || 'qwen3:14b';

    const parsedUrl = new URL(`${ollamaHost}/api/generate`);
    const body = JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0.7, num_predict: 1024 },
    });

    const opts = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 11434,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };

    const req = request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.response || '');
        } catch (e) {
          reject(new Error(`Ollama response parse failed: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(120_000, () => { req.destroy(new Error('Ollama timeout after 120s')); });
    req.write(body);
    req.end();
  });
}

function parseBeats(raw: string): PromoScriptBeat[] {
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}') + 1;
  if (jsonStart === -1 || jsonEnd === 0) throw new Error(`No JSON found in LLM output: ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd));
  if (!Array.isArray(parsed.beats)) throw new Error('Missing beats array in LLM response');
  return parsed.beats;
}

function mockScript(jobId: string, product: Record<string, unknown>, tone: Tone): PromoScript {
  const name = product.name as string || 'Product';
  const imageCount = Math.max(3, (product.images as unknown[] || []).length);
  return {
    jobId,
    productName: name,
    tone,
    totalDuration: 49,
    beats: [
      { beat: 'hook',     text: `Tired of the same old solutions? ${name} changes everything.`, image_index: 0, duration_s: 6 },
      { beat: 'problem',  text: 'Most products promise results but deliver frustration.', image_index: null, duration_s: 7 },
      { beat: 'solution', text: `${name} is engineered to actually work.`, image_index: 1, duration_s: 8 },
      { beat: 'benefit1', text: 'Premium quality that lasts — backed by thousands of happy customers.', image_index: 2 % imageCount, duration_s: 7 },
      { beat: 'benefit2', text: 'Designed for ease of use — no setup, no hassle.', image_index: 1, duration_s: 7 },
      { beat: 'proof',    text: `Rated ${product.rating || '4.8'} stars by ${product.reviewCount || 'thousands'}.`, image_index: 0, duration_s: 7 },
      { beat: 'cta',      text: 'Order yours today — link in bio.', image_index: null, duration_s: 7 },
    ],
  };
}

async function generateScript(jobId: string, tone: Tone, dryRun: boolean): Promise<{ ok: boolean; script?: PromoScript; error?: string }> {
  const productPath = join(PROMO_JOBS_DIR, jobId, 'product.json');
  if (!existsSync(productPath)) {
    return { ok: false, error: `product.json not found: ${productPath}` };
  }

  const product = JSON.parse(readFileSync(productPath, 'utf8'));
  const imageCount = Array.isArray(product.images) ? product.images.length : 0;

  let beats: PromoScriptBeat[];

  if (dryRun) {
    const mock = mockScript(jobId, product, tone);
    const jobDir = join(PROMO_JOBS_DIR, jobId);
    mkdirSync(jobDir, { recursive: true });
    writeFileSync(join(jobDir, 'script.json'), JSON.stringify(mock, null, 2));
    return { ok: true, script: mock };
  }

  const prompt = buildPrompt(product, tone);

  try {
    const raw = await callOllama(prompt);
    beats = parseBeats(raw);
  } catch (e: any) {
    return { ok: false, error: `LLM call failed: ${e.message}` };
  }

  // Validate and clamp image_index
  const validBeats: PromoScriptBeat[] = beats.map((b) => ({
    beat: b.beat as Beat,
    text: String(b.text || '').slice(0, 300),
    image_index: (b.image_index !== null && b.image_index !== undefined && imageCount > 0)
      ? Math.min(Math.max(0, Math.floor(Number(b.image_index))), imageCount - 1)
      : null,
    duration_s: Math.min(Math.max(3, Number(b.duration_s) || 6), 20),
  }));

  const totalDuration = validBeats.reduce((s, b) => s + b.duration_s, 0);

  const script: PromoScript = {
    jobId,
    productName: product.name as string || '',
    tone,
    totalDuration,
    beats: validBeats,
  };

  const jobDir = join(PROMO_JOBS_DIR, jobId);
  mkdirSync(jobDir, { recursive: true });
  writeFileSync(join(jobDir, 'script.json'), JSON.stringify(script, null, 2));

  return { ok: true, script };
}

// CLI entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  let jobId = '';
  let tone: Tone = 'enthusiastic';
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--job-id') jobId = args[++i] || '';
    else if (args[i] === '--tone') tone = (args[++i] as Tone) || 'enthusiastic';
    else if (args[i] === '--dry-run') dryRun = true;
  }

  if (!jobId) {
    console.error('Usage: promo-scriptgen.ts --job-id <id> [--tone professional|enthusiastic|conversational] [--dry-run]');
    process.exit(1);
  }

  console.error(`Generating script: job=${jobId} tone=${tone} dry-run=${dryRun}`);
  generateScript(jobId, tone, dryRun).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }).catch((e) => {
    console.error('Fatal:', e.message);
    process.exit(1);
  });
}

export { generateScript };
