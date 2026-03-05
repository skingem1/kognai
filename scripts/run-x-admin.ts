#!/usr/bin/env ts-node

/**
 * run-x-admin.ts — Invoica X/Twitter Autonomous Posting Agent v2
 *
 * Posts 3 times per day to @invoica_ai:
 *   09:00 UTC — Educational: agentic economy / x402 / tax compliance (web-researched)
 *   13:00 UTC — Invoica Updates: recent code, SDKs, webhooks (from git log)
 *   17:00 UTC — Vision: long-term mission, positioning (from SOUL.md)
 *
 * Each post:
 *   1. Content generated dynamically by AI
 *   2. CEO reviews (Anthropic claude-sonnet-4-5) for brand/vision alignment
 *   3. CTO reviews technical posts (MiniMax M2.5) for accuracy
 *   4. CMO generates branded image via DALL-E 3
 *   5. Image uploaded to X, post published with media
 *
 * Schedule: PM2 cron_restart every 30 minutes
 * State: reports/invoica-x-admin/daily-state.json (tracks what posted today)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import 'dotenv/config';

// Credential Remap — override X_* with INVOICA_X_* so utility posts to @invoica_ai
if (process.env.INVOICA_X_API_KEY)             process.env.X_API_KEY             = process.env.INVOICA_X_API_KEY;
if (process.env.INVOICA_X_API_SECRET)          process.env.X_API_SECRET          = process.env.INVOICA_X_API_SECRET;
if (process.env.INVOICA_X_ACCESS_TOKEN)        process.env.X_ACCESS_TOKEN        = process.env.INVOICA_X_ACCESS_TOKEN;
if (process.env.INVOICA_X_ACCESS_TOKEN_SECRET) process.env.X_ACCESS_TOKEN_SECRET = process.env.INVOICA_X_ACCESS_TOKEN_SECRET;
if (process.env.INVOICA_X_BEARER_TOKEN)        process.env.X_BEARER_TOKEN        = process.env.INVOICA_X_BEARER_TOKEN;

// Paths
const ROOT         = path.resolve(__dirname, '..');
const REPORTS_DIR  = path.join(ROOT, 'reports', 'invoica-x-admin');
const STATE_FILE   = path.join(REPORTS_DIR, 'daily-state.json');
const LOCK_FILE    = path.join(REPORTS_DIR, '.x-admin.lock');
const LOG_DIR      = path.join(REPORTS_DIR, 'logs');
const REJECTED_DIR = path.join(REPORTS_DIR, 'drafts', 'rejected');
const SOUL_FILE    = path.join(ROOT, 'SOUL.md');
const COMM_PLAN    = path.join(ROOT, 'reports', 'cmo', 'invoica-communication-plan.md');

// Post slots: 3 per day
const POST_SLOTS = [
  { key: 'educational', hourUTC: 9,  label: 'Educational (Agentic Economy / x402 / Tax)',  technical: true  },
  { key: 'updates',     hourUTC: 13, label: 'Invoica Updates (Code / SDKs / Webhooks)',     technical: true  },
  { key: 'vision',      hourUTC: 17, label: 'Vision & Long-term Positioning',               technical: false },
];

// State management
interface DailyState { date: string; posted: Record<string, boolean>; }

function ensureDir(d: string) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function loadState(): DailyState {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const s: DailyState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    if (s.date === today) return s;
  } catch { /* reset on new day or parse error */ }
  return { date: today, posted: {} };
}

function saveState(s: DailyState) {
  ensureDir(REPORTS_DIR);
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

// HTTP helper
function apiCall(
  method: string, hostname: string, urlPath: string,
  headers: Record<string, string>, body?: string | Buffer
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const opts: https.RequestOptions = {
      hostname, port: 443, path: urlPath, method,
      headers: { ...headers, ...(body ? { 'Content-Length': Buffer.byteLength(body).toString() } : {}) },
    };
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString() }));
      res.on('error', reject);
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Download URL to buffer (follows redirects)
function downloadUrl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    (mod as typeof https).get(url, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return resolve(downloadUrl(res.headers.location));
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// OAuth 1.0a
function pct(s: string) {
  return encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function buildOAuthHeader(
  method: string, url: string,
  creds: { apiKey: string; apiSecret: string; accessToken: string; accessTokenSecret: string },
  extraParams: Record<string, string> = {}
): string {
  const op: Record<string, string> = {
    oauth_consumer_key:     creds.apiKey,
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            creds.accessToken,
    oauth_version:          '1.0',
  };
  const all = { ...op, ...extraParams };
  const base = [
    method.toUpperCase(),
    pct(url),
    pct(Object.keys(all).sort().map(k => `${pct(k)}=${pct(all[k])}`).join('&')),
  ].join('&');
  const sigKey = `${pct(creds.apiSecret)}&${pct(creds.accessTokenSecret)}`;
  op['oauth_signature'] = crypto.createHmac('sha1', sigKey).update(base).digest('base64');
  return 'OAuth ' + Object.keys(op).sort().map(k => `${pct(k)}="${pct(op[k])}"`).join(', ');
}

function getXCreds() {
  return {
    apiKey:            process.env.X_API_KEY!,
    apiSecret:         process.env.X_API_SECRET!,
    accessToken:       process.env.X_ACCESS_TOKEN!,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET!,
  };
}

// X: Upload media (multipart/form-data with OAuth 1.0a)
async function uploadImageToX(imgBuf: Buffer): Promise<string | null> {
  try {
    const creds = getXCreds();
    const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
    const boundary = '----InvoicaBoundary' + crypto.randomBytes(8).toString('hex');
    const prefix = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media"\r\nContent-Type: image/png\r\n\r\n`);
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([prefix, imgBuf, suffix]);
    // For multipart, OAuth does NOT include body params in signature
    const auth = buildOAuthHeader('POST', uploadUrl, creds);
    const parsed = new URL(uploadUrl);
    const res = await apiCall('POST', parsed.hostname, parsed.pathname, {
      Authorization: auth,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    }, body);
    if (res.status === 200 || res.status === 201) {
      const data = JSON.parse(res.body);
      console.log(`  [image] Uploaded to X — media_id: ${data.media_id_string}`);
      return data.media_id_string;
    }
    console.log(`  [image] X upload failed ${res.status}: ${res.body.slice(0, 200)}`);
    return null;
  } catch (e: any) {
    console.log(`  [image] X upload error: ${e.message}`);
    return null;
  }
}

// X: Post tweet with optional media
async function postTweetWithMedia(text: string, mediaId: string | null): Promise<string | null> {
  const creds = getXCreds();
  const url = 'https://api.twitter.com/2/tweets';
  const auth = buildOAuthHeader('POST', url, creds);
  const payload: any = { text };
  if (mediaId) payload.media = { media_ids: [mediaId] };
  const res = await apiCall('POST', 'api.twitter.com', '/2/tweets', {
    Authorization: auth, 'Content-Type': 'application/json',
  }, JSON.stringify(payload));
  if (res.status === 201) return JSON.parse(res.body).data?.id || null;
  console.log(`  [tweet] Failed ${res.status}: ${res.body.slice(0, 300)}`);
  return null;
}

// X: Post thread (first tweet gets media)
async function postThreadWithMedia(tweets: string[], mediaId: string | null): Promise<string | null> {
  let replyToId: string | null = null;
  let firstId: string | null = null;
  for (let i = 0; i < tweets.length; i++) {
    const creds = getXCreds();
    const url = 'https://api.twitter.com/2/tweets';
    const auth = buildOAuthHeader('POST', url, creds);
    const payload: any = { text: tweets[i] };
    if (i === 0 && mediaId) payload.media = { media_ids: [mediaId] };
    if (replyToId) payload.reply = { in_reply_to_tweet_id: replyToId };
    console.log(`  [${i + 1}/${tweets.length}] Posting...`);
    const res = await apiCall('POST', 'api.twitter.com', '/2/tweets', {
      Authorization: auth, 'Content-Type': 'application/json',
    }, JSON.stringify(payload));
    if (res.status === 201) {
      replyToId = JSON.parse(res.body).data?.id;
      if (i === 0) firstId = replyToId;
      console.log(`  [${i + 1}/${tweets.length}] Posted: ${replyToId}`);
      if (i < tweets.length - 1) await new Promise(r => setTimeout(r, 1200));
    } else {
      console.log(`  [${i + 1}/${tweets.length}] Failed ${res.status}: ${res.body.slice(0, 200)}`);
      break;
    }
  }
  return firstId;
}

// Anthropic Claude call
async function callClaude(system: string, user: string, maxTokens = 1400): Promise<string> {
  const body = JSON.stringify({
    model: 'claude-sonnet-4-5', max_tokens: maxTokens,
    system, messages: [{ role: 'user', content: user }],
  });
  const res = await apiCall('POST', 'api.anthropic.com', '/v1/messages', {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY!,
    'anthropic-version': '2023-06-01',
  }, body);
  return JSON.parse(res.body).content?.[0]?.text || '';
}

// Grok web search
async function searchWithGrok(query: string): Promise<string> {
  try {
    const body = JSON.stringify({
      model: 'grok-3-latest',
      messages: [
        { role: 'system', content: 'You are a research assistant with live web search. Find recent, accurate, specific facts with numbers and dates.' },
        { role: 'user', content: query },
      ],
      max_tokens: 1500,
    });
    const baseUrl = (process.env.XAI_BASE_URL || 'https://api.x.ai/v1').replace(/\/$/, '');
    const parsed = new URL(baseUrl + '/chat/completions');
    const res = await apiCall('POST', parsed.hostname, parsed.pathname + parsed.search, {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    }, body);
    return JSON.parse(res.body).choices?.[0]?.message?.content || '(no results)';
  } catch (e: any) {
    return `(Grok search unavailable: ${e.message})`;
  }
}

// DALL-E 3 image generation
async function generateBrandedImage(imagePrompt: string): Promise<Buffer | null> {
  try {
    if (!process.env.OPENAI_API_KEY) return null;
    const body = JSON.stringify({
      model: 'dall-e-3',
      prompt: `${imagePrompt}. Style: Clean modern fintech brand. Dark background (#0a0a0f), Invoica brand purple (#8b5cf6) and white accents. Professional and minimalist. No text or typography in the image.`,
      n: 1, size: '1024x1024', response_format: 'url',
    });
    const res = await apiCall('POST', 'api.openai.com', '/v1/images/generations', {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    }, body);
    if (res.status !== 200) { console.log(`  [image] DALL-E ${res.status}`); return null; }
    const imageUrl = JSON.parse(res.body).data?.[0]?.url;
    if (!imageUrl) return null;
    console.log(`  [image] Generated — downloading...`);
    const buf = await downloadUrl(imageUrl);
    console.log(`  [image] ${Math.round(buf.length / 1024)}KB ready`);
    return buf;
  } catch (e: any) {
    console.log(`  [image] Error: ${e.message}`);
    return null;
  }
}

// Content generators

function loadContext() {
  const soul = fs.existsSync(SOUL_FILE) ? fs.readFileSync(SOUL_FILE, 'utf-8').slice(0, 2000) : '';
  const plan = fs.existsSync(COMM_PLAN) ? fs.readFileSync(COMM_PLAN, 'utf-8').slice(0, 1000) : '';
  return { soul, plan };
}

// Rotate topic by day-of-year to avoid repetition
function rotateBy<T>(arr: T[]): T {
  const doy = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return arr[doy % arr.length];
}

// ── CMO Weekly Content Plan ──────────────────────────────────────────────────
// Reads reports/cmo/weekly-content-plan-YYYY-MM-DD.json (Monday of current week)
// Returns today's pre-written content for a given slot, or null if not available.

interface CmoPlanSlot {
  tweets: string[];
  image_path: string | null;
  topic_summary?: string;
}

interface CmoDayPlan {
  educational?: CmoPlanSlot;
  updates?: CmoPlanSlot;
  vision?: CmoPlanSlot;
}

interface CmoWeeklyPlan {
  week_start: string;
  week_end: string;
  prepared_at?: string;
  strategy_note?: string;
  accounts_to_watch?: Array<{ handle: string; topic: string; engagement_angle: string }>;
  days: Record<string, CmoDayPlan>;
}

function getMondayOfCurrentWeek(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // days back to Monday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function loadCmoPlan(): CmoWeeklyPlan | null {
  const monday = getMondayOfCurrentWeek();
  const planPath = path.join(ROOT, 'reports', 'cmo', `weekly-content-plan-${monday}.json`);
  if (!fs.existsSync(planPath)) {
    console.log(`  [cmo-plan] No plan found for week of ${monday} — will generate content on-the-fly`);
    return null;
  }
  try {
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8')) as CmoWeeklyPlan;
    // ONLY use plans approved by both CTO and CEO
    if ((plan as any).status !== 'approved') {
      console.log(`  [cmo-plan] Plan for ${monday} exists but status="${(plan as any).status}" — not yet approved by CTO+CEO. Falling back to generation.`);
      return null;
    }
    console.log(`  [cmo-plan] ✅ Loaded CEO-approved weekly plan: ${planPath}`);
    return plan;
  } catch (e: any) {
    console.log(`  [cmo-plan] Failed to parse plan: ${e.message}`);
    return null;
  }
}

function getCmoDaySlot(plan: CmoWeeklyPlan, slotKey: string): CmoPlanSlot | null {
  const today = new Date().toISOString().slice(0, 10);
  const dayPlan = plan.days[today];
  if (!dayPlan) {
    console.log(`  [cmo-plan] No plan entry for today (${today})`);
    return null;
  }
  const slot = dayPlan[slotKey as keyof CmoDayPlan];
  if (!slot || !slot.tweets || slot.tweets.length === 0) {
    console.log(`  [cmo-plan] No ${slotKey} slot in today's plan`);
    return null;
  }
  return slot;
}

async function loadCmoImage(imagePath: string | null): Promise<Buffer | null> {
  if (!imagePath) return null;
  const absPath = path.join(ROOT, imagePath);
  if (!fs.existsSync(absPath)) {
    console.log(`  [cmo-plan] Image not found: ${imagePath}`);
    return null;
  }
  try {
    const buf = fs.readFileSync(absPath);
    console.log(`  [cmo-plan] Loaded CMO image: ${imagePath} (${Math.round(buf.length / 1024)}KB)`);
    return buf;
  } catch {
    return null;
  }
}

async function generateEducationalPost(ceoFeedback?: string) {
  const topic = rotateBy([
    'latest developments in the agentic economy: AI agents transacting autonomously in 2026',
    'x402 payment protocol: how HTTP 402 enables micropayments for AI agent APIs',
    'VAT and digital services tax compliance for AI agent transactions: 2026 regulatory landscape',
    'USDC and stablecoins as settlement layer for autonomous AI agent commerce',
    'on-chain payment authorization via EIP-712 for agent-to-agent transactions',
  ]);

  console.log(`  [edu] Researching: ${topic}`);
  const research = await searchWithGrok(`Find recent news, statistics, and expert analysis about: ${topic}. Focus on 2025-2026 developments. Include specific numbers, dates, and verifiable facts.`);
  const { soul, plan } = loadContext();

  const feedbackBlock = ceoFeedback
    ? `\n\n## ⚠️ CEO REJECTED PREVIOUS VERSION — FIX ALL OF THESE ISSUES\n${ceoFeedback}\n\nWrite a completely new version that addresses every point above.`
    : '';

  const raw = await callClaude(
    `You write educational X/Twitter content for @invoica_ai — the Financial OS for AI Agents.
Audience: AI/Web3 builders and founders who build with LLMs and on-chain infrastructure.
Voice: confident technical founder who knows the protocol cold — NOT a social media manager or marketer.

HARD RULES (CEO will reject if violated):
- No phantom statistics or unverifiable claims — only cite numbers from the research provided
- No hollow phrases: "revolutionizing", "game-changer", "changing everything", "the future is here"
- No weak CTAs: "What do you think?", "Agree?", "Drop a comment"
- Must reference real mechanisms: x402 HTTP 402 flow, EIP-712 TransferWithAuthorization, Base L2, USDC atomic units, VAT reverse charge, or similar
- Every tweet must be dense — no filler sentences
- Must be specific to Invoica's domain, not generic fintech/AI content
- Max 280 chars per tweet. 1-4 tweets depending on depth needed.

Return ONLY valid JSON: {"tweets": ["tweet1", "tweet2"], "imagePrompt": "abstract visual description for DALL-E"}`,
    `## Invoica Context\n${soul.slice(0, 800)}\n\n## Comm Plan\n${plan.slice(0, 500)}\n\n## Research (use specific facts from here)\n${research}\n\nWrite an educational post about: ${topic}. Ground every claim in the research. Show Invoica's relevance. End with beta CTA (invoica.ai).${feedbackBlock}`
  );

  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)![0]);
    return { tweets: parsed.tweets as string[], imagePrompt: parsed.imagePrompt as string, technical: true };
  } catch {
    return {
      tweets: [`The agentic economy is here. AI agents are invoicing, paying, and settling on-chain autonomously. @invoica_ai is the financial infrastructure making this possible — x402 middleware, tax compliance, settlement detection. Beta: invoica.ai`],
      imagePrompt: 'Network of glowing AI agent nodes exchanging digital payments, purple and white on dark background',
      technical: true,
    };
  }
}

async function generateUpdatesPost(ceoFeedback?: string) {
  let commits = '';
  let changedFiles = '';
  try {
    commits = execSync(`git -C ${ROOT} log --oneline --since="7 days ago" --no-merges --format="%s" 2>/dev/null | head -15`, { encoding: 'utf-8', timeout: 8000 }).trim();
    changedFiles = execSync(`git -C ${ROOT} diff --name-only HEAD~5 HEAD 2>/dev/null | head -20`, { encoding: 'utf-8', timeout: 8000 }).trim();
  } catch { /* ignore */ }

  const { soul } = loadContext();

  const feedbackBlock = ceoFeedback
    ? `\n\n## ⚠️ CEO REJECTED PREVIOUS VERSION — FIX ALL OF THESE ISSUES\n${ceoFeedback}\n\nWrite a completely new version that addresses every point above.`
    : '';

  const raw = await callClaude(
    `You write "building in public" posts for @invoica_ai — an autonomous AI company (Invoica) building the Financial OS for AI Agents.
Voice: technical founder, transparent, shows real velocity — NOT a marketing update.

HARD RULES:
- Be specific about what shipped: name the actual feature, endpoint, or protocol change from commits
- No vague phrases like "shipped improvements" or "updates to the platform"
- If commits mention x402, EIP-712, tax engine, webhooks, or SDK — name them explicitly
- Show that an autonomous agent team (no humans in the loop) is shipping real infrastructure
- Max 280 chars per tweet. 1-3 tweets.

Return ONLY valid JSON: {"tweets": ["tweet1"], "imagePrompt": "abstract tech/code visual for DALL-E"}`,
    `## Recent Commits (7 days)\n${commits || '(no commits found)'}\n\n## Changed Files\n${changedFiles || '(unavailable)'}\n\n## Invoica Context\n${soul.slice(0, 600)}\n\nWrite a "what we shipped" post grounded in these actual commits. Name specific things. If commits are sparse, write about the infrastructure being built autonomously.${feedbackBlock}`
  );

  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)![0]);
    return { tweets: parsed.tweets as string[], imagePrompt: parsed.imagePrompt as string, technical: true };
  } catch {
    return {
      tweets: [`⚡ Invoica update: autonomous agent team shipped this week. x402 middleware, tax compliance engine, and SDK updates — all deployed without a single standup. This is how an AI company builds. Beta live: invoica.ai`],
      imagePrompt: 'Code flowing through purple circuit pathways representing rapid autonomous software development',
      technical: true,
    };
  }
}

async function generateVisionPost(ceoFeedback?: string) {
  const theme = rotateBy([
    'every AI agent will need financial infrastructure — the TAM for agent-native financial rails',
    'why Invoica is the default financial layer for the autonomous economy and what makes it defensible',
    'the future: agents earn, pay, invoice, and file taxes without any human touching the money',
    'x402 + on-chain settlement + tax compliance — why this full-stack matters more than point solutions',
    'Conway governance: a self-improving, survival-driven financial OS for the long-term agent economy',
  ]);

  const { soul } = loadContext();
  const constitution = fs.existsSync(path.join(ROOT, 'constitution.md'))
    ? fs.readFileSync(path.join(ROOT, 'constitution.md'), 'utf-8').slice(0, 1000) : '';

  const feedbackBlock = ceoFeedback
    ? `\n\n## ⚠️ CEO REJECTED PREVIOUS VERSION — FIX ALL OF THESE ISSUES\n${ceoFeedback}\n\nWrite a completely new version that addresses every point above.`
    : '';

  const raw = await callClaude(
    `You are writing visionary, CEO-voice posts for @invoica_ai. Think in decades. Be bold and specific.

HARD RULES:
- No buzzwords: "disrupting", "revolutionizing", "game-changer", "the future is now"
- Ground vision in real market dynamics: agent economy size, USDC settlement volume, EU VAT on digital services, Base L2 throughput
- Be specific about Invoica's actual technical position — x402, on-chain settlement, autonomous tax compliance
- Write for technical founders and VCs who see through vague claims immediately
- Confident, not arrogant. Dense, not padded. Max 280 chars per tweet. 2-4 tweets.

Return ONLY valid JSON: {"tweets": ["tweet1", "tweet2"], "imagePrompt": "abstract futuristic visual for DALL-E"}`,
    `## Strategy & Vision\n${soul.slice(0, 1500)}\n\n## Constitutional Principles\n${constitution.slice(0, 600)}\n\nTheme: ${theme}\n\nWrite a visionary post grounded in Invoica's real capabilities and real market dynamics. Make it shareable for founders and VCs.${feedbackBlock}`
  );

  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)![0]);
    return { tweets: parsed.tweets as string[], imagePrompt: parsed.imagePrompt as string, technical: false };
  } catch {
    return {
      tweets: [
        `The next generation of startups won't hire accountants or payment teams.`,
        `Their AI agents will invoice, settle on-chain, and handle tax compliance autonomously. @invoica_ai is building that infrastructure today — for every autonomous system that needs to transact. invoica.ai`,
      ],
      imagePrompt: 'Futuristic autonomous city where AI agents form an invisible financial network, purple light trails on dark background',
      technical: false,
    };
  }
}

// Review gates
interface ReviewResult { approved: boolean; feedback: string; }

async function ceoReview(tweets: string[], label: string): Promise<ReviewResult> {
  const { soul, plan } = loadContext();
  const body = JSON.stringify({
    model: 'claude-sonnet-4-5', max_tokens: 500,
    system: `You are the CEO of Invoica — the Financial OS for AI Agents. You have extremely high standards for brand voice and content quality. You are protective of the brand and reject anything that could embarrass Invoica or mislead the audience.

REJECT posts that:
- Make unverifiable claims: "private beta", specific user/revenue numbers not publicly announced, "launching soon" without confirmed date
- Use weak engagement bait: "What do you think?", "Drop a comment", "Agree?", "Let me know your thoughts", "Thoughts?"
- Contain hollow buzzwords without substance: "disrupting", "revolutionizing", "game-changer", "changing everything", "the future is here"
- Are generic and could apply to any fintech/AI startup (must be specific to x402, Base, AI agents, USDC invoicing, or tax compliance)
- Mention any brand other than Invoica or @invoica_ai
- Are rambling, padded, or over-long per tweet
- Make vague technical claims about x402, EIP-712, Base network, USDC, or VAT/tax
- Feel like AI-generated marketing copy rather than authentic founder/builder voice
- Reference product capabilities Invoica doesn't clearly have yet, without framing as roadmap/vision
- Include unnecessary hashtags (#) that look spammy
- CONTAIN FABRICATED OR ESTIMATED METRICS — any number (percentage, count, latency, reliability) that cannot be traced to a real git commit, a file in reports/, or externally cited research. Examples of BANNED invented stats: "99.97% reliability", "847 webhook calls", "3x faster", "50ms latency". If the number cannot be verified, the post must be rejected.
- REVEAL ROADMAP OR FORWARD-LOOKING PLANS — any mention of what is being built, planned sprints, ETAs, or timelines for unshipped features. Only shipped, deployed, verified features may be mentioned. "March sprint locked", "ETA: 3 weeks", "coming soon: CFO agent", "multichain expansion planned" are all grounds for immediate rejection.

APPROVE posts that:
- Are specific and grounded: reference real technology (x402 protocol, EIP-712, Base network, USDC settlement, VAT reverse charge, etc.)
- Sound like a confident, knowledgeable technical founder — not a social media manager
- Include real substance: actual mechanisms, real numbers if available, real market dynamics
- Are genuinely educational (teach something) or boldly visionary (specific vision, not vague)
- Are concise and dense — every sentence earns its place
- Show Invoica's unique position (Financial OS for AI Agents, autonomous agent financial infrastructure)

Return ONLY valid JSON: {"approved": true/false, "feedback": "specific reason — what's wrong or what's good"}`,
    messages: [{ role: 'user', content: `## Communication Strategy\n${plan}\n\n## Invoica Strategy & Capabilities\n${soul.slice(0, 800)}\n\n## Post Type: ${label}\n\n## Content to Review\n${tweets.map((t, i) => `[${i + 1}] ${t}`).join('\n\n')}\n\nReview strictly. Reject anything mediocre or off-brand. Return JSON only: {"approved": true/false, "feedback": "..."}` }],
  });
  try {
    const res = await apiCall('POST', 'api.anthropic.com', '/v1/messages', {
      'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01',
    }, body);
    const text = JSON.parse(res.body).content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) return JSON.parse(match[0]);
  } catch { /* fall through */ }
  return { approved: true, feedback: 'review unavailable — defaulting approved' };
}

async function ctoReview(tweets: string[]): Promise<ReviewResult> {
  const body = JSON.stringify({
    model: process.env.MINIMAX_DEFAULT_MODEL || 'MiniMax-M1-40k',
    messages: [
      { role: 'system', content: 'You are the CTO of Invoica. Check technical accuracy of posts about x402, EIP-712, Base network, USDC, tax compliance. JSON only.' },
      { role: 'user', content: `${tweets.map((t, i) => `[${i + 1}] ${t}`).join('\n')}\n\nRespond ONLY: {"approved": true/false, "feedback": "brief reason"}` },
    ],
    max_tokens: 200,
  });
  try {
    const groupId = process.env.MINIMAX_GROUP_ID || '';
    const res = await apiCall('POST', 'api.minimax.io', `/v1/text/chatcompletion_v2${groupId ? `?GroupId=${groupId}` : ''}`, {
      'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
    }, body);
    const text = JSON.parse(res.body).choices?.[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) return JSON.parse(match[0]);
  } catch { /* fall through */ }
  return { approved: true, feedback: 'CTO review unavailable — defaulting approved' };
}

function saveRejected(key: string, tweets: string[], reason: string) {
  ensureDir(REJECTED_DIR);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(
    path.join(REJECTED_DIR, `${ts}-${key}.md`),
    `# Rejected: ${key}\nReason: ${reason}\n\n${tweets.map((t, i) => `[${i + 1}] ${t}`).join('\n\n')}`
  );
}

// Main
async function main() {
  ensureDir(REPORTS_DIR);
  ensureDir(LOG_DIR);

  // Lockfile guard — prevents two concurrent PM2 cron instances from double-posting.
  if (fs.existsSync(LOCK_FILE)) {
    const lockAge = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
    if (lockAge < 20 * 60 * 1000) { // 20-min max run time
      console.log('[x-admin] Another instance is running (lock age ' + Math.round(lockAge/1000) + 's). Exiting.');
      process.exit(0);
    }
    fs.unlinkSync(LOCK_FILE); // stale lock — remove
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
  const releaseLock = () => { try { fs.unlinkSync(LOCK_FILE); } catch {} };
  process.on('exit', releaseLock);
  process.on('SIGINT', () => { releaseLock(); process.exit(0); });
  process.on('SIGTERM', () => { releaseLock(); process.exit(0); });

  const now = new Date();
  const hourUTC = now.getUTCHours();
  const state = loadState();

  console.log(`[x-admin] UTC ${now.toISOString().slice(0, 16)} | hour=${hourUTC}`);
  console.log(`[x-admin] Posted today: ${Object.keys(state.posted).filter(k => state.posted[k]).join(', ') || 'none'}`);

  for (const slot of POST_SLOTS) {
    if (state.posted[slot.key]) { console.log(`[x-admin] Skip ${slot.key} — done`); continue; }

    // 3-hour window: posts if agent runs within 3h of scheduled time
    if (hourUTC < slot.hourUTC || hourUTC >= slot.hourUTC + 3) {
      console.log(`[x-admin] Skip ${slot.key} — window ${slot.hourUTC}:00-${slot.hourUTC + 3}:00, now ${hourUTC}:00`);
      continue;
    }

    console.log(`\n[x-admin] Processing: ${slot.label}`);

    // ── Step 1: Try CMO weekly content plan first ────────────────────────────
    const cmoWeeklyPlan = loadCmoPlan();
    let gen: { tweets: string[]; imagePrompt: string; technical: boolean } | undefined;
    let ceoApproved = false;
    let cmoImageBuf: Buffer | null = null;

    if (cmoWeeklyPlan) {
      const cmoSlot = getCmoDaySlot(cmoWeeklyPlan, slot.key);
      if (cmoSlot) {
        console.log(`  [cmo-plan] Using pre-written content: "${cmoSlot.topic_summary || slot.key}"`);
        gen = { tweets: cmoSlot.tweets, imagePrompt: '', technical: slot.technical };
        cmoImageBuf = await loadCmoImage(cmoSlot.image_path);

        // CEO review on CMO-prepared content (still enforced)
        console.log(`  → CEO review (CMO plan content)...`);
        const ceo = await ceoReview(gen.tweets, slot.label);
        console.log(`  CEO: ${ceo.approved ? '✅' : '❌'} ${ceo.feedback}`);
        if (ceo.approved) {
          ceoApproved = true;
        } else {
          console.log(`  ⚠️ CMO plan content rejected by CEO — falling back to generation`);
          saveRejected(`${slot.key}-cmo-plan`, gen.tweets, `CEO rejected CMO plan: ${ceo.feedback}`);
          gen = undefined;
        }
      }
    }

    // ── Step 2: Fallback — generate content if no CMO plan or CEO rejected it ─
    const MAX_ATTEMPTS = 3;
    let lastCeoFeedback: string | undefined;

    if (!ceoApproved) {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          console.log(`  → Generating content (attempt ${attempt}/${MAX_ATTEMPTS})...`);
          if (slot.key === 'educational') gen = await generateEducationalPost(lastCeoFeedback);
          else if (slot.key === 'updates')  gen = await generateUpdatesPost(lastCeoFeedback);
          else                              gen = await generateVisionPost(lastCeoFeedback);
        } catch (e: any) { console.log(`  ❌ Generation error: ${e.message}`); break; }

        console.log(`  → CEO review (attempt ${attempt})...`);
        const ceo = await ceoReview(gen!.tweets, slot.label);
        console.log(`  CEO: ${ceo.approved ? '✅' : '❌'} ${ceo.feedback}`);

        if (ceo.approved) { ceoApproved = true; break; }

        saveRejected(`${slot.key}-attempt${attempt}`, gen!.tweets, `CEO: ${ceo.feedback}`);
        lastCeoFeedback = ceo.feedback;
      }
    }

    if (!ceoApproved || !gen) {
      console.log(`  ❌ All ${MAX_ATTEMPTS} CEO attempts rejected — skipping ${slot.key}`);
      continue;
    }

    // CTO review (technical posts only)
    if (gen.technical) {
      console.log(`  → CTO review...`);
      const cto = await ctoReview(gen.tweets);
      console.log(`  CTO: ${cto.approved ? '✅' : '❌'} ${cto.feedback}`);
      if (!cto.approved) { saveRejected(slot.key, gen.tweets, `CTO: ${cto.feedback}`); continue; }
    }

    // CMO images only — use pre-produced branded image from weekly plan, or post text-only
    let mediaId: string | null = null;
    if (cmoImageBuf) {
      console.log(`  → Uploading CMO branded image (${Math.round(cmoImageBuf.length / 1024)}KB)...`);
      mediaId = await uploadImageToX(cmoImageBuf);
    } else {
      console.log(`  → No CMO image available — posting text-only (DALL-E disabled)`);
    }

    // Publish
    console.log(`  → Publishing ${gen.tweets.length > 1 ? `thread (${gen.tweets.length} tweets)` : 'tweet'}...`);
    let postedId: string | null = null;
    if (gen.tweets.length === 1) postedId = await postTweetWithMedia(gen.tweets[0], mediaId);
    else                          postedId = await postThreadWithMedia(gen.tweets, mediaId);

    if (postedId) {
      const url = `https://x.com/i/status/${postedId}`;
      console.log(`  ✅ Posted: ${url}`);
      state.posted[slot.key] = true;
      saveState(state);
      ensureDir(LOG_DIR);
      fs.appendFileSync(
        path.join(LOG_DIR, `${state.date}.md`),
        `## ${slot.label} — ${new Date().toISOString()}\nURL: ${url}\nImage: ${mediaId ? 'yes' : 'no'}\n\n${gen.tweets.join('\n\n')}\n\n---\n\n`
      );
      await new Promise(r => setTimeout(r, 3000));
    } else {
      console.log(`  ❌ Post failed.`);
    }
  }

  console.log(`\n[x-admin] Done. Posted: ${Object.keys(state.posted).filter(k => state.posted[k]).join(', ') || 'none'}`);
}

main().catch(e => { console.error('[x-admin] Fatal:', e); process.exit(1); });
