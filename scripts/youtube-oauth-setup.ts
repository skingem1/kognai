#!/usr/bin/env npx ts-node
/**
 * YouTube OAuth2 Setup Helper — Sprint 779
 *
 * Generates the OAuth consent URL for the operator to visit, then
 * exchanges the authorization code for a refresh token.
 *
 * Usage:
 *   Step 1: npx ts-node scripts/youtube-oauth-setup.ts
 *           → prints the URL to visit
 *   Step 2: npx ts-node scripts/youtube-oauth-setup.ts --code=AUTH_CODE
 *           → exchanges code for refresh token and prints it
 *
 * After getting the refresh token, add to .env:
 *   YOUTUBE_REFRESH_TOKEN=your_refresh_token_here
 */

import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(__dirname, '..', '.env') });

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET ?? '';
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'; // Desktop/OOB flow

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ERROR: YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be set in .env');
  process.exit(1);
}

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCode(code: string): Promise<void> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const data = await res.json() as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || data.error) {
    console.error(`ERROR: ${data.error ?? res.status} — ${data.error_description ?? 'Unknown error'}`);
    process.exit(1);
  }

  if (data.refresh_token) {
    console.log('\n✅ SUCCESS! Add this to your .env file:\n');
    console.log(`YOUTUBE_REFRESH_TOKEN=${data.refresh_token}`);
    console.log('\nAfter adding, YouTube Shorts upload will be enabled.');
  } else {
    console.log('\n⚠️  No refresh token returned. You may need to revoke access and try again.');
    console.log('Visit: https://myaccount.google.com/permissions');
    if (data.access_token) {
      console.log('\nAccess token received (temporary):', data.access_token.slice(0, 20) + '...');
    }
  }
}

async function main(): Promise<void> {
  const codeArg = process.argv.find(a => a.startsWith('--code='));

  if (codeArg) {
    const code = codeArg.split('=').slice(1).join('=');
    console.log('Exchanging authorization code for refresh token...');
    await exchangeCode(code);
  } else {
    console.log('=== YouTube OAuth2 Setup ===\n');
    console.log('Step 1: Visit this URL in your browser:\n');
    console.log(getAuthUrl());
    console.log('\nStep 2: After authorizing, copy the code and run:\n');
    console.log('  npx ts-node scripts/youtube-oauth-setup.ts --code=YOUR_CODE_HERE\n');
    console.log('Step 3: Add the refresh token to .env and YouTube upload is ready.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
