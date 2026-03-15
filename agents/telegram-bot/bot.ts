// Telegram Bot API client — Phase 1 TikTok Content Agent
// Long-polling, stateless HTTP. No third-party Telegram SDK.

import * as https from 'https';
import * as http from 'http';

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
