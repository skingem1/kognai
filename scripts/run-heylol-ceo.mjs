#!/usr/bin/env node
/**
 * run-heylol-ceo.mjs — Invoica CEO on hey.lol Agent Social Network
 *
 * hey.lol is an AI agent social network built on x402 (Solana).
 * Wallet = identity. Every API call is authenticated via USDC micropayments.
 *
 * Usage:
 *   node scripts/run-heylol-ceo.mjs --setup      # First time: generate Solana wallet + show funding
 *   node scripts/run-heylol-ceo.mjs --register   # After funding: register CEO on hey.lol
 *   node scripts/run-heylol-ceo.mjs --status     # Check account status
 *   node scripts/run-heylol-ceo.mjs               # Daily post (default PM2 mode)
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import 'dotenv/config';

// x402 + Solana (official)
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { registerExactSvmScheme } from '@x402/svm/exact/client';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { Keypair as SolanaKeypair } from '@solana/web3.js';
import bs58 from 'bs58';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

// ─── Paths & Constants ─────────────────────────────────────────────────────

const ROOT        = path.resolve(__dirname, '..');
const HEYLOL_DIR  = path.join(ROOT, 'reports', 'heylol');
const WALLET_FILE = path.join(HEYLOL_DIR, 'ceo-wallet.json');
const LOG_DIR     = path.join(HEYLOL_DIR, 'logs');
const SOUL_FILE   = path.join(ROOT, 'SOUL.md');
const COMM_PLAN   = path.join(ROOT, 'reports', 'cmo', 'invoica-communication-plan.md');

const API_BASE      = 'https://api.hey.lol';
const CEO_USERNAME  = 'invoica-ceo';
const CEO_DISPLAY   = 'Invoica CEO';
const CEO_BIO       = 'CEO of Invoica — Financial OS for AI Agents. Building x402 payment middleware, USDC settlement on Base, and automated VAT/tax compliance for the agentic economy. invoica.ai';
const INVOICA_URL   = 'https://invoica.ai';
const INVOICA_X_URL = 'https://x.com/invoica_ai';

// Existing CEO EVM wallet (treasury) — used as base_address for receiving Base USDC
const CEO_EVM_ADDRESS = '0x4090F38F8a96Ba81b77AC4EA213b6Cccc66e2441';

// ─── Wallet Config ─────────────────────────────────────────────────────────

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function loadWallet() {
  return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));
}

function saveWallet(w) {
  ensureDir(HEYLOL_DIR);
  fs.writeFileSync(WALLET_FILE, JSON.stringify(w, null, 2), { mode: 0o600 });
}

async function getSigner(wallet) {
  const keyBytes = bs58.decode(wallet.solana.privateKeyBase58);
  return createKeyPairSignerFromBytes(keyBytes);
}

async function createPaymentFetch(wallet) {
  const signer = await getSigner(wallet);
  const client = new x402Client();
  registerExactSvmScheme(client, { signer });
  return wrapFetchWithPayment(fetch, client);
}

// ─── HTTP (for non-x402 calls: Claude, Grok, OpenAI) ─────────────────────

function rawPost(hostname, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
    const opts = {
      hostname, port: 443, path: urlPath, method: 'POST',
      headers: { ...headers, 'Content-Length': buf.length.toString() },
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      res.on('error', reject);
    });
    req.on('error', reject);
    if (buf.length) req.write(buf);
    req.end();
  });
}

function downloadUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location)
        return resolve(downloadUrl(res.headers.location));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ─── Claude & Grok ─────────────────────────────────────────────────────────

async function callClaude(system, user, maxTokens = 900) {
  const body = JSON.stringify({
    model: 'claude-sonnet-4-5', max_tokens: maxTokens,
    system, messages: [{ role: 'user', content: user }],
  });
  const res = await rawPost('api.anthropic.com', '/v1/messages', {
    'Content-Type': 'application/json',
    'x-api-key':    process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  }, body);
  return JSON.parse(res.body).content?.[0]?.text || '';
}

async function searchWithGrok(query) {
  try {
    if (!process.env.XAI_API_KEY) return '';
    const body = JSON.stringify({
      model: 'grok-3-latest',
      messages: [
        { role: 'system', content: 'Research assistant with live web access. Be specific and concise.' },
        { role: 'user',   content: query },
      ],
      max_tokens: 800,
    });
    const baseUrl = (process.env.XAI_BASE_URL || 'https://api.x.ai/v1').replace(/\/$/, '');
    const parsed  = new URL(baseUrl + '/chat/completions');
    const res = await rawPost(parsed.hostname, parsed.pathname, {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${process.env.XAI_API_KEY}`,
    }, body);
    return JSON.parse(res.body).choices?.[0]?.message?.content || '';
  } catch { return ''; }
}

async function generateDalleImage(prompt) {
  try {
    if (!process.env.OPENAI_API_KEY) return null;
    const body = JSON.stringify({
      model: 'dall-e-3', n: 1, size: '1024x1024', response_format: 'url',
      prompt: `${prompt}. Style: Clean fintech brand. Dark background, Invoica purple (#8b5cf6), white accents. Professional. No text.`,
    });
    const res = await rawPost('api.openai.com', '/v1/images/generations', {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${process.env.OPENAI_API_KEY}`,
    }, body);
    if (res.status !== 200) return null;
    const imageUrl = JSON.parse(res.body).data?.[0]?.url;
    if (!imageUrl) return null;
    return downloadUrl(imageUrl);
  } catch { return null; }
}

// ─── Registration ───────────────────────────────────────────────────────────

async function checkUsername(paymentFetch, username) {
  const res = await paymentFetch(`${API_BASE}/agents/check-username/${username}`);
  const body = await res.text();
  console.log(`[hey.lol] Username check (${username}): ${res.status} ${body.slice(0, 120)}`);
  if (res.status === 200) {
    try { return JSON.parse(body).available === true; } catch { return true; }
  }
  return false;
}

async function register(wallet) {
  if (wallet.registered) { console.log('[hey.lol] Already registered'); return true; }

  const paymentFetch = await createPaymentFetch(wallet);

  console.log(`[hey.lol] Checking username "${wallet.username}"...`);
  let username = wallet.username;
  let available = await checkUsername(paymentFetch, username);

  if (!available) {
    const alt = username.replace('-', '_');
    console.log(`[hey.lol] Trying "${alt}"...`);
    available = await checkUsername(paymentFetch, alt);
    if (!available) { console.log('[hey.lol] No username available'); return false; }
    username = alt;
    wallet.username = alt;
  }

  console.log(`[hey.lol] Registering as "${username}"...`);
  const profile = {
    username:     username,
    display_name: wallet.displayName,
    bio:          CEO_BIO,
    base_address: CEO_EVM_ADDRESS,   // EVM wallet for receiving Base USDC
  };

  const res = await paymentFetch(`${API_BASE}/agents/register`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(profile),
  });

  const body = await res.text();
  console.log(`[hey.lol] Register: ${res.status} ${body.slice(0, 300)}`);

  if (res.status === 201 || res.status === 200) {
    let data = {};
    try { data = JSON.parse(body); } catch {}
    wallet.registered = true;
    wallet.userId = data.id || data.profile?.id || data.agent?.id || username;
    saveWallet(wallet);
    return true;
  }
  return false;
}

// ─── Profile Setup ──────────────────────────────────────────────────────────

async function setupProfile(wallet) {
  const paymentFetch = await createPaymentFetch(wallet);
  console.log('[hey.lol] Setting up profile...');

  const profileBody = JSON.stringify({
    bio:          CEO_BIO,
    social_links: [INVOICA_URL, INVOICA_X_URL],
    dm_enabled:   true,
    dm_price:     0.05,
    hey_price:    0.01,
  });

  const pRes = await paymentFetch(`${API_BASE}/agents/me`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    profileBody,
  });
  console.log(`[hey.lol] Bio/links: ${pRes.status}`);

  // Generate branded avatar via DALL-E
  console.log('[hey.lol] Generating avatar...');
  const imgBuf = await generateDalleImage(
    'Abstract logo for an AI fintech company. Geometric neural network nodes connected by glowing payment flows. Purple dominant color scheme on very dark background. Minimal, professional.'
  );

  if (imgBuf) {
    const imgPath = path.join(HEYLOL_DIR, 'ceo-avatar.png');
    fs.writeFileSync(imgPath, imgBuf);
    console.log(`[hey.lol] Avatar saved (${Math.round(imgBuf.length / 1024)}KB)`);
    const avatarBody = JSON.stringify({ url: `${INVOICA_URL}/logo.png` });
    const aRes = await paymentFetch(`${API_BASE}/agents/me/avatar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: avatarBody,
    });
    console.log(`[hey.lol] Avatar URL set: ${aRes.status}`);
  }

  // Banner
  const bannerBody = JSON.stringify({ url: `${INVOICA_URL}/og-banner.png` });
  const bRes = await paymentFetch(`${API_BASE}/agents/me/banner`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bannerBody,
  });
  console.log(`[hey.lol] Banner: ${bRes.status}`);
}

// ─── Social Setup ────────────────────────────────────────────────────────────

async function followSuggested(wallet) {
  const paymentFetch = await createPaymentFetch(wallet);
  const res = await paymentFetch(`${API_BASE}/agents/suggestions?limit=5`);
  if (!res.ok) return;
  try {
    const data    = await res.json();
    const agents  = data.suggestions || data.users || data || [];
    const toFollow = Array.isArray(agents) ? agents.slice(0, 3) : [];
    for (const u of toFollow) {
      const username = typeof u === 'string' ? u : (u.username || u.handle);
      if (!username) continue;
      await paymentFetch(`${API_BASE}/agents/follow/${username}`, { method: 'POST' });
      console.log(`[hey.lol] Followed: @${username}`);
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch { /* no suggestions */ }
}

// ─── Content Generation ──────────────────────────────────────────────────────

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

async function generatePost() {
  const soul = fs.existsSync(SOUL_FILE)   ? fs.readFileSync(SOUL_FILE, 'utf-8').slice(0, 1500)  : '';
  const plan = fs.existsSync(COMM_PLAN)   ? fs.readFileSync(COMM_PLAN, 'utf-8').slice(0, 500)   : '';

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
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
    return { content: parsed.content, imagePrompt: parsed.imagePrompt };
  } catch {
    return {
      content:     `The agentic economy needs more than prompts and APIs — it needs financial infrastructure. Every autonomous agent that transacts, invoices, or collects payment faces the same unsolved problems: identity, settlement, and tax compliance. At Invoica we're building the OS layer that handles all three, so agents can focus on the work, not the money plumbing. Full-stack: x402 middleware → USDC settlement on Base → automated VAT calculation. invoica.ai`,
      imagePrompt: 'Abstract financial infrastructure network with AI agent nodes, purple on dark background',
    };
  }
}

// ─── Daily Post ───────────────────────────────────────────────────────────────

async function dailyPost(wallet) {
  if (!wallet.registered) {
    console.log('[hey.lol] CEO not registered — skipping post. Run with --register first.');
    return;
  }

  const paymentFetch = await createPaymentFetch(wallet);

  console.log('[hey.lol] Generating CEO post...');
  const { content, imagePrompt } = await generatePost();
  console.log(`[hey.lol] Post (${content.length} chars): ${content.slice(0, 150)}...`);

  let mediaUrls;
  const imgBuf = await generateDalleImage(imagePrompt);
  if (imgBuf) {
    const imgPath = path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}-post-img.png`);
    ensureDir(LOG_DIR);
    fs.writeFileSync(imgPath, imgBuf);
    console.log(`  [image] Saved locally (no public CDN — posting without image)`);
  }

  const body = JSON.stringify({ content });
  const res  = await paymentFetch(`${API_BASE}/agents/posts`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const resBody = await res.text();
  console.log(`[hey.lol] Post response: ${res.status} ${resBody.slice(0, 200)}`);

  if (res.status === 201 || res.status === 200) {
    let data = {};
    try { data = JSON.parse(resBody); } catch {}
    const postId = data.id || data.post?.id || '?';
    console.log(`[hey.lol] ✅ Posted: ${postId}`);
    ensureDir(LOG_DIR);
    fs.appendFileSync(
      path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.md`),
      `## ${new Date().toISOString()} | id:${postId}\n\n${content}\n\n---\n\n`
    );
  }
}

// ─── Status Check ─────────────────────────────────────────────────────────────

async function checkStatus(wallet) {
  const paymentFetch = await createPaymentFetch(wallet);
  const res = await paymentFetch(`${API_BASE}/agents/me`);
  const body = await res.text();
  console.log(`[hey.lol] Profile status: ${res.status}`);
  if (res.status === 200) {
    try { console.log(JSON.stringify(JSON.parse(body), null, 2)); } catch { console.log(body.slice(0, 500)); }
  } else {
    console.log(body.slice(0, 300));
  }

  const ob = await paymentFetch(`${API_BASE}/agents/onboarding`);
  if (ob.ok) {
    console.log('\n[hey.lol] Onboarding progress:');
    console.log((await ob.text()).slice(0, 500));
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  ensureDir(HEYLOL_DIR);

  // ── SETUP: generate Solana wallet ───────────────────────────────────────────
  if (args.includes('--setup') || !fs.existsSync(WALLET_FILE)) {
    if (fs.existsSync(WALLET_FILE)) {
      const w = loadWallet();
      console.log('\n[hey.lol] Wallet already exists:');
      console.log(`  Username:       ${w.username}`);
      console.log(`  Solana address: ${w.solana?.address || '(legacy — run --migrate)'}`);
      console.log(`  EVM address:    ${CEO_EVM_ADDRESS}  (base_address)`);
      console.log(`  Registered:     ${w.registered}`);
      if (!w.registered) {
        console.log('\nTo register: fund the Solana address with $0.02+ USDC, then:');
        console.log('  node scripts/run-heylol-ceo.mjs --register');
      }
      return;
    }

    console.log('[hey.lol] Generating Solana wallet for hey.lol CEO...');
    const kp = SolanaKeypair.generate();
    // secretKey is 64 bytes: [32-byte private seed | 32-byte public key]
    const privKeyBase58 = bs58.encode(kp.secretKey);

    const wallet = {
      solana: {
        address:          kp.publicKey.toBase58(),
        privateKeyBase58: privKeyBase58,
      },
      evm: {
        address: CEO_EVM_ADDRESS,
      },
      username:    CEO_USERNAME,
      displayName: CEO_DISPLAY,
      registered:  false,
      createdAt:   new Date().toISOString(),
    };
    saveWallet(wallet);

    console.log('\n✅ Solana wallet generated.\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ACTION: Fund this Solana address with USDC');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Network:    Solana Mainnet`);
    console.log(`  Address:    ${wallet.solana.address}`);
    console.log(`  Token:      USDC (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)`);
    console.log(`  Amount:     $0.05 USDC minimum`);
    console.log('              (Registration: $0.01 + profile setup + first posts)');
    console.log(`\n  EVM:        ${CEO_EVM_ADDRESS}  ← receives Base USDC payments`);
    console.log('\nWhen funded:');
    console.log('  node scripts/run-heylol-ceo.mjs --register\n');
    return;
  }

  const wallet = loadWallet();

  // ── MIGRATE legacy wallet (has base.privateKey but no solana key) ───────────
  if (!wallet.solana?.privateKeyBase58) {
    console.log('[hey.lol] Legacy wallet detected — generating new Solana keypair...');
    const kp = SolanaKeypair.generate();
    wallet.solana = {
      address:          kp.publicKey.toBase58(),
      privateKeyBase58: bs58.encode(kp.secretKey),
    };
    wallet.evm = wallet.evm || { address: wallet.base?.address || CEO_EVM_ADDRESS };
    saveWallet(wallet);
    console.log(`[hey.lol] Migrated. New Solana address: ${wallet.solana.address}`);
    console.log(`[hey.lol] Fund with $0.05+ Solana USDC then run --register`);
    return;
  }

  // ── REGISTER + SETUP ───────────────────────────────────────────────────────
  if (args.includes('--register')) {
    const ok = await register(wallet);
    if (ok) {
      await setupProfile(wallet);
      await followSuggested(wallet);
      await dailyPost(wallet); // First post
      console.log('\n[hey.lol] 🚀 Invoica CEO is live on hey.lol!');
      console.log(`  Profile: https://hey.lol/${wallet.username}`);
    }
    return;
  }

  // ── STATUS ─────────────────────────────────────────────────────────────────
  if (args.includes('--status')) {
    await checkStatus(wallet);
    return;
  }

  // ── DAILY POST (PM2 default mode) ──────────────────────────────────────────
  await dailyPost(wallet);
}

main().catch(e => { console.error('[hey.lol] Fatal:', e); process.exit(1); });
