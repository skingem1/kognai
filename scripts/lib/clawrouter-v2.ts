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

// ── Config ────────────────────────────────────────────────────────────────────
const OLLAMA_BASE = process.env.OLLAMA_HOST || 'http://localhost:11434';
const CLAWROUTER_GATEWAY = process.env.CLAWROUTER_GATEWAY_URL || 'http://localhost:18789/v1';
const OLLAMA_TIMEOUT_MS = 600_000;  // 10 min for local models
const CLOUD_TIMEOUT_MS = 300_000;   // 5 min for cloud API calls
const QCG_TOKEN_THRESHOLD = 5000;   // QCG pre-compression trigger

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
    options: { num_predict: maxTokens, temperature: 0.1 },
  });

  const res = await httpRequest(`${OLLAMA_BASE}/api/generate`, body, 'POST', {}, OLLAMA_TIMEOUT_MS);
  if (res.status !== 200) throw new Error(`Ollama ${model} returned ${res.status}: ${res.data.slice(0, 300)}`);

  const json = JSON.parse(res.data);
  return {
    content: json.response || '',
    input_tokens: json.prompt_eval_count || 0,
    output_tokens: json.eval_count || 0,
  };
}

// ── OpenClaw Gateway Call (Cloud Tiers) ───────────────────────────────────────

async function callCloudGateway(model: string, messages: Array<{ role: string; content: string }>, maxTokens: number = 4096): Promise<{
  content: string; input_tokens: number; output_tokens: number; cost_usd: number;
}> {
  const chatUrl = `${CLAWROUTER_GATEWAY}/chat/completions`;
  const body = JSON.stringify({ model, messages, max_tokens: maxTokens });

  const res = await httpRequest(chatUrl, body);
  if (res.status !== 200) throw new Error(`ClawRouter gateway returned ${res.status}: ${res.data.slice(0, 300)}`);

  const json = JSON.parse(res.data);
  const costHeader = res.headers['x-payment-amount'] as string | undefined;
  const cost_usd = costHeader ? Number(costHeader) / 1_000_000 : 0;

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
