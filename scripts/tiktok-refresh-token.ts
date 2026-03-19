/**
 * tiktok-refresh-token.ts — Refresh TikTok access token before expiry
 *
 * Usage:
 *   npx ts-node scripts/tiktok-refresh-token.ts
 *
 * Reads TIKTOK_REFRESH_TOKEN from .env, exchanges for a new access token,
 * and updates .env with the new tokens.
 *
 * Can be run via PM2 cron (daily) to keep tokens fresh.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const CLIENT_KEY      = process.env.TIKTOK_CLIENT_KEY      || '';
const CLIENT_SECRET   = process.env.TIKTOK_CLIENT_SECRET   || '';
const REFRESH_TOKEN   = process.env.TIKTOK_REFRESH_TOKEN   || '';
const ENV_PATH        = path.join(process.cwd(), '.env');

if (!CLIENT_KEY || !CLIENT_SECRET) {
  console.error('[tiktok-refresh] TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET required');
  process.exit(1);
}

if (!REFRESH_TOKEN) {
  console.error('[tiktok-refresh] TIKTOK_REFRESH_TOKEN not set — run tiktok-oauth.ts first');
  process.exit(1);
}

function upsertEnvVar(key: string, value: string): void {
  let content = '';
  try {
    content = fs.readFileSync(ENV_PATH, 'utf-8');
  } catch { /* no .env */ }

  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }
  fs.writeFileSync(ENV_PATH, content, 'utf-8');
}

async function refreshToken(): Promise<void> {
  console.log('[tiktok-refresh] Refreshing access token...');

  const body = new URLSearchParams({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: REFRESH_TOKEN,
  });

  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = await res.json() as any;

  if (json.error || !json.access_token) {
    console.error(`[tiktok-refresh] Failed: ${json.error_description || json.error || JSON.stringify(json)}`);
    process.exit(1);
  }

  upsertEnvVar('TIKTOK_ACCESS_TOKEN', json.access_token);
  upsertEnvVar('TIKTOK_REFRESH_TOKEN', json.refresh_token);

  // Update metadata
  const metaPath = path.join(process.cwd(), 'data', 'tiktok-token-meta.json');
  fs.mkdirSync(path.dirname(metaPath), { recursive: true });
  fs.writeFileSync(metaPath, JSON.stringify({
    obtained_at: new Date().toISOString(),
    expires_in: json.expires_in,
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    refresh_expires_in: json.refresh_expires_in,
    refresh_expires_at: new Date(Date.now() + json.refresh_expires_in * 1000).toISOString(),
    open_id: json.open_id,
    refreshed: true,
  }, null, 2), 'utf-8');

  const expiresHours = Math.round(json.expires_in / 3600);
  console.log(`✅ Token refreshed. New token expires in ${expiresHours} hours.`);
}

refreshToken().catch(err => {
  console.error(`[tiktok-refresh] Fatal: ${err.message}`);
  process.exit(1);
});
