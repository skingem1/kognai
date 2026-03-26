#!/usr/bin/env npx ts-node
/**
 * youtube-oauth.ts — Sprint 1447
 * Gets YOUTUBE_REFRESH_TOKEN via OAuth 2.0 and appends it to .env.
 * Run once: npx ts-node scripts/scs001/youtube-oauth.ts
 */

import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

const ROOT = path.resolve(__dirname, '..', '..');
const ENV_PATH = path.join(ROOT, '.env');
dotenv.config({ path: ENV_PATH });

const CLIENT_ID     = process.env.YOUTUBE_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET ?? '';
const REDIRECT_URI  = 'http://localhost:8080/callback';
const PORT          = 8080;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ERROR: YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET not set in .env');
  process.exit(1);
}

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube.upload')}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log('\n=== YouTube OAuth — Sprint 1447 ===');
console.log('\nOpening browser for Google OAuth consent...');
console.log(`\nAuth URL:\n${authUrl}\n`);

try { execSync(`open "${authUrl}"`); } catch { /* browser open optional */ }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname !== '/callback') { res.end('Not found'); return; }

  const code = url.searchParams.get('code');
  if (!code) {
    res.end('<html><body>Error: no code in callback. Try again.</body></html>');
    server.close();
    process.exit(1);
  }

  res.end('<html><body><h2>Auth complete — check your terminal.</h2></body></html>');
  server.close();

  console.log('Code received. Exchanging for tokens...');

  // Exchange code for tokens
  const postBody = new URLSearchParams({
    code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI, grant_type: 'authorization_code',
  }).toString();

  const tokens = await new Promise<any>((resolve, reject) => {
    const req2 = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postBody) },
    }, res2 => {
      let data = '';
      res2.on('data', (c: Buffer) => (data += c.toString()));
      res2.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error(data)); } });
    });
    req2.on('error', reject);
    req2.write(postBody);
    req2.end();
  });

  if (!tokens.refresh_token) {
    console.error('ERROR: No refresh_token in response:', JSON.stringify(tokens));
    process.exit(1);
  }

  // Write to .env
  let envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
  if (/^YOUTUBE_REFRESH_TOKEN=/m.test(envContent)) {
    envContent = envContent.replace(/^YOUTUBE_REFRESH_TOKEN=.*/m, `YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
  } else {
    envContent += `\nYOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
  }
  fs.writeFileSync(ENV_PATH, envContent);

  console.log('\nYOUTUBE_REFRESH_TOKEN written to .env');
  console.log('YouTube Shorts automation is now unblocked.');
  console.log('Run: npx ts-node scripts/scs001/youtube-upload.ts to test.');
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`Waiting for OAuth redirect on http://localhost:${PORT}/callback ...`);
  console.log('(Complete the OAuth flow in your browser)');
});
