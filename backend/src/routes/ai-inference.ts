import { Router, Request, Response, NextFunction } from 'express';
import https from 'https';
import { createClient } from '@supabase/supabase-js';
import { requireX402Payment, get402Response } from '../middleware/x402';

const router = Router();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
// Default model: Claude Haiku for simple tasks, MiniMax-M2.5 for coding tasks
const DEFAULT_MODEL = 'claude-haiku-4-5';
// Supported MiniMax model on Coding Plan (hardcoded — do not change to env var)
const MINIMAX_CODING_MODEL = 'MiniMax-M2.5';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type LLMResult = { content: string; inputTokens: number; outputTokens: number };

// ---------------------------------------------------------------------------
// Batched settlement queue — flush every 50 calls OR every 5 minutes
// ---------------------------------------------------------------------------
interface SettlementRecord {
  from: string;
  to: string;
  value: bigint;
  nonce: string;
  signature: string;
  prompt: string;
  createdAt: string;
}

const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let settlementQueue: SettlementRecord[] = [];
let flushTimer: NodeJS.Timeout | null = null;

/**
 * Flush the settlement queue to Supabase as individual Invoice records.
 * Called either when queue reaches BATCH_SIZE or when the flush timer fires.
 */
async function flushSettlementQueue(): Promise<void> {
  if (settlementQueue.length === 0) return;

  const batch = settlementQueue.splice(0);
  console.log(`[ai-inference] Flushing ${batch.length} settlement(s) to Supabase`);

  const sb = getSupabase();
  const now = new Date().toISOString();

  const records = batch.map((rec, idx) => ({
    invoiceNumber: Math.floor(Date.now() / 1000) + idx,
    status: 'COMPLETED',
    amount: Number(rec.value) / 1_000_000,
    currency: 'USDC',
    customerEmail: `${rec.from.slice(0, 10)}@x402.base`,
    customerName: `Agent ${rec.from.slice(0, 10)}...`,
    paymentDetails: JSON.stringify({
      x402Protocol: true,
      network: 'base-mainnet',
      chainId: 8453,
      payerWallet: rec.from,
      sellerWallet: rec.to,
      nonce: rec.nonce,
      signature: rec.signature.slice(0, 20) + '...',
      prompt: rec.prompt.slice(0, 100),
      eip3009: true,
    }),
    settledAt: rec.createdAt,
    completedAt: now,
    createdAt: rec.createdAt,
    updatedAt: now,
  }));

  const { error } = await sb.from('Invoice').insert(records);
  if (error) {
    console.warn('[ai-inference] Batch settlement insert failed:', error.message);
    // Re-queue on failure (best-effort)
    settlementQueue.unshift(...batch);
  } else {
    console.log(`[ai-inference] ${batch.length} settlement(s) recorded successfully`);
  }
}

/**
 * Enqueue a payment for batched settlement.
 * Auto-flushes when queue reaches BATCH_SIZE; timer ensures max latency of 5 min.
 */
function enqueueSettlement(payment: NonNullable<Request['x402Payment']>, prompt: string): void {
  settlementQueue.push({
    from: payment.from,
    to: payment.to,
    value: payment.value,
    nonce: payment.nonce,
    signature: payment.signature,
    prompt,
    createdAt: new Date().toISOString(),
  });

  // Flush immediately if batch is full
  if (settlementQueue.length >= BATCH_SIZE) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    flushSettlementQueue().catch(e => console.error('[ai-inference] Flush error:', e));
    return;
  }

  // Start/reset the 5-minute flush timer
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushSettlementQueue().catch(e => console.error('[ai-inference] Flush error:', e));
    }, FLUSH_INTERVAL_MS);
  }
}

// Graceful shutdown: flush remaining settlements before process exits
process.on('SIGTERM', () => flushSettlementQueue().catch(() => {}));
process.on('SIGINT',  () => flushSettlementQueue().catch(() => {}));

// ---------------------------------------------------------------------------
// LLM Clients
// ---------------------------------------------------------------------------

/**
 * Call Anthropic API (native https, no extra deps -- same pattern as ceoBot.ts)
 */
async function callAnthropic(prompt: string, model: string): Promise<LLMResult> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(json.error.message)); return; }
          resolve({
            content: json.content?.[0]?.text || '',
            inputTokens: json.usage?.input_tokens || 0,
            outputTokens: json.usage?.output_tokens || 0,
          });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Call MiniMax API (Coding Plan — MiniMax-M2.5 only)
 * Used for coding/agentic tasks — 1M context window, superior coding performance
 */
async function callMiniMax(prompt: string, systemPrompt?: string): Promise<LLMResult> {
  if (!MINIMAX_API_KEY) throw new Error('MINIMAX_API_KEY not set');
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MINIMAX_CODING_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 16000,
    });

    const req = https.request({
      hostname: 'api.minimax.io',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(json.error.message)); return; }
          if (json.base_resp?.status_code && json.base_resp.status_code !== 0) {
            reject(new Error(`MiniMax error: ${json.base_resp.status_msg} (code ${json.base_resp.status_code})`));
            return;
          }
          resolve({
            content: json.choices?.[0]?.message?.content || '',
            inputTokens: json.usage?.prompt_tokens || 0,
            outputTokens: json.usage?.completion_tokens || 0,
          });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(300_000, () => { req.destroy(); reject(new Error('MiniMax timeout (300s)')); });
    req.write(body);
    req.end();
  });
}

/**
 * Route LLM call: MiniMax for coding tasks, Anthropic for everything else
 */
async function callLLM(prompt: string, model: string, systemPrompt?: string): Promise<LLMResult & { backend: string }> {
  const isMiniMax = model.toLowerCase().startsWith('minimax') || model === 'coding';
  if (isMiniMax) {
    const result = await callMiniMax(prompt, systemPrompt);
    return { ...result, backend: 'minimax' };
  }
  const result = await callAnthropic(prompt, model);
  return { ...result, backend: 'anthropic' };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /v1/ai/inference -- returns 402 payment requirements
 */
router.get('/v1/ai/inference', (_req: Request, res: Response) => {
  res.status(402).json(get402Response());
});

/**
 * POST /v1/ai/inference -- x402-protected LLM inference
 * Requires: X-Payment header with valid EIP-3009 authorization
 * Body: { prompt: string, model?: string, system_prompt?: string }
 * Model routing:
 *   "MiniMax-M2.5" | "minimax" | "coding" → MiniMax Coding Plan (M2.5, 1M context)
 *   anything else (default: "claude-haiku-4-5") → Anthropic
 * Settlement: batched — flushed every 50 calls or every 5 minutes
 */
router.post('/v1/ai/inference', requireX402Payment, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prompt, model = DEFAULT_MODEL, system_prompt: systemPrompt } = req.body as {
      prompt?: string; model?: string; system_prompt?: string;
    };

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      res.status(400).json({ success: false, error: { message: 'prompt is required', code: 'MISSING_PROMPT' } });
      return;
    }

    const payment = req.x402Payment!;
    console.log(`[ai-inference] Processing request from ${payment.from.slice(0, 10)}... model=${model}`);

    const llmResult = await callLLM(prompt.trim(), model, systemPrompt);
    const resolvedModel = llmResult.backend === 'minimax' ? MINIMAX_CODING_MODEL : model;

    // Enqueue settlement (batched — non-blocking)
    enqueueSettlement(payment, prompt);

    res.json({
      success: true,
      data: {
        content: llmResult.content,
        model: resolvedModel,
        backend: llmResult.backend,
        usage: {
          input_tokens: llmResult.inputTokens,
          output_tokens: llmResult.outputTokens,
        },
      },
      payment: {
        verified: true,
        amount: `${Number(payment.value) / 1_000_000} USDC`,
        from: payment.from,
        to: payment.to,
        network: 'base-mainnet',
        chainId: 8453,
        method: 'EIP-3009 TransferWithAuthorization',
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
