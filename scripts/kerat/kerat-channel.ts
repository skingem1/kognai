/**
 * kerat-channel.ts — Ker@ Telegram Channel Publisher
 * TICKET-031-A · SCS-005 · 2026-03-30
 *
 * Posts text, videos, and images to the @keratkognai Telegram channel
 * using the @kerattbot token.
 *
 * Environment:
 *   KERAT_TELEGRAM_BOT_TOKEN  — @kerattbot token
 *   KERAT_TELEGRAM_CHANNEL    — @keratkognai (channel username or -100id)
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as FormData from 'form-data';

try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch {}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BOT_TOKEN   = process.env.KERAT_TELEGRAM_BOT_TOKEN;
const CHANNEL_ID  = process.env.KERAT_TELEGRAM_CHANNEL || '@keratkognai';

if (!BOT_TOKEN) {
  throw new Error('KERAT_TELEGRAM_BOT_TOKEN is not set in .env');
}

const TG_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function tgRequest(method: string, body: Record<string, unknown>): Promise<any> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let data = '';
      res.on('data', (c: string) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ ok: false, error: data.slice(0, 200) }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(35000, () => { req.destroy(); reject(new Error('Telegram timeout')); });
    req.write(payload);
    req.end();
  });
}

function tgUpload(method: string, filePath: string, fieldName: string, extraFields: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const form = new (require('form-data'))();
    form.append(fieldName, fs.createReadStream(filePath));
    for (const [k, v] of Object.entries(extraFields)) form.append(k, v);

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: form.getHeaders(),
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c: string) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ ok: false, error: data.slice(0, 200) }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Telegram upload timeout')); });
    form.pipe(req);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Post a text message to @keratkognai channel.
 */
export async function postText(text: string, parseMode: 'Markdown' | 'HTML' | '' = 'Markdown'): Promise<{ message_id: number }> {
  const payload: Record<string, unknown> = { chat_id: CHANNEL_ID, text };
  if (parseMode) payload.parse_mode = parseMode;

  const result = await tgRequest('sendMessage', payload);
  if (!result.ok) throw new Error(`Telegram sendMessage failed: ${JSON.stringify(result)}`);
  return { message_id: result.result.message_id };
}

/**
 * Post a video file to @keratkognai channel.
 * @param videoPath  Absolute path to .mp4 file
 * @param caption    Optional caption (max 1024 chars)
 */
export async function postVideo(videoPath: string, caption?: string): Promise<{ message_id: number }> {
  if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);

  const extraFields: Record<string, string> = { chat_id: CHANNEL_ID };
  if (caption) {
    extraFields.caption = caption.slice(0, 1024);
    extraFields.parse_mode = 'Markdown';
  }

  const result = await tgUpload('sendVideo', videoPath, 'video', extraFields);
  if (!result.ok) throw new Error(`Telegram sendVideo failed: ${JSON.stringify(result)}`);
  return { message_id: result.result.message_id };
}

/**
 * Post a photo file to @keratkognai channel.
 * @param imagePath  Absolute path to image file
 * @param caption    Optional caption
 */
export async function postPhoto(imagePath: string, caption?: string): Promise<{ message_id: number }> {
  if (!fs.existsSync(imagePath)) throw new Error(`Image not found: ${imagePath}`);

  const extraFields: Record<string, string> = { chat_id: CHANNEL_ID };
  if (caption) {
    extraFields.caption = caption.slice(0, 1024);
    extraFields.parse_mode = 'Markdown';
  }

  const result = await tgUpload('sendPhoto', imagePath, 'photo', extraFields);
  if (!result.ok) throw new Error(`Telegram sendPhoto failed: ${JSON.stringify(result)}`);
  return { message_id: result.result.message_id };
}

/**
 * Quick channel health check — verifies bot can reach the channel.
 */
export async function channelHealthCheck(): Promise<{ ok: boolean; channel: string; bot?: string }> {
  try {
    const me = await tgRequest('getMe', {});
    if (!me.ok) return { ok: false, channel: CHANNEL_ID };

    // Try sending a test request to getChat
    const chat = await tgRequest('getChat', { chat_id: CHANNEL_ID });
    return {
      ok: chat.ok,
      channel: CHANNEL_ID,
      bot: `@${me.result.username}`,
    };
  } catch (err: any) {
    return { ok: false, channel: CHANNEL_ID };
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function cli(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  try {
    switch (cmd) {
      case '--check': {
        console.log('Checking Ker@ channel health...');
        const health = await channelHealthCheck();
        console.log(`  Channel: ${health.channel}`);
        console.log(`  Bot:     ${health.bot ?? 'unknown'}`);
        console.log(`  Status:  ${health.ok ? '✅ OK' : '❌ FAILED'}`);
        break;
      }
      case '--text': {
        const text = args[1];
        if (!text) { console.error('Usage: --text "message"'); process.exit(1); }
        console.log('Posting text to @keratkognai...');
        const r = await postText(text);
        console.log(`✅ Posted — message_id: ${r.message_id}`);
        break;
      }
      case '--video': {
        const videoPath = args[1];
        const caption = args[2] || '';
        if (!videoPath) { console.error('Usage: --video /path/to/video.mp4 [caption]'); process.exit(1); }
        console.log(`Uploading video to @keratkognai: ${path.basename(videoPath)}`);
        const r = await postVideo(videoPath, caption || undefined);
        console.log(`✅ Posted — message_id: ${r.message_id}`);
        break;
      }
      default:
        console.log(`
kerat-channel.ts — Ker@ Telegram Channel Publisher

Usage:
  ts-node scripts/kerat/kerat-channel.ts --check
  ts-node scripts/kerat/kerat-channel.ts --text "message"
  ts-node scripts/kerat/kerat-channel.ts --video /path/to/video.mp4 [caption]

Channel: ${CHANNEL_ID}
        `);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) cli();
