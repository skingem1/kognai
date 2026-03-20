// Achiri Telegram Bot — Sprint 352
// User-facing chat interface for Achiri alpha launch.
// Bridges Telegram messages → AchiriConversationHandler.chat() → Telegram reply.
// Separate from operator bot (scripts/telegram-bot.ts).
// Env: ACHIRI_TELEGRAM_BOT_TOKEN (required), ACHIRI_ALLOWED_CHAT_IDS (optional CSV whitelist)

import * as fs from 'fs';
import * as path from 'path';
import { AchiriConversationHandler, ACHIRI_LIMIT_EXCEEDED } from './index';
import { AchiriMemoryStore } from './memory-store';

const BOT_TOKEN = process.env.ACHIRI_TELEGRAM_BOT_TOKEN || '';
if (!BOT_TOKEN) {
  console.error('[Achiri-TG] ACHIRI_TELEGRAM_BOT_TOKEN not set');
  process.exit(0);
}

const ALLOWED_IDS = (process.env.ACHIRI_ALLOWED_CHAT_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const WAITLIST_PATH = path.join(__dirname, '..', '..', 'workspace', 'achiri', 'waitlist.jsonl');
const OFFSET_PATH = path.join(__dirname, '..', '..', 'data', 'achiri-bot-offset.txt');

// --- Telegram API helpers ---

const TG_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function tgApi(method: string, body?: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${TG_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`TG API ${method} failed: ${res.status}`);
  const data = await res.json() as { ok: boolean; result: any };
  if (!data.ok) throw new Error(`TG API ${method} error`);
  return data.result;
}

async function sendMessage(chatId: string, text: string): Promise<void> {
  // Telegram max 4096 chars per message
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 4000));
    remaining = remaining.slice(4000);
  }
  for (const chunk of chunks) {
    await tgApi('sendMessage', { chat_id: chatId, text: chunk, parse_mode: 'Markdown' })
      .catch(() => tgApi('sendMessage', { chat_id: chatId, text: chunk })); // fallback without Markdown
  }
}

async function getUpdates(offset: number): Promise<any[]> {
  const data = await tgApi('getUpdates', { offset, timeout: 30 });
  return data as any[];
}

// --- Offset persistence ---

function loadOffset(): number {
  try { return parseInt(fs.readFileSync(OFFSET_PATH, 'utf-8').trim(), 10) || 0; } catch { return 0; }
}

function saveOffset(offset: number): void {
  const dir = path.dirname(OFFSET_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OFFSET_PATH, String(offset), 'utf-8');
}

// --- Waitlist management ---

function isOnWaitlist(chatId: string): boolean {
  if (!fs.existsSync(WAITLIST_PATH)) return false;
  const lines = fs.readFileSync(WAITLIST_PATH, 'utf-8').split('\n').filter(l => l.trim());
  return lines.some(l => { try { return JSON.parse(l).chatId === chatId; } catch { return false; } });
}

function addToWaitlist(chatId: string, firstName: string, username: string): void {
  const entry = { chatId, firstName, username, joinedAt: new Date().toISOString() };
  fs.appendFileSync(WAITLIST_PATH, JSON.stringify(entry) + '\n', 'utf-8');
}

// --- Access control ---

function hasAccess(chatId: string): boolean {
  // If no whitelist configured, allow all (open alpha)
  if (ALLOWED_IDS.length === 0) return true;
  return ALLOWED_IDS.includes(chatId);
}

// --- Handler cache ---

const handlers = new Map<string, AchiriConversationHandler>();

function getHandler(chatId: string): AchiriConversationHandler {
  if (!handlers.has(chatId)) {
    // Default: free tier. Premium tiers require upgrade via /upgrade.
    handlers.set(chatId, new AchiriConversationHandler('free', chatId));
    // Evict oldest if cache too large
    if (handlers.size > 200) {
      const oldest = handlers.keys().next().value;
      if (oldest) handlers.delete(oldest);
    }
  }
  return handlers.get(chatId)!;
}

// --- Command handling ---

async function handleStart(chatId: string, firstName: string, username: string): Promise<void> {
  if (!isOnWaitlist(chatId)) {
    addToWaitlist(chatId, firstName, username);
  }
  await sendMessage(chatId,
    `مرحبا ${firstName}! 🇹🇳\n\n` +
    `أنا *Achiri* — رفيقك الذكي، مصنوع لتونس.\n` +
    `I'm Achiri — your AI companion, made for Tunisia.\n\n` +
    `أحكيلي شنوة تحب — بالدارجة، بالفرنسوية، ولا بالإنقليزية.\n` +
    `Talk to me in Darija, French, or English — whatever feels natural.\n\n` +
    `ابدأ بإنك تقولي أي حاجة! 💬`
  );
}

async function handleHelp(chatId: string): Promise<void> {
  await sendMessage(chatId,
    `*Achiri Commands*\n\n` +
    `/start — Welcome message\n` +
    `/help — This message\n` +
    `/clear — Clear conversation history\n` +
    `/lang — Switch language preference\n\n` +
    `Or just send me a message and we'll chat! 💬`
  );
}

async function handleClear(chatId: string): Promise<void> {
  const handler = getHandler(chatId);
  handler.clearMemory(chatId);
  handlers.delete(chatId); // fresh handler next time
  await sendMessage(chatId, '🗑️ Conversation history cleared. Bnédi min jdid! (Fresh start!)');
}

// --- Main message handler ---

async function handleMessage(chatId: string, text: string, firstName: string, username: string): Promise<void> {
  // Commands
  if (text === '/start') return handleStart(chatId, firstName, username);
  if (text === '/help') return handleHelp(chatId);
  if (text === '/clear') return handleClear(chatId);

  // Access check
  if (!hasAccess(chatId)) {
    if (!isOnWaitlist(chatId)) addToWaitlist(chatId, firstName, username);
    await sendMessage(chatId,
      `🔒 Achiri is currently in *alpha* — access is limited.\n` +
      `You've been added to the waitlist! We'll notify you when you're in.\n\n` +
      `_Achiri fi alpha tawa. Dkhalt fil waitlist!_`
    );
    return;
  }

  // Chat with Achiri
  try {
    // Show "typing" indicator
    tgApi('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});

    const handler = getHandler(chatId);
    const reply = await handler.chat(text);

    // Check for limit exceeded
    if (reply.startsWith(ACHIRI_LIMIT_EXCEEDED)) {
      const msg = reply.slice(ACHIRI_LIMIT_EXCEEDED.length).trim();
      await sendMessage(chatId, `⏳ ${msg}`);
      return;
    }

    await sendMessage(chatId, reply);
  } catch (err: any) {
    console.error(`[Achiri-TG] Error for ${chatId}: ${err.message}`);
    await sendMessage(chatId,
      `⚠️ Mawjoud un problème technique. 3awed b3d chwaya!\n` +
      `_(Technical issue — try again in a moment)_`
    );
  }
}

// --- Polling loop ---

async function poll(): Promise<void> {
  let offset = loadOffset();
  let backoffMs = 1000;

  console.log(`[Achiri-TG] Starting — polling (offset: ${offset})`);
  if (ALLOWED_IDS.length > 0) {
    console.log(`[Achiri-TG] Whitelist mode: ${ALLOWED_IDS.length} allowed IDs`);
  } else {
    console.log(`[Achiri-TG] Open alpha mode — all users allowed`);
  }

  while (true) {
    try {
      const updates = await getUpdates(offset);

      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        const msg = update.message;
        if (!msg || !msg.text) continue;

        const chatId = String(msg.chat.id);
        const text = msg.text.trim();
        const firstName = msg.from?.first_name ?? 'friend';
        const username = msg.from?.username ?? '';

        await handleMessage(chatId, text, firstName, username).catch((e: Error) => {
          console.error(`[Achiri-TG] Handler error: ${e.message}`);
        });
      }

      if (updates.length > 0) saveOffset(offset);
      backoffMs = 1000;
    } catch (e: any) {
      console.error(`[Achiri-TG] Poll error: ${e.message}`);
      await new Promise(r => setTimeout(r, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 60000);
    }
  }
}

poll().catch(err => {
  console.error('[Achiri-TG] Fatal:', err);
  process.exit(1);
});
