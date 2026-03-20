/**
 * Telegram API helpers — shared by all command modules.
 * Extracted from telegram-bot.ts (Sprint 496).
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

export const ROOT = path.resolve(__dirname, '../..');
export const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.CEO_TELEGRAM_BOT_TOKEN || '';
export const OWNER_CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID || '';
export const AUDIT_LOG = path.join(ROOT, 'audit.log');

export function telegramRequest(method: string, body: Record<string, unknown>): Promise<any> {
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

export async function getUpdates(offset: number): Promise<any[]> {
  const result = await telegramRequest('getUpdates', { offset, timeout: 30 });
  return Array.isArray(result?.result) ? result.result : [];
}

export async function sendMessage(chatId: string, text: string): Promise<void> {
  await telegramRequest('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' });
}

export async function sendMessageWithButtons(chatId: string, text: string, buttons: Array<Array<{ text: string; callback_data: string }>>): Promise<void> {
  await telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons },
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await telegramRequest('answerCallbackQuery', { callback_query_id: callbackQueryId, text: text ?? '' });
}

export function sendVideoFile(chatId: string, videoPath: string, caption?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const boundary = '----TgBotBoundary' + Date.now();
    const fileName = path.basename(videoPath);
    const videoData = fs.readFileSync(videoPath);

    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
    if (caption) {
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n`;
    }
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="video"; filename="${fileName}"\r\n`;
    body += `Content-Type: video/mp4\r\n\r\n`;

    const ending = `\r\n--${boundary}--\r\n`;
    const bodyStart = Buffer.from(body, 'utf-8');
    const bodyEnd = Buffer.from(ending, 'utf-8');
    const fullBody = Buffer.concat([bodyStart, videoData, bodyEnd]);

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendVideo`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c.toString()));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) resolve();
          else reject(new Error(`Telegram sendVideo: ${parsed.description ?? data.slice(0, 200)}`));
        } catch { reject(new Error(`Telegram parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Video upload timeout')); });
    req.write(fullBody);
    req.end();
  });
}

export function sendVideoWithButtons(chatId: string, videoPath: string, caption: string, buttons: Array<Array<{ text: string; callback_data: string }>>): Promise<void> {
  return new Promise((resolve, reject) => {
    const boundary = '----TgBotBoundary' + Date.now();
    const fileName = path.basename(videoPath);
    const videoData = fs.readFileSync(videoPath);
    const replyMarkup = JSON.stringify({ inline_keyboard: buttons });

    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n`;
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="reply_markup"\r\n\r\n${replyMarkup}\r\n`;
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="video"; filename="${fileName}"\r\n`;
    body += `Content-Type: video/mp4\r\n\r\n`;

    const ending = `\r\n--${boundary}--\r\n`;
    const bodyStart = Buffer.from(body, 'utf-8');
    const bodyEnd = Buffer.from(ending, 'utf-8');
    const fullBody = Buffer.concat([bodyStart, videoData, bodyEnd]);

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendVideo`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c.toString()));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) resolve();
          else reject(new Error(`Telegram sendVideo: ${parsed.description ?? data.slice(0, 200)}`));
        } catch { reject(new Error(`Telegram parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Video upload timeout')); });
    req.write(fullBody);
    req.end();
  });
}
