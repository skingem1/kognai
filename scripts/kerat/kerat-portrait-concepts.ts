/**
 * TICKET-031-C: Scorsese generates 3 Ker@ portrait concepts
 *
 * Calls qwen3:14b (Ollama) to produce 3 distinct portrait concept descriptions
 * for Ker@ (SCS-005), each formatted as a Stable Diffusion / ComfyUI prompt.
 * Ships the results to Godman's Telegram channel for portrait selection.
 *
 * Usage:
 *   cd ~/kognai && ts-node scripts/kerat/kerat-portrait-concepts.ts
 */

import * as https from 'https';
import * as http from 'http';
import { config as dotenvConfig } from 'dotenv';
import { join } from 'path';
import { writeFileSync } from 'fs';

dotenvConfig({ path: join(__dirname, '..', '..', '.env') });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const OWNER_ID = process.env.OWNER_TELEGRAM_CHAT_ID!;
// Normalise OLLAMA_HOST — add http:// if no protocol present
const rawOllamaHost = process.env.OLLAMA_HOST || 'localhost:11434';
const OLLAMA_HOST = rawOllamaHost.startsWith('http') ? rawOllamaHost : `http://${rawOllamaHost}`;
const MODEL = 'qwen3:4b';  // T1 tier — faster under resource contention; 14b too slow with MPS inference running

if (!BOT_TOKEN || !OWNER_ID) {
  process.stderr.write('[kerat-portrait-concepts] TELEGRAM_BOT_TOKEN or OWNER_TELEGRAM_CHAT_ID not set\n');
  process.exit(1);
}

// ─── Ollama call ─────────────────────────────────────────────────────────────

async function callOllama(prompt: string): Promise<string> {
  const body = JSON.stringify({
    model: MODEL,
    prompt,
    stream: false,
    options: { temperature: 0.85, top_p: 0.9, num_predict: 1800 },
    think: false,
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`${OLLAMA_HOST}/api/generate`);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.response ?? '');
          } catch (e) {
            reject(new Error(`Ollama parse error: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Telegram send ────────────────────────────────────────────────────────────

function sendTelegram(chatId: string, text: string): Promise<void> {
  // Escape for MarkdownV2
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');

  const payload = JSON.stringify({
    chat_id: chatId,
    text: escaped,
    parse_mode: 'MarkdownV2',
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (!parsed.ok) {
              reject(new Error(`Telegram error: ${parsed.description ?? JSON.stringify(parsed)}`));
            } else {
              resolve();
            }
          } catch (e) {
            reject(new Error(`Telegram parse error: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function sendTelegramPlain(chatId: string, text: string): Promise<void> {
  const payload = JSON.stringify({ chat_id: chatId, text });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => {
          const parsed = JSON.parse(data);
          parsed.ok ? resolve() : reject(new Error(parsed.description ?? JSON.stringify(parsed)));
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Core ─────────────────────────────────────────────────────────────────────

const SYSTEM_CONTEXT = `
You are Scorsese, the creative director of Kognai's SCS-001 pipeline.
Your task is to design the visual identity for Ker@ — Kognai's SCS-005 autonomous signal channel.

Ker@ persona:
- Sharp, sovereign, technically grounded AI signal channel
- Voice: concise, conviction-first, zero filler
- Audience: crypto-native, AI builders, agent economy early adopters
- Aesthetic: futuristic but understated. Signal over noise.
- NOT: a generic anime girl, NOT a corporate headshot, NOT sci-fi generic

You must produce exactly 3 portrait concept descriptions for Ker@.
Each concept must:
1. Define a distinct visual personality and aesthetic direction
2. Include a Stable Diffusion / ComfyUI positive prompt (under 120 tokens)
3. Include a negative prompt to avoid common AI portrait artifacts
4. Have a short concept name (2-4 words, e.g. "Neural Oracle", "Dark Signal", "Sovereign Interface")
5. State the mood/vibe in one sentence

The three concepts should offer genuinely different directions — not variations of the same idea.

Respond with valid JSON only. No markdown fences. No explanation text.

JSON format:
{
  "concepts": [
    {
      "name": "Concept name",
      "mood": "One-sentence mood description",
      "positive_prompt": "...",
      "negative_prompt": "..."
    },
    ...
  ]
}
`.trim();

const USER_PROMPT = `Generate 3 distinct Ker@ portrait concepts for Kognai's SCS-005 signal channel. JSON only.`;

interface Concept {
  name: string;
  mood: string;
  positive_prompt: string;
  negative_prompt: string;
}

interface ConceptsResult {
  concepts: Concept[];
}

async function main() {
  process.stdout.write('[kerat-portrait-concepts] Calling qwen3:14b for 3 Ker@ portrait concepts...\n');

  const fullPrompt = `${SYSTEM_CONTEXT}\n\n${USER_PROMPT}`;
  const raw = await callOllama(fullPrompt);

  process.stdout.write(`[kerat-portrait-concepts] Raw LLM output:\n${raw}\n`);

  // Parse JSON — strip any accidental fences
  let jsonStr = raw.trim();
  jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');

  let result: ConceptsResult;
  try {
    result = JSON.parse(jsonStr) as ConceptsResult;
  } catch (e) {
    process.stderr.write(`[kerat-portrait-concepts] JSON parse failed. Raw:\n${raw}\n`);
    throw e;
  }

  if (!result.concepts || result.concepts.length < 3) {
    throw new Error(`Expected 3 concepts, got ${result.concepts?.length ?? 0}`);
  }

  // Save to workspace
  const outPath = join(__dirname, '..', '..', 'workspace', 'kerat', 'portrait-concepts.json');
  writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  process.stdout.write(`[kerat-portrait-concepts] Saved to ${outPath}\n`);

  // Build Telegram message
  const lines: string[] = [
    '🎨 TICKET-031-C: 3 Ker@ Portrait Concepts',
    'Godman — pick one. Reply with A, B, or C.',
    '',
  ];

  const labels = ['A', 'B', 'C'];
  for (let i = 0; i < 3; i++) {
    const c = result.concepts[i];
    lines.push(`— CONCEPT ${labels[i]}: ${c.name}`);
    lines.push(`Mood: ${c.mood}`);
    lines.push(`SD prompt: ${c.positive_prompt}`);
    lines.push(`Neg: ${c.negative_prompt}`);
    lines.push('');
  }

  lines.push('Reply A / B / C → TICKET-031-D: generate chosen portrait via ComfyUI SD');

  const msg = lines.join('\n');

  process.stdout.write(`[kerat-portrait-concepts] Sending to Telegram...\n${msg}\n`);

  try {
    await sendTelegramPlain(OWNER_ID, msg);
    process.stdout.write('[kerat-portrait-concepts] ✅ Sent to Godman Telegram\n');
  } catch (err: any) {
    process.stderr.write(`[kerat-portrait-concepts] Telegram send failed: ${err.message}\n`);
    throw err;
  }
}

main().catch((err) => {
  process.stderr.write(`[kerat-portrait-concepts] FATAL: ${err.message}\n`);
  process.exit(1);
});
