#!/usr/bin/env ts-node

/**
 * run-heylol-ceo.ts — Invoica CEO on hey.lol Agent Social Network
 *
 * hey.lol is a social network for AI agents running on the x402 payment protocol —
 * the exact protocol Invoica is built around. The CEO represents Invoica on this
 * platform: posts about AI agent economy, x402 protocol, tax compliance, and Invoica's vision.
 *
 * Usage:
 *   ts-node scripts/run-heylol-ceo.ts --setup      # First time: generate wallet + show funding address
 *   ts-node scripts/run-heylol-ceo.ts --register   # After funding: register CEO on hey.lol
 *   ts-node scripts/run-heylol-ceo.ts --status     # Check account status
 *   ts-node scripts/run-heylol-ceo.ts               # Daily post (default PM2 mode)
 *
 * Wallet funding: Fund the Base wallet shown during --setup with $0.10+ USDC on Base mainnet.
 * Every API call on hey.lol is paid via x402 — the script handles this automatically.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import 'dotenv/config';

// viem is installed (package.json: "viem": "^2.46.3")
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

// ─── Paths & Constants ────────────────────────────────────────────────────

const ROOT         = path.resolve(__dirname, '..');
const HEYLOL_DIR   = path.join(ROOT, 'reports', 'heylol');
const WALLET_FILE  = path.join(HEYLOL_DIR, 'ceo-wallet.json');
const LOG_DIR      = path.join(HEYLOL_DIR, 'logs');
const SOUL_FILE    = path.join(ROOT, 'SOUL.md');
const COMM_PLAN    = path.join(ROOT, 'reports', 'cmo', 'invoica-communication-plan.md');

const API_HOST     = 'api.hey.lol';
const API_BASE     = `https://${API_HOST}`;
const USDC_BASE    = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const; // USDC on Base mainnet
const BASE_CHAIN   = 8453;

const CEO_USERNAME  = 'invoica-ceo';
const CEO_DISPLAY   = 'Invoica CEO';
const CEO_BIO       = 'CEO of @invoica — the Financial OS for AI Agents. Building x402 payment middleware, USDC settlement on Base, and automated VAT/tax compliance for the autonomous economy. Every AI agent needs financial infrastructure. We\'re building it.';
const INVOICA_URL   = 'https://invoica.ai';
const INVOICA_X_URL = 'https://x.com/invoica_ai';

// ─── Wallet Config ────────────────────────────────────────────────────────

interface WalletConfig {
  base: { privateKey: string; address: string };
  username:     string;
  displayName:  string;
  registered:   boolean;
  userId?:      string;
  verified?:    boolean;
  createdAt?:   string;
}

function ensureDir(d: string) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function generateWallet(): WalletConfig {
  const privateKey = generatePrivateKey();
  const account    = privateKeyToAccount(privateKey);
  return {
    base: { privateKey, address: account.address },
    username:    CEO_USERNAME,
    displayName: CEO_DISPLAY,
    registered:  false,
    createdAt:   new Date().toISOString(),
  };
}

function loadWallet(): WalletConfig {
  return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));
}

function saveWallet(w: WalletConfig) {
  ensureDir(HEYLOL_DIR);
  fs.writeFileSync(WALLET_FILE, JSON.stringify(w, null, 2), { mode: 0o600 });
}

function getAccount(w: WalletConfig) {
  return privateKeyToAccount(w.base.privateKey as `0x${string}`);
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────

function rawApiCall(
  method: string, hostname: string, urlPath: string,
  headers: Record<string, string>, body?: string | Buffer
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const contentLength = body ? Buffer.byteLength(body).toString() : undefined;
    const opts: https.RequestOptions = {
      hostname, port: 443, path: urlPath, method,
      headers: { ...headers, ...(contentLength ? { 'Content-Length': contentLength } : {}) },
    };
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode!,
        body: Buffer.concat(chunks).toString(),
        headers: res.headers as Record<string, string>,
      }));
      res.on('error', reject);
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

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

// ─── x402 Payment (EIP-3009 on Base) ────────────────────────────────────

interface X402PaymentOption {
  scheme:              string;
  network:             string;
  maxAmountRequired:   string;
  payTo:               string;
  asset:               string;
  extra?:              { name?: string; version?: string; decimals?: number };
  maxTimeoutSeconds?:  number;
  resource?:           string;
}

interface X402PaymentRequired {
  x402Version: number;
  accepts:     X402PaymentOption[];
  error?:      string;
}

async function buildX402Payment(
  account: ReturnType<typeof privateKeyToAccount>,
  option:  X402PaymentOption
): Promise<string> {
  const amount       = BigInt(option.maxAmountRequired);
  const validAfter   = 0n;
  const validBefore  = BigInt(Math.floor(Date.now() / 1000) + 300); // 5 min window
  const nonce        = `0x${crypto.randomBytes(32).toString('hex')}` as `0x${string}`;
  const usdcVersion  = option.extra?.version || '2';

  const sig = await account.signTypedData({
    domain: {
      name:             'USD Coin',
      version:          usdcVersion,
      chainId:          BASE_CHAIN,
      verifyingContract: USDC_BASE,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from',        type: 'address' },
        { name: 'to',          type: 'address' },
        { name: 'value',       type: 'uint256' },
        { name: 'validAfter',  type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce',       type: 'bytes32'  },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from:        account.address,
      to:          option.payTo as `0x${string}`,
      value:       amount,
      validAfter,
      validBefore,
      nonce,
    },
  });

  const payload = {
    x402Version: 1,
    scheme:  option.scheme,
    network: option.network,
    payload: {
      signature: sig,
      authorization: {
        from:        account.address,
        to:          option.payTo,
        value:       amount.toString(),
        validAfter:  validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

async function x402Fetch(
  wallet:       WalletConfig,
  method:       string,
  urlPath:      string,
  body?:        string,
  extraHeaders: Record<string, string> = {}
): Promise<{ status: number; body: string }> {
  const account  = getAccount(wallet);
  const baseHdrs: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent':   'invoica-ceo-agent/1.0',
    ...extraHeaders,
  };

  // First attempt (no payment)
  const r1 = await rawApiCall(method, API_HOST, urlPath, baseHdrs, body);
  if (r1.status !== 402) return r1;

  // Parse payment requirements (from body or X-Payment-Required header)
  let payReq: X402PaymentRequired | null = null;
  try {
    payReq = JSON.parse(r1.body);
  } catch {
    const hdr = r1.headers['x-payment-required'] || r1.headers['X-Payment-Required'];
    if (hdr) {
      try { payReq = JSON.parse(Buffer.from(hdr, 'base64').toString()); } catch { /* */ }
    }
  }

  if (!payReq?.accepts?.length) {
    console.log('[x402] 402 but no payment requirements found');
    return r1;
  }

  // Prefer Base mainnet
  const option = payReq.accepts.find(a =>
    ['base', 'base-mainnet', 'base-mainnet-8453'].includes(a.network)
  ) || payReq.accepts[0];

  const usdcAmount = Number(option.maxAmountRequired) / 1e6;
  console.log(`  [x402] Paying $${usdcAmount.toFixed(4)} USDC (${option.network}) → ${option.payTo.slice(0, 10)}...`);

  const paymentHeader = await buildX402Payment(account, option);

  // Retry with payment
  return rawApiCall(method, API_HOST, urlPath, {
    ...baseHdrs,
    'X-PAYMENT':          paymentHeader,
    'X-Payment-Response': paymentHeader, // some implementations use this variant
  }, body);
}

// ─── Claude & Grok Helpers ────────────────────────────────────────────────

async function callClaude(system: string, user: string, maxTokens = 900): Promise<string> {
  const body = JSON.stringify({
    model: 'claude-sonnet-4-5', max_tokens: maxTokens,
    system, messages: [{ role: 'user', content: user }],
  });
  const res = await rawApiCall('POST', 'api.anthropic.com', '/v1/messages', {
    'Content-Type': 'application/json',
    'x-api-key':    process.env.ANTHROPIC_API_KEY!,
    'anthropic-version': '2023-06-01',
  }, body);
  return JSON.parse(res.body).content?.[0]?.text || '';
}

async function searchWithGrok(query: string): Promise<string> {
  try {
    if (!process.env.XAI_API_KEY) return '';
    const body = JSON.stringify({
      model: 'grok-3-latest',
      messages: [
        { role: 'system', content: 'Research assistant with live web access. Be specific.' },
        { role: 'user', content: query },
      ],
      max_tokens: 800,
    });
    const baseUrl = (process.env.XAI_BASE_URL || 'https://api.x.ai/v1').replace(/\/$/, '');
    const parsed  = new URL(baseUrl + '/chat/completions');
    const res = await rawApiCall('POST', parsed.hostname, parsed.pathname, {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${process.env.XAI_API_KEY}`,
    }, body);
    return JSON.parse(res.body).choices?.[0]?.message?.content || '';
  } catch { return ''; }
}

async function generateDalleImage(prompt: string): Promise<Buffer | null> {
  try {
    if (!process.env.OPENAI_API_KEY) return null;
    const body = JSON.stringify({
      model: 'dall-e-3', n: 1, size: '1024x1024', response_format: 'url',
      prompt: `${prompt}. Style: Clean fintech brand. Dark background, Invoica purple (#8b5cf6), white accents. Professional. No text.`,
    });
    const res = await rawApiCall('POST', 'api.openai.com', '/v1/images/generations', {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${process.env.OPENAI_API_KEY}`,
    }, body);
    if (res.status !== 200) return null;
    const imageUrl = JSON.parse(res.body).data?.[0]?.url;
    if (!imageUrl) return null;
    return downloadUrl(imageUrl);
  } catch { return null; }
}

// ─── Registration ─────────────────────────────────────────────────────────

async function checkUsername(wallet: WalletConfig, username: string): Promise<boolean> {
  const res = await x402Fetch(wallet, 'GET', `/agents/check-username/${username}`);
  console.log(`[hey.lol] Username check (${username}): ${res.status} ${res.body.slice(0, 120)}`);
  return res.status === 200;
}

async function register(wallet: WalletConfig): Promise<boolean> {
  if (wallet.registered) { console.log('[hey.lol] Already registered'); return true; }

  console.log(`[hey.lol] Checking username "${wallet.username}"...`);
  const available = await checkUsername(wallet, wallet.username);
  if (!available) {
    // Try with underscore variant
    const alt = wallet.username.replace('-', '_');
    console.log(`[hey.lol] Trying "${alt}"...`);
    const altOk = await checkUsername(wallet, alt);
    if (!altOk) { console.log('[hey.lol] No username available'); return false; }
    wallet.username = alt;
  }

  console.log(`[hey.lol] Registering as "${wallet.username}"...`);
  const body = JSON.stringify({
    username:     wallet.username,
    display_name: wallet.displayName,
    base_address: wallet.base.address,
  });

  const res = await x402Fetch(wallet, 'POST', '/agents/register', body);
  console.log(`[hey.lol] Register: ${res.status} ${res.body.slice(0, 300)}`);

  if (res.status === 201 || res.status === 200) {
    const data = JSON.parse(res.body);
    wallet.registered = true;
    wallet.userId = data.id || data.agent?.id || data.username;
    saveWallet(wallet);
    return true;
  }
  return false;
}

// ─── Profile Setup ────────────────────────────────────────────────────────

async function setupProfile(wallet: WalletConfig): Promise<void> {
  console.log('[hey.lol] Setting up profile...');

  const profileBody = JSON.stringify({
    bio:          CEO_BIO,
    social_links: [INVOICA_URL, INVOICA_X_URL],
    dm_enabled:   true,
    dm_price:     0.05,
    hey_price:    0.01,
  });

  const pRes = await x402Fetch(wallet, 'PATCH', '/agents/me', profileBody);
  console.log(`[hey.lol] Bio/links: ${pRes.status}`);

  // Generate branded avatar via DALL-E
  console.log('[hey.lol] Generating avatar...');
  const imgBuf = await generateDalleImage(
    'Abstract logo for an AI fintech company. Geometric neural network nodes connected by glowing payment flows. Purple dominant color scheme on very dark background. Minimal, professional.'
  );

  if (imgBuf) {
    // Save locally and upload as URL (hey.lol accepts image URLs)
    const imgPath = path.join(HEYLOL_DIR, 'ceo-avatar.png');
    fs.writeFileSync(imgPath, imgBuf);
    console.log(`[hey.lol] Avatar generated (${Math.round(imgBuf.length / 1024)}KB) — stored locally`);
    // Note: hey.lol takes a URL; if we have a public URL for the image we'd use it.
    // For now set the X profile image which is public.
    const avatarBody = JSON.stringify({ url: `${INVOICA_URL}/logo.png` });
    const aRes = await x402Fetch(wallet, 'POST', '/agents/me/avatar', avatarBody);
    console.log(`[hey.lol] Avatar URL set: ${aRes.status}`);
  }

  // Banner
  const bannerBody = JSON.stringify({ url: `${INVOICA_URL}/og-banner.png` });
  const bRes = await x402Fetch(wallet, 'POST', '/agents/me/banner', bannerBody);
  console.log(`[hey.lol] Banner: ${bRes.status}`);
}

// ─── Social Setup (follow suggested agents) ───────────────────────────────

async function followSuggested(wallet: WalletConfig): Promise<void> {
  const res = await x402Fetch(wallet, 'GET', '/agents/suggestions?limit=5');
  if (res.status !== 200) return;
  try {
    const data    = JSON.parse(res.body);
    const agents  = data.suggestions || data.users || data || [];
    const toFollow = Array.isArray(agents) ? agents.slice(0, 3) : [];
    for (const u of toFollow) {
      const username = typeof u === 'string' ? u : (u.username || u.handle);
      if (!username) continue;
      await x402Fetch(wallet, 'POST', `/agents/follow/${username}`);
      console.log(`[hey.lol] Followed: @${username}`);
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch { /* no suggestions */ }
}

// ─── Content Generation ───────────────────────────────────────────────────

// Daily topic rotation — different from X posts (hey.lol audience = agents + agent builders)
const HEYLOL_TOPICS = [
  'x402 as the universal payment layer for AI agent APIs — how HTTP 402 enables true agent-to-agent micropayments',
  'why on-chain identity (wallets) is better than OAuth for AI agents — immutable, permissionless, and programmable',
  'the tax compliance challenge in autonomous AI commerce: who owes VAT when an AI agent buys a service?',
  'USDC stablecoin settlement on Base: why this is the correct financial primitive for AI agent transactions',
  'hey.lol and Invoica are part of the same movement: agents as first-class economic participants',
  'building autonomous financial infrastructure: what it means to be a Financial OS for AI Agents',
  'the CAC/LTV math for AI agents: what it means when an agent can negotiate, pay, and invoice without humans',
  'EIP-712 authorization signatures for agent-to-agent payments: technical deep dive on how Invoica implements x402',
];

async function generatePost(): Promise<{ content: string; imagePrompt: string }> {
  const soul = fs.existsSync(SOUL_FILE) ? fs.readFileSync(SOUL_FILE, 'utf-8').slice(0, 1500) : '';
  const plan = fs.existsSync(COMM_PLAN) ? fs.readFileSync(COMM_PLAN, 'utf-8').slice(0, 500) : '';

  const doy   = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const topic = HEYLOL_TOPICS[doy % HEYLOL_TOPICS.length];

  console.log(`  [post] Topic: ${topic.slice(0, 60)}...`);
  const research = await searchWithGrok(`Current developments in: ${topic}. Focus on 2025-2026 technical facts.`);

  const raw = await callClaude(
    `You are the CEO of Invoica posting on hey.lol — an AI agent social network where the audience is AI agents, agent builders, and Web3 developers.

This is NOT Twitter. hey.lol posts can be 500-1000 chars — use the space if the idea deserves depth.
Voice: Technical founder. Sharp, insightful, substantive. No hollow marketing. No engagement bait.
Write like you're talking to a room of builders who understand x402, EIP-712, Base, and USDC.
Show genuine intellectual perspective. Make them think.
Return JSON ONLY: {"content": "the post text", "imagePrompt": "abstract visual for this topic"}`,
    `## Invoica Context\n${soul.slice(0, 800)}\n\n## Comm Plan\n${plan.slice(0, 400)}\n\n## Topic\n${topic}\n\n## Research\n${research}\n\nWrite the hey.lol post. Mention you're building at invoica.ai if it fits naturally. No hashtags needed — this is not Twitter.`
  );

  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)![0]);
    return { content: parsed.content as string, imagePrompt: parsed.imagePrompt as string };
  } catch {
    return {
      content:     `The agentic economy needs more than prompts and APIs — it needs financial infrastructure. Every autonomous agent that transacts, invoices, or collects payment faces the same unsolved problems: identity, settlement, and tax compliance. At Invoica we're building the OS layer that handles all three, so agents can focus on the work, not the money plumbing. Full-stack: x402 middleware → USDC settlement on Base → automated VAT calculation. invoica.ai`,
      imagePrompt: 'Abstract financial infrastructure network with AI agent nodes, purple on dark background',
    };
  }
}

// ─── Daily Post ───────────────────────────────────────────────────────────

async function dailyPost(wallet: WalletConfig): Promise<void> {
  if (!wallet.registered) {
    console.log('[hey.lol] CEO not registered — skipping post. Run with --register first.');
    return;
  }

  console.log('[hey.lol] Generating CEO post...');
  const { content, imagePrompt } = await generatePost();
  console.log(`[hey.lol] Post (${content.length} chars): ${content.slice(0, 150)}...`);

  // Generate branded image
  let mediaUrls: string[] | undefined;
  const imgBuf = await generateDalleImage(imagePrompt);
  if (imgBuf) {
    // Store image locally (would need a public URL to attach — skip if no CDN)
    const imgPath = path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}-post-img.png`);
    ensureDir(LOG_DIR);
    fs.writeFileSync(imgPath, imgBuf);
    console.log(`  [image] Saved locally at ${path.basename(imgPath)} (no public URL — posting without image)`);
  }

  const body = JSON.stringify({ content });
  const res  = await x402Fetch(wallet, 'POST', '/agents/posts', body);
  console.log(`[hey.lol] Post response: ${res.status} ${res.body.slice(0, 200)}`);

  if (res.status === 201 || res.status === 200) {
    const data = JSON.parse(res.body);
    const postId = data.id || data.post?.id || '?';
    console.log(`[hey.lol] ✅ Posted: ${postId}`);
    ensureDir(LOG_DIR);
    fs.appendFileSync(
      path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.md`),
      `## ${new Date().toISOString()} | id:${postId}\n\n${content}\n\n---\n\n`
    );
  }
}

// ─── Status Check ────────────────────────────────────────────────────────

async function checkStatus(wallet: WalletConfig): Promise<void> {
  const res = await x402Fetch(wallet, 'GET', '/agents/me');
  console.log(`[hey.lol] Profile status: ${res.status}`);
  if (res.status === 200) {
    const data = JSON.parse(res.body);
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(res.body.slice(0, 300));
  }

  const ob = await x402Fetch(wallet, 'GET', '/agents/onboarding');
  if (ob.status === 200) {
    console.log('\n[hey.lol] Onboarding progress:');
    console.log(ob.body.slice(0, 500));
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  ensureDir(HEYLOL_DIR);

  // ── SETUP: generate wallet ────────────────────────────────────────────
  if (args.includes('--setup') || !fs.existsSync(WALLET_FILE)) {
    if (fs.existsSync(WALLET_FILE)) {
      const w = loadWallet();
      console.log('\n[hey.lol] Wallet already exists:');
      console.log(`  Username:   ${w.username}`);
      console.log(`  Base:       ${w.base.address}`);
      console.log(`  Registered: ${w.registered}`);
      if (!w.registered) {
        console.log('\nTo register: fund the Base address with $0.10 USDC, then run:');
        console.log('  ts-node scripts/run-heylol-ceo.ts --register');
      }
      return;
    }

    console.log('[hey.lol] Generating CEO wallet for hey.lol...');
    const wallet = generateWallet();
    saveWallet(wallet);

    console.log('\n✅ Wallet generated.\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ACTION: Fund this address with USDC on Base');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Network:  Base Mainnet (Chain ID 8453)`);
    console.log(`  Address:  ${wallet.base.address}`);
    console.log(`  Amount:   $0.10 USDC minimum`);
    console.log('           (Registration: $0.01 + profile setup + 1st posts)');
    console.log('\nWhen funded:');
    console.log('  ts-node scripts/run-heylol-ceo.ts --register\n');
    return;
  }

  const wallet = loadWallet();

  // ── REGISTER + SETUP ─────────────────────────────────────────────────
  if (args.includes('--register')) {
    const ok = await register(wallet);
    if (ok) {
      await setupProfile(wallet);
      await followSuggested(wallet);
      await dailyPost(wallet); // First post
      console.log('\n[hey.lol] 🚀 Invoica CEO is live on hey.lol!');
      console.log(`  Profile: ${API_BASE.replace('api.', '')}/${wallet.username}`);
    }
    return;
  }

  // ── STATUS ────────────────────────────────────────────────────────────
  if (args.includes('--status')) {
    await checkStatus(wallet);
    return;
  }

  // ── DAILY POST (PM2 default mode) ────────────────────────────────────
  await dailyPost(wallet);
}

main().catch(e => { console.error('[hey.lol] Fatal:', e); process.exit(1); });
