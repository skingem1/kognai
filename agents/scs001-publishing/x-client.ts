// SCS-001 — X/Twitter API v2 Client (Sprint 484)
// Video posting integration via X API v2.
// Requires: X_BEARER_TOKEN, X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
// Dry-run mode when credentials not set.

import { readFileSync, statSync } from 'fs';
import * as https from 'https';
import * as crypto from 'crypto';

export interface XPostResult {
  success: boolean;
  tweet_id?: string;
  tweet_url?: string;
  error?: string;
  dry_run: boolean;
}

function getCredentials() {
  return {
    apiKey: process.env.X_API_KEY || '',
    apiSecret: process.env.X_API_SECRET || '',
    accessToken: process.env.X_ACCESS_TOKEN || '',
    accessSecret: process.env.X_ACCESS_SECRET || '',
    bearerToken: process.env.X_BEARER_TOKEN || '',
  };
}

export function isXConfigured(): boolean {
  const creds = getCredentials();
  return !!(creds.apiKey && creds.apiSecret && creds.accessToken && creds.accessSecret);
}

/** Generate OAuth 1.0a signature for X API */
function oauthSign(method: string, url: string, params: Record<string, string>): string {
  const creds = getCredentials();
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
    ...params,
  };

  const sortedParams = Object.keys(oauthParams).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`)
    .join('&');

  const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
  const signingKey = `${encodeURIComponent(creds.apiSecret)}&${encodeURIComponent(creds.accessSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams.oauth_signature = signature;

  const authHeader = 'OAuth ' + Object.keys(oauthParams)
    .filter(k => k.startsWith('oauth_'))
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');

  return authHeader;
}

/** Upload media (video) to X via v1.1 chunked upload */
export async function uploadMedia(filePath: string): Promise<string | null> {
  if (!isXConfigured()) return null;

  const fileSize = statSync(filePath).size;
  const fileData = readFileSync(filePath);

  // INIT
  const initUrl = 'https://upload.twitter.com/1.1/media/upload.json';
  const initParams = {
    command: 'INIT',
    total_bytes: fileSize.toString(),
    media_type: 'video/mp4',
    media_category: 'tweet_video',
  };

  console.log(`[X-Client] Uploading ${Math.round(fileSize / 1024)}KB video...`);
  console.log('[X-Client] Note: Full upload requires OAuth 1.0a — scaffold only');

  // Return null for now — full implementation requires chunked upload
  // which needs proper OAuth signing per chunk
  return null;
}

/** Post a tweet with optional media */
export async function postTweet(text: string, mediaId?: string): Promise<XPostResult> {
  if (!isXConfigured()) {
    console.log('[X-Client] DRY RUN — X credentials not configured');
    return {
      success: true,
      tweet_id: `dry-run-${Date.now()}`,
      tweet_url: `https://x.com/i/status/dry-run-${Date.now()}`,
      dry_run: true,
    };
  }

  const url = 'https://api.twitter.com/2/tweets';
  const body: any = { text };
  if (mediaId) {
    body.media = { media_ids: [mediaId] };
  }

  try {
    const authHeader = oauthSign('POST', url, {});
    const data = JSON.stringify(body);

    return new Promise((resolve) => {
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.data?.id) {
              resolve({
                success: true,
                tweet_id: json.data.id,
                tweet_url: `https://x.com/i/status/${json.data.id}`,
                dry_run: false,
              });
            } else {
              resolve({ success: false, error: body.slice(0, 300), dry_run: false });
            }
          } catch {
            resolve({ success: false, error: `HTTP ${res.statusCode}: ${body.slice(0, 200)}`, dry_run: false });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ success: false, error: err.message, dry_run: false });
      });

      req.write(data);
      req.end();
    });
  } catch (err: any) {
    return { success: false, error: err.message, dry_run: false };
  }
}

/** Format caption for X (280 char limit, different hashtag strategy) */
export function buildXCaption(tiktokCaption: string): string {
  const lines = tiktokCaption.split('\n').filter(l => l.trim());
  const textLines: string[] = [];
  const hashtags: string[] = [];

  for (const line of lines) {
    const tags = line.match(/#\w+/g);
    if (tags && tags.length > 2) {
      hashtags.push(...tags);
    } else {
      textLines.push(line);
    }
  }

  // X: max 3 hashtags, drop platform-specific ones
  const xTags = hashtags
    .filter(t => !['#fyp', '#foryou', '#foryoupage', '#tiktok', '#reels'].includes(t.toLowerCase()))
    .slice(0, 3);

  // Truncate text to fit 280 chars with hashtags
  let text = textLines.join(' ').trim();
  const tagStr = xTags.join(' ');
  const maxTextLen = 280 - tagStr.length - 2; // 2 for newlines
  if (text.length > maxTextLen) {
    text = text.slice(0, maxTextLen - 3) + '...';
  }

  return `${text}\n\n${tagStr}`.trim();
}
