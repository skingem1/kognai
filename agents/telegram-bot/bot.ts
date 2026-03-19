// Telegram Bot API client — Phase 1 TikTok Content Agent
// Long-polling, stateless HTTP. No third-party Telegram SDK.

import * as https from 'https';
import * as http  from 'http';
import * as fs    from 'fs';
import * as path  from 'path';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name: string; username?: string; is_bot: boolean };
    chat:  { id: number; type: string };
    text?: string;
    date:  number;
  };
}

export interface SendMessageOptions {
  parse_mode?:              'Markdown' | 'HTML';
  disable_web_page_preview?: boolean;
  reply_markup?:            unknown;
}

// ── HTTP helper ──────────────────────────────────────────────────────────────

function apiRequest(method: string, body: Record<string, unknown>): Promise<unknown> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path:     `/bot${BOT_TOKEN}/${method}`,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 35_000,
      },
      (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({ ok: false, description: data.slice(0, 200) }); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Telegram API timeout')); });
    req.write(payload);
    req.end();
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function getUpdates(offset: number, timeoutSec = 30): Promise<TelegramUpdate[]> {
  const res = await apiRequest('getUpdates', {
    timeout:         timeoutSec,
    offset,
    allowed_updates: ['message'],
  }) as { ok: boolean; result?: TelegramUpdate[] };
  return res.ok ? (res.result ?? []) : [];
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  opts: SendMessageOptions = {}
): Promise<void> {
  await apiRequest('sendMessage', {
    chat_id:                  chatId,
    text,
    parse_mode:               opts.parse_mode ?? 'Markdown',
    disable_web_page_preview: opts.disable_web_page_preview ?? false,
    ...(opts.reply_markup ? { reply_markup: opts.reply_markup } : {}),
  });
}

export async function sendPhoto(
  chatId: number | string,
  photoUrl: string,
  caption?: string
): Promise<void> {
  await apiRequest('sendPhoto', {
    chat_id:    chatId,
    photo:      photoUrl,
    ...(caption ? { caption, parse_mode: 'Markdown' } : {}),
  });
}

export async function getMe(): Promise<{ ok: boolean; result?: { username: string } }> {
  return apiRequest('getMe', {}) as Promise<{ ok: boolean; result?: { username: string } }>;
}

// ── Video upload (multipart/form-data) ────────────────────────────────────────

export async function sendVideo(
  chatId: number | string,
  videoPath: string,
  caption?: string
): Promise<void> {
  const boundary = '----TgBotBoundary' + Date.now().toString(16);
  const filename  = path.basename(videoPath);
  const fileData  = fs.readFileSync(videoPath);

  const parts: Buffer[] = [];
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`
  ));
  if (caption) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`
    ));
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n`
    ));
  }
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${filename}"\r\nContent-Type: video/mp4\r\n\r\n`
  ));
  parts.push(fileData);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path:     `/bot${BOT_TOKEN}/sendVideo`,
        method:   'POST',
        headers:  {
          'Content-Type':   `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
        timeout: 180_000,
      },
      (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data) as { ok: boolean; description?: string };
            if (!parsed.ok) reject(new Error(`sendVideo failed: ${parsed.description ?? data.slice(0, 200)}`));
            else resolve();
          } catch {
            reject(new Error(`sendVideo parse error: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('sendVideo timeout (180s)')); });
    req.write(body);
    req.end();
  });
}
