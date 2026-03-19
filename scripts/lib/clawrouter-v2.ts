/**
 * clawrouter-v2.ts — ClawRouter Universal LLM Gateway v2.0
 *
 * THE SINGLE DOOR every LLM call passes through (ClawRouter Spec v2.0).
 * Execution Protocol Section 17: ClawRouter Mandatory Gateway Rule.
 *
 * Routing Matrix:
 *   T0 NANO    → qwen3:0.6b (local)     — classification, templating
 *   T1 LOCAL   → qwen3:4b (local)       — QA, supervision, aggregation
 *   T2 POWER   → qwen3:14b (local)      — primary execution engine
 *   T2.5 EXEC  → Gemini Flash (API)     — cloud-quality, no constitutional
 *   T3 APEX    → Claude Sonnet (API)    — constitutional judge only
 *
 * Rules:
 *   - constitutional_flag=true → always T3 APEX
 *   - Local tiers (T0/T1/T2) → Ollama direct ($0)
 *   - Cloud tiers (T2.5/T3) → OpenClaw gateway at :18789
 *   - QCG pre-compression for cloud tiers when context > 5000 tokens
 *   - NO agent holds API keys — keys only in ClawRouter/.env
 *
 * @see ~/Documents/Kognai/Master Documents/clawrouter_spec_v2.docx
 * @see ~/Documents/Kognai/Master Documents/execution_protocol_sections_17_18.docx
 */

import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getWalletState, recordSpend } from './wallet-state';

// ── Config ────────────────────────────────────────────────────────────────────
const _rawOllamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_BASE = _rawOllamaHost.startsWith('http') ? _rawOllamaHost : `http://${_rawOllamaHost}`;
const CLAWROUTER_GATEWAY = process.env.CLAWROUTER_GATEWAY_URL || 'http://localhost:18789/v1';
const OLLAMA_TIMEOUT_MS = 600_000;  // 10 min for local models
const CLOUD_TIMEOUT_MS = 300_000;   // 5 min for cloud API calls
const QCG_TOKEN_THRESHOLD = 5000;   // QCG pre-compression trigger

// ── x402 Payment Config (USDC on Base mainnet) ──────────────────────────────
const X402_WALLET_KEY = process.env.X402_WALLET_KEY || '';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASE_CHAIN_ID = 8453;
const USDC_DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: BASE_CHAIN_ID,
  verifyingContract: USDC_ADDRESS as `0x${string}`,
} as const;

// ── Tier Models ───────────────────────────────────────────────────────────────
const TIER_MODELS = {
  // Text tiers
  T0_NANO:  'qwen3:0.6b',
  T1_LOCAL: 'qwen3:4b',
  T2_POWER: 'qwen3:14b',
  T2_5_EXEC: 'google/gemini-2.5-flash',    // via OpenClaw gateway
  T3_APEX:  'anthropic/claude-sonnet-4-20250514', // via OpenClaw gateway
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type TierClass = 'text' | 'creative';
export type TextComplexity = 'nano' | 'local' | 'power' | 'exec' | 'apex';
export type CreativeModality = 'image' | 'video' | 'speech' | 'music' | 'transcription' | 'visual_understanding';
export type CreativeQuality = 'fast' | 'high';

export interface ClawRouterV2Request {
  task_type: string;            // e.g. "code_review", "insight_generation"
  tier_class: TierClass;        // "text" or "creative"
  complexity?: TextComplexity;  // for text: nano/local/power/exec/apex
  modality?: CreativeModality;  // for creative: image/video/speech/etc.
  quality?: CreativeQuality;    // for creative: fast/high
  context_tokens: number;       // estimated input tokens BEFORE compression
  constitutional_flag: boolean; // true → forces T3 APEX
  agent_id: string;             // calling agent identifier
  payload: {
    system?: string;
    prompt?: string;
    messages?: Array<{ role: string; content: string }>;
    [key: string]: any;         // extensible for creative payloads
  };
}

export interface ClawRouterV2Response {
  content: string;
  model: string;
  tier: string;               // T0/T1/T2/T2.5/T3 or C1-C7
  local: boolean;             // true if served by Ollama
  cost_usd: number;           // 0 for local tiers
  input_tokens: number;
  output_tokens: number;
  qcg_compressed: boolean;    // true if QCG pre-compression was applied
  tokens_saved_by_qcg: number;
  agent_id: string;
  task_type: string;
  timestamp: string;
}

// ── Cost Log ──────────────────────────────────────────────────────────────────

interface CostLogEntry {
  timestamp: string;
  agent_id: string;
  task_type: string;
  tier: string;
  model: string;
  local: boolean;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  qcg_compressed: boolean;
  tokens_saved: number;
}

const costLog: CostLogEntry[] = [];
const MAX_COST_LOG = 5000;

export function getCostLog(): readonly CostLogEntry[] { return costLog; }

export function getDailyCostDigest(): {
  total_usd: number;
  by_tier: Record<string, number>;
  by_agent: Record<string, number>;
  tokens_saved_by_qcg: number;
  call_count: number;
} {
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = costLog.filter(e => e.timestamp.startsWith(today));
  const by_tier: Record<string, number> = {};
  const by_agent: Record<string, number> = {};
  let total_usd = 0;
  let tokens_saved = 0;

  for (const e of todayEntries) {
    total_usd += e.cost_usd;
    tokens_saved += e.tokens_saved;
    by_tier[e.tier] = (by_tier[e.tier] || 0) + e.cost_usd;
    by_agent[e.agent_id] = (by_agent[e.agent_id] || 0) + e.cost_usd;
  }

  return { total_usd, by_tier, by_agent, tokens_saved_by_qcg: tokens_saved, call_count: todayEntries.length };
}

// ── Routing Matrix ────────────────────────────────────────────────────────────

function resolveTextTier(req: ClawRouterV2Request): { tier: string; model: string; local: boolean } {
  // Constitutional flag always forces APEX
  if (req.constitutional_flag) {
    return { tier: 'T3', model: TIER_MODELS.T3_APEX, local: false };
  }

  switch (req.complexity) {
    case 'nano':
      return { tier: 'T0', model: TIER_MODELS.T0_NANO, local: true };
    case 'local':
      return { tier: 'T1', model: TIER_MODELS.T1_LOCAL, local: true };
    case 'exec':
      return { tier: 'T2.5', model: TIER_MODELS.T2_5_EXEC, local: false };
    case 'apex':
      return { tier: 'T3', model: TIER_MODELS.T3_APEX, local: false };
    case 'power':
    default:
      // Default unspecified complexity → T2 POWER (local)
      return { tier: 'T2', model: TIER_MODELS.T2_POWER, local: true };
  }
}

function resolveCreativeTier(req: ClawRouterV2Request): { tier: string; model: string; local: boolean } {
  // Creative routing — Phase 2A. Stubs for now, returns model_unavailable for uninstalled.
  switch (req.modality) {
    case 'image':
      return req.quality === 'high'
        ? { tier: 'C2', model: 'flux-dev', local: false }
        : { tier: 'C1', model: 'flux-schnell', local: true };
    case 'video':
      return { tier: 'C3', model: 'wan2.1', local: true };
    case 'speech':
      return req.quality === 'high'
        ? { tier: 'C4', model: 'elevenlabs', local: false }
        : { tier: 'C4', model: 'kokoro', local: true };
    case 'music':
      return { tier: 'C5', model: 'musicgen', local: true };
    case 'transcription':
      return { tier: 'C6', model: 'whisper', local: true };
    case 'visual_understanding':
      return { tier: 'C7', model: 'qwen2.5-vl', local: true };
    default:
      return { tier: 'C1', model: 'flux-schnell', local: true };
  }
}

// ── HTTP Helpers ───────────────────────────────────────────────────────────────

function httpRequest(
  url: string, body: string, method: string = 'POST',
  extraHeaders: Record<string, string> = {}, timeoutMs: number = CLOUD_TIMEOUT_MS
): Promise<{ status: number; data: string; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...extraHeaders },
    }, (res) => {
      let data = '';
      res.on('data', (c: string) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode || 0, data, headers: res.headers as any }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error(`ClawRouter timeout (${timeoutMs / 1000}s)`)); });
    req.write(body);
    req.end();
  });
}

// ── Ollama Direct Call (Local Tiers) ──────────────────────────────────────────

async function callOllamaLocal(model: string, prompt: string, systemPrompt?: string, maxTokens: number = 4096): Promise<{
  content: string; input_tokens: number; output_tokens: number;
}> {
  const body = JSON.stringify({
    model,
    prompt,
    system: systemPrompt,
    stream: false,
    think: false,  // Disable qwen3 thinking mode — outputs to separate key, breaks JSON parsing
    options: { num_predict: maxTokens, temperature: 0.1 },
  });

  const res = await httpRequest(`${OLLAMA_BASE}/api/generate`, body, 'POST', {}, OLLAMA_TIMEOUT_MS);
  if (res.status !== 200) throw new Error(`Ollama ${model} returned ${res.status}: ${res.data.slice(0, 300)}`);

  const json = JSON.parse(res.data);
  // Strip any residual <think>...</think> tags from qwen3 response
  let content = json.response || '';
  content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return {
    content,
    input_tokens: json.prompt_eval_count || 0,
    output_tokens: json.eval_count || 0,
  };
}

// ── Anthropic Direct API Fallback (when OpenClaw gateway is unavailable) ────────

/**
 * Call Anthropic API directly — fallback when OpenClaw gateway returns non-200/non-402.
 * Uses ANTHROPIC_API_KEY from .env. Only called for anthropic/* models.
 * Anthropic Messages API: https://docs.anthropic.com/en/api/messages
 */
async function callAnthropicDirect(
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = 4096
): Promise<{ content: string; input_tokens: number; output_tokens: number; cost_usd: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set — cannot call Anthropic API directly');

  // Anthropic Messages API: system message is top-level, not in messages array
  const systemMsg = messages.find(m => m.role === 'system')?.content;
  const userMsgs  = messages.filter(m => m.role !== 'system');

  const bodyObj: Record<string, any> = {
    model,
    max_tokens: maxTokens,
    messages: userMsgs,
  };
  if (systemMsg) bodyObj.system = systemMsg;

  const body = JSON.stringify(bodyObj);
  const res = await httpRequest(
    'https://api.anthropic.com/v1/messages',
    body, 'POST',
    {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    CLOUD_TIMEOUT_MS
  );

  if (res.status !== 200) {
    throw new Error(`Anthropic direct API returned ${res.status}: ${res.data.slice(0, 300)}`);
  }

  const json = JSON.parse(res.data);
  return {
    content:       json.content?.[0]?.text || '',
    input_tokens:  json.usage?.input_tokens  || 0,
    output_tokens: json.usage?.output_tokens || 0,
    cost_usd:      0,   // billing handled outside (no gateway metering on direct path)
  };
}

// ── x402 Payment Signing (EIP-3009 TransferWithAuthorization) ─────────────────

/**
 * Sign an x402 payment for a cloud LLM call.
 * Uses viem to sign EIP-3009 TransferWithAuthorization on USDC (Base mainnet).
 * Returns base64-encoded X-PAYMENT header value.
 */
async function signX402Payment(payTo: string, amountAtomic: number): Promise<{ xPayment: string; costUsd: number }> {
  if (!X402_WALLET_KEY) {
    throw new Error('x402: gateway requires payment but X402_WALLET_KEY not set in .env');
  }

  // Dynamic imports — viem is already a project dependency
  const { privateKeyToAccount } = require('viem/accounts');
  const { createWalletClient, http: viemHttp } = require('viem');
  const { base } = require('viem/chains');

  const account = privateKeyToAccount(X402_WALLET_KEY as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: viemHttp('https://mainnet.base.org'),
  });

  const now = BigInt(Math.floor(Date.now() / 1000));
  const validBefore = now + BigInt(3600); // 1 hour validity
  const nonce = `0x${crypto.randomBytes(32).toString('hex')}` as `0x${string}`;

  const signature = await walletClient.signTypedData({
    domain: USDC_DOMAIN,
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from: account.address,
      to: payTo as `0x${string}`,
      value: BigInt(amountAtomic),
      validAfter: now,
      validBefore,
      nonce,
    },
  });

  const paymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: 'base',
    payload: {
      signature,
      authorization: {
        from: account.address,
        to: payTo,
        value: String(amountAtomic),
        validAfter: String(now),
        validBefore: String(validBefore),
        nonce,
      },
    },
  };

  const xPayment = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
  const costUsd = amountAtomic / 1_000_000; // atomic USDC (6 decimals) → USD

  return { xPayment, costUsd };
}

// ── OpenClaw Gateway Call (Cloud Tiers — x402 payment flow) ──────────────────

/**
 * Call cloud LLM via OpenClaw gateway with x402 payment signing.
 *
 * Flow:
 *   1. POST /chat/completions → may return 200 (free) or 402 (payment required)
 *   2. If 402: parse payment requirements (amount, payTo)
 *   3. Sign EIP-3009 TransferWithAuthorization with CEO wallet
 *   4. Retry POST with X-PAYMENT header (base64-encoded signed proof)
 *   5. Return response + actual cost in USD
 */
async function callCloudGateway(model: string, messages: Array<{ role: string; content: string }>, maxTokens: number = 4096): Promise<{
  content: string; input_tokens: number; output_tokens: number; cost_usd: number;
}> {
  const chatUrl = `${CLAWROUTER_GATEWAY}/chat/completions`;
  const body = JSON.stringify({ model, messages, max_tokens: maxTokens });

  // Step 1: Initial request (may return 402 requiring x402 payment)
  let res = await httpRequest(chatUrl, body);
  let paidAmountUsd = 0;

  // Step 2: If 402, sign x402 payment and retry
  if (res.status === 402) {
    if (!X402_WALLET_KEY) {
      throw new Error(
        `ClawRouter gateway returned 402 (payment required) but X402_WALLET_KEY not set. ` +
        `Fund the CEO wallet and add the private key to .env.`
      );
    }

    try {
      const paymentReq = JSON.parse(res.data);
      // OpenClaw 402 format: { accepts: { amount, payTo, ... } } or flat { amount, payTo }
      const accepts = paymentReq.accepts || paymentReq;
      const amountAtomic = parseInt(accepts.maxAmountRequired || accepts.amount || '10000', 10);
      const payTo = accepts.payTo || '';

      if (!payTo) throw new Error('x402: gateway returned 402 but no payTo address in response');

      const { xPayment, costUsd } = await signX402Payment(payTo, amountAtomic);
      paidAmountUsd = costUsd;

      // Step 3: Retry with signed payment
      res = await httpRequest(chatUrl, body, 'POST', { 'X-PAYMENT': xPayment });
    } catch (e: any) {
      if (e.message?.includes('x402')) throw e;
      throw new Error(`x402 payment signing failed: ${e.message}`);
    }
  }

  if (res.status !== 200) {
    // Fallback: if ANTHROPIC_API_KEY is set and this is an Anthropic model, bypass gateway
    const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
    if (anthropicKey && model.startsWith('anthropic/')) {
      const directModel = model.replace('anthropic/', '');
      console.warn(`[ClawRouter] Gateway ${res.status} — falling back to direct Anthropic API (${directModel})`);
      return callAnthropicDirect(directModel, messages, maxTokens);
    }
    throw new Error(`ClawRouter gateway returned ${res.status}: ${res.data.slice(0, 300)}`);
  }

  const json = JSON.parse(res.data);

  // Cost: prefer actual payment amount, fall back to response header
  const costHeader = res.headers['x-payment-amount'] as string | undefined;
  const cost_usd = paidAmountUsd > 0
    ? paidAmountUsd
    : (costHeader ? Number(costHeader) / 1_000_000 : 0);

  return {
    content: json.choices?.[0]?.message?.content || '',
    input_tokens: json.usage?.prompt_tokens || 0,
    output_tokens: json.usage?.completion_tokens || 0,
    cost_usd,
  };
}

// ── QCG Stub (AMD-12 — to be wired with full QCG pre-flight) ─────────────────

function applyQCGCompression(payload: any, contextTokens: number): { compressed: boolean; tokensSaved: number; payload: any } {
  // TODO: Wire full QCG pre-flight compression here
  // For now: pass-through, no compression applied
  // When implemented: read data sources → compress → return compressed brief
  return { compressed: false, tokensSaved: 0, payload };
}

// ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────

/**
 * Route an LLM call through ClawRouter v2.0.
 * This is the ONLY function any agent should call for LLM inference.
 *
 * @example
 *   const result = await routeCall({
 *     task_type: 'code_review',
 *     tier_class: 'text',
 *     complexity: 'power',
 *     context_tokens: 3000,
 *     constitutional_flag: false,
 *     agent_id: 'cto-agent',
 *     payload: { system: '...', prompt: '...' }
 *   });
 */
export async function routeCall(req: ClawRouterV2Request): Promise<ClawRouterV2Response> {
  const timestamp = new Date().toISOString();

  // 1. Resolve tier & model
  const route = req.tier_class === 'creative'
    ? resolveCreativeTier(req)
    : resolveTextTier(req);

  // 1b. CEO Wallet freeze guard — block cloud calls when budget exhausted (§17.5)
  if (!route.local) {
    const wallet = getWalletState();
    if (wallet.isFrozen) {
      throw new Error(
        `ClawRouter FROZEN: CEO wallet at ${wallet.burnPct.toFixed(1)}% ` +
        `($${wallet.spentThisMonth.toFixed(2)}/$${wallet.monthlyBudget}). ` +
        `Cloud tier ${route.tier} blocked. Fund wallet or use local tiers.`
      );
    }
  }

  // 2. QCG pre-compression for cloud tiers
  let qcgResult = { compressed: false, tokensSaved: 0, payload: req.payload };
  if (!route.local && req.context_tokens > QCG_TOKEN_THRESHOLD) {
    qcgResult = applyQCGCompression(req.payload, req.context_tokens);
  }

  // 3. Build messages array
  const payload = qcgResult.payload;
  let messages: Array<{ role: string; content: string }> = [];
  if (payload.messages) {
    messages = payload.messages;
  } else {
    if (payload.system) messages.push({ role: 'system', content: payload.system });
    if (payload.prompt) messages.push({ role: 'user', content: payload.prompt });
  }

  const prompt = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
  const systemPrompt = messages.find(m => m.role === 'system')?.content;

  // 4. Execute call — local or cloud
  let content = '';
  let input_tokens = 0;
  let output_tokens = 0;
  let cost_usd = 0;

  if (route.local) {
    const result = await callOllamaLocal(route.model, prompt, systemPrompt, payload.max_tokens);
    content = result.content;
    input_tokens = result.input_tokens;
    output_tokens = result.output_tokens;
    cost_usd = 0; // local = free
  } else {
    const result = await callCloudGateway(route.model, messages, payload.max_tokens || 4096);
    content = result.content;
    input_tokens = result.input_tokens;
    output_tokens = result.output_tokens;
    cost_usd = result.cost_usd;
  }

  // 4b. CEO Wallet billing — record every cloud spend (§17.5)
  if (cost_usd > 0) {
    recordSpend(cost_usd);
  }

  // 5. Log
  const logEntry: CostLogEntry = {
    timestamp, agent_id: req.agent_id, task_type: req.task_type,
    tier: route.tier, model: route.model, local: route.local,
    cost_usd, input_tokens, output_tokens,
    qcg_compressed: qcgResult.compressed, tokens_saved: qcgResult.tokensSaved,
  };
  costLog.push(logEntry);
  if (costLog.length > MAX_COST_LOG) costLog.shift();

  // 6. Append to daily cost log file
  try {
    const logDir = path.join(process.cwd(), 'logs', 'clawrouter');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `${timestamp.slice(0, 10)}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  } catch { /* non-critical */ }

  return {
    content, model: route.model, tier: route.tier, local: route.local,
    cost_usd, input_tokens, output_tokens,
    qcg_compressed: qcgResult.compressed, tokens_saved_by_qcg: qcgResult.tokensSaved,
    agent_id: req.agent_id, task_type: req.task_type, timestamp,
  };
}

// ── BACKWARD-COMPATIBLE WRAPPER ───────────────────────────────────────────────
// Drop-in replacement for the old callClawRouter / callLLM pattern

export async function callLLM(
  prompt: string,
  opts: {
    systemPrompt?: string;
    complexity?: TextComplexity;
    constitutional?: boolean;
    agentId?: string;
    taskType?: string;
    maxTokens?: number;
  } = {}
): Promise<{ content: string; model: string; tier: string; cost_usd: number }> {
  const result = await routeCall({
    task_type: opts.taskType || 'generic',
    tier_class: 'text',
    complexity: opts.complexity || 'power',
    context_tokens: (prompt.length + (opts.systemPrompt?.length || 0)) / 4,
    constitutional_flag: opts.constitutional || false,
    agent_id: opts.agentId || 'unknown',
    payload: {
      system: opts.systemPrompt,
      prompt,
      max_tokens: opts.maxTokens || 4096,
    },
  });

  return { content: result.content, model: result.model, tier: result.tier, cost_usd: result.cost_usd };
}

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────

export async function clawRouterHealthCheck(): Promise<{
  ollama: boolean;
  gateway: boolean;
  models: string[];
}> {
  let ollama = false;
  let gateway = false;
  let models: string[] = [];

  // Check Ollama
  try {
    const res = await httpRequest(`${OLLAMA_BASE}/api/tags`, '{}', 'GET', {}, 3000);
    if (res.status === 200) {
      ollama = true;
      const json = JSON.parse(res.data);
      models = (json.models || []).map((m: any) => m.name || m.model);
    }
  } catch { /* not available */ }

  // Check OpenClaw gateway
  try {
    const res = await httpRequest(`${CLAWROUTER_GATEWAY}/models`, '{}', 'GET', {}, 3000);
    gateway = res.status === 200;
  } catch { /* not available */ }

  return { ollama, gateway, models };
}
