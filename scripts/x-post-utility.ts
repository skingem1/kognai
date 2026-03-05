/**
 * x-post-utility.ts
 *
 * Twitter/X API v2 posting utility with OAuth 1.0a authentication.
 * Zero external dependencies — uses only Node.js built-in modules.
 *
 * Environment variables (via .env):
 *   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET, X_BEARER_TOKEN
 *
 * CLI usage:
 *   ts-node scripts/x-post-utility.ts --test
 *   ts-node scripts/x-post-utility.ts --tweet "Hello world"
 *   ts-node scripts/x-post-utility.ts --thread "First tweet" "Second tweet" "Third tweet"
 *   ts-node scripts/x-post-utility.ts --delete 1234567890
 */

import * as https from 'https';
import * as crypto from 'crypto';
import * as querystring from 'querystring';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Load .env if dotenv is available (non-fatal if missing)
// ---------------------------------------------------------------------------
try {
  require('dotenv/config');
} catch {
  // dotenv not installed — rely on env vars being set externally
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------
interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  bearerToken: string;
}

function loadCredentials(): XCredentials {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  const bearerToken = process.env.X_BEARER_TOKEN;

  const missing: string[] = [];
  if (!apiKey) missing.push('X_API_KEY');
  if (!apiSecret) missing.push('X_API_SECRET');
  if (!accessToken) missing.push('X_ACCESS_TOKEN');
  if (!accessTokenSecret) missing.push('X_ACCESS_TOKEN_SECRET');
  if (!bearerToken) missing.push('X_BEARER_TOKEN');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Set them in your .env file or export them before running this script.'
    );
  }

  return {
    apiKey: apiKey!,
    apiSecret: apiSecret!,
    accessToken: accessToken!,
    accessTokenSecret: accessTokenSecret!,
    bearerToken: bearerToken!,
  };
}

// ---------------------------------------------------------------------------
// OAuth 1.0a Implementation
// ---------------------------------------------------------------------------

/** Generate a 32-character random nonce. */
function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** Current Unix timestamp as a string. */
function generateTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

/**
 * Percent-encode a string per RFC 3986.
 * encodeURIComponent is close but does not encode `!`, `*`, `'`, `(`, `)`.
 */
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  });
}

/** Build the OAuth 1.0a signature base string. */
function buildSignatureBaseString(
  method: string,
  baseUrl: string,
  params: Record<string, string>
): string {
  // Sort parameters lexicographically by key
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&');

  return [
    method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(paramString),
  ].join('&');
}

/** Compute HMAC-SHA1 signature and return Base64-encoded result. */
function signHmacSha1(baseString: string, signingKey: string): string {
  return crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');
}

/** Build the full OAuth Authorization header value. */
function buildAuthorizationHeader(
  method: string,
  url: string,
  creds: XCredentials,
  extraParams?: Record<string, string>
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: generateTimestamp(),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };

  // Merge any additional parameters (query string params, NOT body params for JSON)
  const allParams: Record<string, string> = { ...oauthParams };
  if (extraParams) {
    Object.assign(allParams, extraParams);
  }

  const baseString = buildSignatureBaseString(method, url, allParams);
  const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessTokenSecret)}`;
  const signature = signHmacSha1(baseString, signingKey);

  oauthParams['oauth_signature'] = signature;

  // Build header: OAuth key="value", ...
  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(', ');

  return `OAuth ${headerParts}`;
}

// ---------------------------------------------------------------------------
// HTTP Request Helper
// ---------------------------------------------------------------------------

interface ApiResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: any;
  rawBody: string;
}

function httpsRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string
): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        ...headers,
        'User-Agent': 'x-post-utility/1.0',
      },
    };

    if (body) {
      options.headers!['Content-Length'] = Buffer.byteLength(body).toString();
    }

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf-8');
        let parsedBody: any;
        try {
          parsedBody = JSON.parse(rawBody);
        } catch {
          parsedBody = rawBody;
        }
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers as Record<string, string | string[] | undefined>,
          body: parsedBody,
          rawBody,
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

class XApiError extends Error {
  statusCode: number;
  responseBody: any;
  rateLimitReset?: Date;

  constructor(message: string, statusCode: number, responseBody: any, rateLimitReset?: Date) {
    super(message);
    this.name = 'XApiError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.rateLimitReset = rateLimitReset;
  }
}

function handleApiError(res: ApiResponse): never {
  const { statusCode, body, headers } = res;

  // Rate limit info
  let rateLimitReset: Date | undefined;
  const resetHeader = headers['x-rate-limit-reset'];
  if (resetHeader) {
    const resetTimestamp = parseInt(Array.isArray(resetHeader) ? resetHeader[0] : resetHeader, 10);
    if (!isNaN(resetTimestamp)) {
      rateLimitReset = new Date(resetTimestamp * 1000);
    }
  }

  let message: string;

  switch (statusCode) {
    case 401:
      message =
        'Authentication failed (401). Check your X_API_KEY, X_API_SECRET, ' +
        'X_ACCESS_TOKEN, and X_ACCESS_TOKEN_SECRET. Ensure the app has Read and Write permissions.';
      break;
    case 403:
      message =
        'Forbidden (403). Your app may lack the required permissions, or your account ' +
        'may be restricted. Check your X Developer Portal app settings.';
      if (body?.detail) message += ` Detail: ${body.detail}`;
      break;
    case 429: {
      let resetInfo = '';
      if (rateLimitReset) {
        const waitSec = Math.max(0, Math.ceil((rateLimitReset.getTime() - Date.now()) / 1000));
        resetInfo = ` Rate limit resets at ${rateLimitReset.toISOString()} (${waitSec}s from now).`;
      }
      message = `Rate limited (429). Too many requests.${resetInfo}`;
      break;
    }
    default: {
      const detail = body?.detail || body?.title || JSON.stringify(body);
      message = `X API error ${statusCode}: ${detail}`;
    }
  }

  throw new XApiError(message, statusCode, body, rateLimitReset);
}

// ---------------------------------------------------------------------------
// Post Logging
// ---------------------------------------------------------------------------

function getLogFilePath(): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const logDir = path.resolve(process.cwd(), 'reports', 'x-admin');
  return path.join(logDir, `post-log-${today}.md`);
}

function ensureLogDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function appendLog(entry: string): void {
  try {
    const logPath = getLogFilePath();
    ensureLogDir(logPath);

    const timestamp = new Date().toISOString();
    const logEntry = `\n## ${timestamp}\n\n${entry}\n`;

    if (!fs.existsSync(logPath)) {
      const header = `# X/Twitter Post Log - ${new Date().toISOString().slice(0, 10)}\n`;
      fs.writeFileSync(logPath, header, 'utf-8');
    }

    fs.appendFileSync(logPath, logEntry, 'utf-8');
  } catch (err) {
    // Logging failure should not break the main operation
    console.error('[LOG WARNING] Failed to write post log:', (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.twitter.com';

/**
 * Post a single tweet.
 * Returns the created tweet's id and text.
 */
export async function postTweet(
  text: string,
  replyToId?: string
): Promise<{ id: string; text: string }> {
  const creds = loadCredentials();
  const url = `${API_BASE}/2/tweets`;

  const payload: Record<string, any> = { text };
  if (replyToId) {
    payload.reply = { in_reply_to_tweet_id: replyToId };
  }

  const body = JSON.stringify(payload);
  const authHeader = buildAuthorizationHeader('POST', url, creds);

  const res = await httpsRequest('POST', url, {
    Authorization: authHeader,
    'Content-Type': 'application/json',
  }, body);

  if (res.statusCode < 200 || res.statusCode >= 300) {
    handleApiError(res);
  }

  const data = res.body?.data;
  if (!data?.id) {
    throw new Error(`Unexpected API response: ${res.rawBody}`);
  }

  const result = { id: data.id, text: data.text };

  // Log the post
  const replyInfo = replyToId ? ` (reply to ${replyToId})` : '';
  appendLog(
    `**Action:** Post Tweet${replyInfo}\n` +
      `**Tweet ID:** ${result.id}\n` +
      `**Text:** ${result.text}\n`
  );

  return result;
}

/**
 * Post a thread of tweets. Each tweet replies to the previous one.
 * Returns the list of created tweet IDs.
 */
export async function postThread(
  tweets: string[]
): Promise<{ ids: string[] }> {
  if (tweets.length === 0) {
    throw new Error('Thread must contain at least one tweet.');
  }

  const ids: string[] = [];
  let previousId: string | undefined;

  for (let i = 0; i < tweets.length; i++) {
    const tweetText = tweets[i];
    console.log(`  [${i + 1}/${tweets.length}] Posting...`);

    const result = await postTweet(tweetText, previousId);
    ids.push(result.id);
    previousId = result.id;

    console.log(`  [${i + 1}/${tweets.length}] Posted: ${result.id}`);

    // Small delay between thread tweets to avoid rate issues
    if (i < tweets.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  appendLog(
    `**Action:** Post Thread (${ids.length} tweets)\n` +
      `**Tweet IDs:** ${ids.join(', ')}\n` +
      `**Texts:**\n${tweets.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}\n`
  );

  return { ids };
}

/**
 * Delete a tweet by ID.
 */
export async function deleteTweet(tweetId: string): Promise<void> {
  const creds = loadCredentials();
  const url = `${API_BASE}/2/tweets/${tweetId}`;

  const authHeader = buildAuthorizationHeader('DELETE', url, creds);

  const res = await httpsRequest('DELETE', url, {
    Authorization: authHeader,
    'Content-Type': 'application/json',
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    handleApiError(res);
  }

  const deleted = res.body?.data?.deleted;
  if (deleted !== true) {
    throw new Error(`Tweet deletion may have failed. Response: ${res.rawBody}`);
  }

  appendLog(
    `**Action:** Delete Tweet\n` +
      `**Tweet ID:** ${tweetId}\n` +
      `**Result:** Deleted successfully\n`
  );
}

/**
 * Get authenticated user info. Uses Bearer token (OAuth 2.0 App-Only).
 * Useful for verifying credentials.
 */
export async function getMe(): Promise<{ id: string; name: string; username: string }> {
  const creds = loadCredentials();
  const url = `${API_BASE}/2/users/me`;

  const res = await httpsRequest('GET', url, {
    Authorization: `Bearer ${creds.bearerToken}`,
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    handleApiError(res);
  }

  const data = res.body?.data;
  if (!data?.id) {
    throw new Error(`Unexpected API response: ${res.rawBody}`);
  }

  return { id: data.id, name: data.name, username: data.username };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function cli(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const command = args[0];

  try {
    switch (command) {
      case '--test': {
        console.log('Verifying credentials with GET /2/users/me ...\n');
        const me = await getMe();
        console.log('Authentication successful!\n');
        console.log(`  ID:       ${me.id}`);
        console.log(`  Name:     ${me.name}`);
        console.log(`  Username: @${me.username}`);
        break;
      }

      case '--tweet': {
        const text = args[1];
        if (!text) {
          console.error('Error: --tweet requires a message argument.\n');
          console.error('Usage: ts-node scripts/x-post-utility.ts --tweet "Your message here"');
          process.exit(1);
        }
        if (text.length > 280) {
          console.error(`Error: Tweet exceeds 280 characters (${text.length} chars).`);
          process.exit(1);
        }
        console.log('Posting tweet...\n');
        const result = await postTweet(text);
        console.log('Tweet posted successfully!\n');
        console.log(`  ID:   ${result.id}`);
        console.log(`  Text: ${result.text}`);
        console.log(`  URL:  https://x.com/i/status/${result.id}`);
        break;
      }

      case '--thread': {
        const tweets = args.slice(1);
        if (tweets.length < 2) {
          console.error('Error: --thread requires at least 2 message arguments.\n');
          console.error(
            'Usage: ts-node scripts/x-post-utility.ts --thread "First tweet" "Second tweet" ...'
          );
          process.exit(1);
        }
        for (let i = 0; i < tweets.length; i++) {
          if (tweets[i].length > 280) {
            console.error(
              `Error: Tweet ${i + 1} exceeds 280 characters (${tweets[i].length} chars).`
            );
            process.exit(1);
          }
        }
        console.log(`Posting thread (${tweets.length} tweets)...\n`);
        const result = await postThread(tweets);
        console.log('\nThread posted successfully!\n');
        result.ids.forEach((id, i) => {
          console.log(`  [${i + 1}] ID: ${id}  URL: https://x.com/i/status/${id}`);
        });
        break;
      }

      case '--delete': {
        const tweetId = args[1];
        if (!tweetId) {
          console.error('Error: --delete requires a tweet ID argument.\n');
          console.error('Usage: ts-node scripts/x-post-utility.ts --delete 1234567890');
          process.exit(1);
        }
        if (!/^\d+$/.test(tweetId)) {
          console.error('Error: Tweet ID must be numeric.');
          process.exit(1);
        }
        console.log(`Deleting tweet ${tweetId}...\n`);
        await deleteTweet(tweetId);
        console.log('Tweet deleted successfully.');
        break;
      }

      case '--help':
      case '-h':
        printUsage();
        break;

      default:
        console.error(`Unknown command: ${command}\n`);
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    if (err instanceof XApiError) {
      console.error(`\nX API Error (${err.statusCode}):\n  ${err.message}`);
      if (err.rateLimitReset) {
        console.error(`  Rate limit resets: ${err.rateLimitReset.toISOString()}`);
      }
      if (process.env.DEBUG) {
        console.error('\nFull response body:', JSON.stringify(err.responseBody, null, 2));
      }
    } else {
      console.error(`\nError: ${(err as Error).message}`);
      if (process.env.DEBUG) {
        console.error((err as Error).stack);
      }
    }
    process.exit(1);
  }
}

function printUsage(): void {
  console.log(`
x-post-utility.ts — Twitter/X API v2 Posting Utility

Usage:
  ts-node scripts/x-post-utility.ts <command> [arguments]

Commands:
  --test                          Verify credentials (GET /2/users/me)
  --tweet "message"               Post a single tweet
  --thread "msg1" "msg2" ...      Post a thread (2+ tweets)
  --delete <tweet_id>             Delete a tweet by ID
  --help                          Show this help message

Environment variables (required):
  X_API_KEY                       OAuth 1.0a consumer key
  X_API_SECRET                    OAuth 1.0a consumer secret
  X_ACCESS_TOKEN                  OAuth 1.0a access token
  X_ACCESS_TOKEN_SECRET           OAuth 1.0a access token secret
  X_BEARER_TOKEN                  OAuth 2.0 Bearer token

Optional:
  DEBUG=1                         Show full error response bodies

Post logs are written to: reports/x-admin/post-log-YYYY-MM-DD.md
`);
}

// ---------------------------------------------------------------------------
// Entry point: run CLI if this file is executed directly
// ---------------------------------------------------------------------------
if (require.main === module) {
  cli();
}
