/**
 * tiktok-oauth.ts — TikTok OAuth 2.0 flow to obtain access token
 *
 * Starts a temporary HTTP server, generates the auth URL, receives the
 * callback code, exchanges it for an access token, and saves to .env.
 *
 * Usage:
 *   npx ts-node scripts/tiktok-oauth.ts
 *
 * Env required:
 *   TIKTOK_CLIENT_KEY
 *   TIKTOK_CLIENT_SECRET
 *
 * Optional:
 *   TIKTOK_REDIRECT_URI  — default: http://localhost:3456/callback
 *   TIKTOK_OAUTH_PORT    — default: 3456
 *
 * After success, TIKTOK_ACCESS_TOKEN and TIKTOK_REFRESH_TOKEN are
 * written to .env and the server shuts down.
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const CLIENT_KEY    = process.env.TIKTOK_CLIENT_KEY    || '';
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || '';
const PORT          = parseInt(process.env.TIKTOK_OAUTH_PORT || '3456', 10);
const REDIRECT_URI  = process.env.TIKTOK_REDIRECT_URI  || `http://localhost:${PORT}/callback`;
const ENV_PATH      = path.join(process.cwd(), '.env');

const SCOPES = 'user.info.basic,video.publish';

if (!CLIENT_KEY || !CLIENT_SECRET) {
  console.error('[tiktok-oauth] TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET must be set in .env');
  process.exit(1);
}

function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_key: CLIENT_KEY,
    scope: SCOPES,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  open_id: string;
}> {
  const body = new URLSearchParams({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  });

  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = await res.json() as any;

  if (json.error || !json.access_token) {
    throw new Error(`Token exchange failed: ${json.error_description || json.error || JSON.stringify(json)}`);
  }

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in,
    refresh_expires_in: json.refresh_expires_in,
    open_id: json.open_id,
  };
}

function upsertEnvVar(key: string, value: string): void {
  let content = '';
  try {
    content = fs.readFileSync(ENV_PATH, 'utf-8');
  } catch { /* no .env yet */ }

  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }
  fs.writeFileSync(ENV_PATH, content, 'utf-8');
}

function main(): void {
  const state = generateState();
  const authUrl = buildAuthUrl(state);

  console.log('\n══════════════════════════════════════════════');
  console.log(' TikTok OAuth 2.0 — Access Token Flow');
  console.log('══════════════════════════════════════════════\n');
  console.log(`Redirect URI: ${REDIRECT_URI}`);
  console.log(`Scopes: ${SCOPES}\n`);
  console.log('Open this URL in your browser:\n');
  console.log(`  ${authUrl}\n`);
  console.log(`Waiting for callback on port ${PORT}...\n`);

  const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url || '', true);

    if (parsed.pathname === '/callback') {
      const code = parsed.query.code as string | undefined;
      const returnedState = parsed.query.state as string | undefined;
      const error = parsed.query.error as string | undefined;

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>Authorization failed</h1><p>Error: ${error}</p>`);
        console.error(`[tiktok-oauth] Authorization denied: ${error}`);
        server.close();
        process.exit(1);
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Missing authorization code</h1>');
        return;
      }

      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>State mismatch — possible CSRF</h1>');
        console.error('[tiktok-oauth] State mismatch');
        return;
      }

      try {
        console.log('[tiktok-oauth] Exchanging code for token...');
        const tokens = await exchangeCodeForToken(code);

        // Save to .env
        upsertEnvVar('TIKTOK_ACCESS_TOKEN', tokens.access_token);
        upsertEnvVar('TIKTOK_REFRESH_TOKEN', tokens.refresh_token);
        upsertEnvVar('TIKTOK_OPEN_ID', tokens.open_id);

        // Save token metadata
        const metaPath = path.join(process.cwd(), 'data', 'tiktok-token-meta.json');
        fs.mkdirSync(path.dirname(metaPath), { recursive: true });
        fs.writeFileSync(metaPath, JSON.stringify({
          obtained_at: new Date().toISOString(),
          expires_in: tokens.expires_in,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          refresh_expires_in: tokens.refresh_expires_in,
          refresh_expires_at: new Date(Date.now() + tokens.refresh_expires_in * 1000).toISOString(),
          open_id: tokens.open_id,
        }, null, 2), 'utf-8');

        const expiresHours = Math.round(tokens.expires_in / 3600);
        const refreshDays = Math.round(tokens.refresh_expires_in / 86400);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<h1>✅ TikTok Authorization Successful!</h1>
          <p>Access token saved to .env</p>
          <p>Expires in: ${expiresHours} hours</p>
          <p>Refresh token expires in: ${refreshDays} days</p>
          <p>You can close this tab now.</p>`);

        console.log('\n✅ Token obtained and saved to .env');
        console.log(`   Access token expires in: ${expiresHours} hours`);
        console.log(`   Refresh token expires in: ${refreshDays} days`);
        console.log(`   Open ID: ${tokens.open_id}`);
        console.log('\n   Run: npx ts-node scripts/tiktok-refresh-token.ts  (before expiry)');
        console.log('\n[tiktok-oauth] Done. Shutting down.\n');

        server.close();
        setTimeout(() => process.exit(0), 500);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h1>Token exchange failed</h1><p>${(err as Error).message}</p>`);
        console.error(`[tiktok-oauth] Token exchange error: ${(err as Error).message}`);
      }
    } else {
      res.writeHead(302, { Location: authUrl });
      res.end();
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[tiktok-oauth] Server listening on http://127.0.0.1:${PORT}`);
  });
}

main();
