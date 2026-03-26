/**
 * verify-bot-token.ts — Sprint 1458
 * Live connection test for the Achiri Telegram bot.
 * Calls Telegram getMe endpoint with ACHIRI_TELEGRAM_BOT_TOKEN.
 *
 * Usage: npx ts-node scripts/achiri/verify-bot-token.ts
 *
 * Exit codes:
 *   0 — bot connected, token valid
 *   1 — token missing, invalid, or request failed
 */

import * as https from 'https';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const token = process.env.ACHIRI_TELEGRAM_BOT_TOKEN || '';

if (!token) {
  console.error('[verify-bot-token] ACHIRI_TELEGRAM_BOT_TOKEN not set');
  process.exit(1);
}

function getMeRequest(): Promise<{ ok: boolean; result?: { id: number; username?: string; first_name: string } }> {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${token}/getMe`;
    https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error(`JSON parse error: ${body.slice(0, 100)}`)); }
      });
    }).on('error', reject);
  });
}

async function main(): Promise<void> {
  try {
    const data = await getMeRequest();
    if (!data.ok || !data.result) {
      console.error(`[verify-bot-token] Telegram returned ok=false`);
      process.exit(1);
    }
    const bot = data.result;
    console.log(`[verify-bot-token] ✅ Connected`);
    console.log(`  Bot ID:       ${bot.id}`);
    console.log(`  Bot name:     ${bot.first_name}`);
    console.log(`  Username:     @${bot.username || '(none)'}`);
    process.exit(0);
  } catch (err: any) {
    console.error(`[verify-bot-token] ❌ Request failed: ${err.message}`);
    process.exit(1);
  }
}

main();
