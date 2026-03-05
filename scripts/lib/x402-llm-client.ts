/**
 * x402-llm-client.ts — Shared x402 LLM payment client for Invoica agents
 *
 * Instead of calling Anthropic/MiniMax directly with API keys, agents use this
 * client to:
 *   1. Sign an EIP-3009 TransferWithAuthorization from their USDC wallet
 *   2. Call POST /v1/ai/inference with X-Payment header
 *   3. Wallet balance decreases → visible on-chain spending
 *   4. Invoice recorded in Supabase automatically
 *
 * Model routing (handled by the server):
 *   model="MiniMax-M2.5" | "minimax" | "coding" → MiniMax Coding Plan (1M ctx)
 *   model="claude-haiku-4-5" or default          → Anthropic
 *
 * Usage:
 *   import { x402LLMCall } from './lib/x402-llm-client';
 *   const reply = await x402LLMCall({ agentName: 'cfo', prompt: '...', model: 'coding' });
 */

import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface X402LLMOptions {
  /** Agent wallet name: 'cfo', 'cto', 'cmo', 'ceo', 'bizdev', 'code', 'fast', 'support' */
  agentName: string;
  /** The user prompt to send */
  prompt: string;
  /** System prompt (optional) */
  systemPrompt?: string;
  /**
   * Model to use. Routing:
   *   'MiniMax-M2.5' | 'minimax' | 'coding' → MiniMax Coding Plan (default for coding tasks)
   *   'claude-haiku-4-5' | 'claude-*'        → Anthropic
   *   undefined                               → 'coding' (MiniMax-M2.5, best for agentic tasks)
   */
  model?: string;
  /** Override the inference API URL (default: http://localhost:3001) */
  apiUrl?: string;
  /** USDC price in atomic units per call (default: 1000 = 0.001 USDC) */
  priceAtomic?: bigint;
}

export interface X402LLMResult {
  content: string;
  model: string;
  backend: 'minimax' | 'anthropic';
  usage: { input_tokens: number; output_tokens: number };
  payment: {
    amount: string;
    from: string;
    to: string;
    method: string;
  };
}

// ── Config ─────────────────────────────────────────────────────────────────

const SELLER_WALLET = (process.env.X402_SELLER_WALLET || process.env.SELLER_WALLET || '').toLowerCase();
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASE_CHAIN_ID = 8453;

// EIP-712 domain for USDC on Base mainnet
const USDC_DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: BASE_CHAIN_ID,
  verifyingContract: USDC_ADDRESS,
};

// ── Private Key Resolution ─────────────────────────────────────────────────

/**
 * Get agent wallet private key.
 * Priority: env var AGENT_{NAME}_PRIVATE_KEY → Supabase Vault
 */
async function getAgentPrivateKey(agentName: string): Promise<string> {
  // 1. Try env var (e.g. AGENT_CFO_PRIVATE_KEY or CFO_WALLET_PRIVATE_KEY)
  const envKey = process.env[`AGENT_${agentName.toUpperCase()}_PRIVATE_KEY`]
    || process.env[`${agentName.toUpperCase()}_WALLET_PRIVATE_KEY`];
  if (envKey) return envKey.startsWith('0x') ? envKey : `0x${envKey}`;

  // 2. Try Supabase Vault
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(`No private key for agent '${agentName}' — set AGENT_${agentName.toUpperCase()}_PRIVATE_KEY or configure Supabase Vault`);

  const sb = createClient(url, key);
  const { data, error } = await sb.rpc('vault_secret_by_name', {
    secret_name: `agent_wallet_pk_${agentName}`,
  });
  if (error || !data) throw new Error(`Failed to get private key for agent '${agentName}' from vault: ${error?.message || 'not found'}`);
  return data.startsWith('0x') ? data : `0x${data}`;
}

// ── EIP-712 Signing (pure crypto, no viem dependency in scripts) ───────────

/**
 * Minimal EIP-712 TypedData signer for TransferWithAuthorization.
 * Uses Node.js crypto — no external dependencies required in scripts/.
 */
function signTypedData(privateKeyHex: string, message: {
  from: string; to: string; value: bigint;
  validAfter: bigint; validBefore: bigint; nonce: string;
}): string {
  // We use the viem-compatible approach: import dynamically if available,
  // otherwise fall back to the ethers-compatible manual signing.
  // Since viem is already in package.json (backend dep), we can require it.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { privateKeyToAccount } = require('viem/accounts');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { signTypedData: viemSign } = require('viem/actions');
    // This path is sync-compatible via viem's account signing
    const account = privateKeyToAccount(privateKeyHex as `0x${string}`);
    // viem's signTypedData is async — we can't call it sync here.
    // Return a sentinel; the async path below handles this.
    return `ASYNC_PENDING:${account.address}`;
  } catch {
    throw new Error('viem not available for EIP-712 signing — ensure viem is installed');
  }
}

/**
 * Async EIP-712 signer using viem (preferred path)
 */
async function signTransferWithAuth(privateKeyHex: string, message: {
  from: string; to: string; value: bigint;
  validAfter: bigint; validBefore: bigint; nonce: `0x${string}`;
}): Promise<{ address: string; signature: string }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { privateKeyToAccount } = require('viem/accounts');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createWalletClient, http } = require('viem');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { base } = require('viem/chains');

  const account = privateKeyToAccount(privateKeyHex as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

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
      from: message.from as `0x${string}`,
      to: message.to as `0x${string}`,
      value: message.value,
      validAfter: message.validAfter,
      validBefore: message.validBefore,
      nonce: message.nonce,
    },
  });

  return { address: account.address, signature };
}

// ── HTTP call to inference endpoint ────────────────────────────────────────

function postInference(
  apiUrl: string,
  payload: { prompt: string; model: string; system_prompt?: string },
  xPaymentHeader: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(apiUrl + '/v1/ai/inference');
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Payment': xPaymentHeader,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Failed to parse inference response: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(300_000, () => { req.destroy(); reject(new Error('Inference request timeout (300s)')); });
    req.write(body);
    req.end();
  });
}

// ── Main exported function ─────────────────────────────────────────────────

/**
 * Call an LLM via x402 USDC payment from an agent wallet.
 *
 * The USDC payment is a TransferWithAuthorization (EIP-3009) signed off-chain.
 * The seller wallet (CTO) receives the payment authorization.
 * An invoice is automatically recorded in Supabase.
 *
 * @param opts - See X402LLMOptions
 * @returns LLM response with content, model, and payment metadata
 * @throws if private key unavailable, signing fails, or inference returns error
 */
export async function x402LLMCall(opts: X402LLMOptions): Promise<X402LLMResult> {
  const {
    agentName,
    prompt,
    systemPrompt,
    model = 'coding', // Default: MiniMax-M2.5 Coding Plan
    apiUrl = process.env.INFERENCE_API_URL || 'http://localhost:3001',
    priceAtomic = BigInt(process.env.X402_PRICE_ATOMIC || '1000'),
  } = opts;

  if (!SELLER_WALLET) throw new Error('X402_SELLER_WALLET not set — cannot route payment');

  // 1. Get agent private key
  const privateKey = await getAgentPrivateKey(agentName);

  // 2. Build EIP-3009 message
  const now = Math.floor(Date.now() / 1000);
  const validBefore = BigInt(now + 3600); // 1 hour validity
  const validAfter = 0n;
  const nonce = `0x${crypto.randomBytes(32).toString('hex')}` as `0x${string}`;

  // 3. Sign with agent wallet
  const { address: fromAddress, signature } = await signTransferWithAuth(privateKey, {
    from: '', // filled below after we have the address
    to: SELLER_WALLET as string,
    value: priceAtomic,
    validAfter,
    validBefore,
    nonce,
  });

  // Re-sign with correct 'from' address
  const { signature: finalSig } = await signTransferWithAuth(privateKey, {
    from: fromAddress,
    to: SELLER_WALLET as string,
    value: priceAtomic,
    validAfter,
    validBefore,
    nonce,
  });

  // 4. Encode X-Payment header
  const paymentProof = {
    x402Version: 1,
    scheme: 'exact',
    network: 'base',
    payload: {
      signature: finalSig,
      authorization: {
        from: fromAddress,
        to: SELLER_WALLET,
        value: priceAtomic.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  };
  const xPaymentHeader = Buffer.from(JSON.stringify(paymentProof)).toString('base64');

  // 5. Call inference endpoint
  const result = await postInference(apiUrl, { prompt, model, system_prompt: systemPrompt }, xPaymentHeader);

  if (!result.success) {
    throw new Error(`x402 inference failed: ${result.error?.message || JSON.stringify(result)}`);
  }

  return {
    content: result.data.content,
    model: result.data.model,
    backend: result.data.backend,
    usage: {
      input_tokens: result.data.usage?.input_tokens || 0,
      output_tokens: result.data.usage?.output_tokens || 0,
    },
    payment: result.payment,
  };
}

/**
 * Convenience wrapper: call MiniMax-M2.5 via x402 (coding tasks)
 */
export async function x402CodeCall(agentName: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const result = await x402LLMCall({
    agentName,
    prompt: userPrompt,
    systemPrompt,
    model: 'MiniMax-M2.5',
  });
  return result.content;
}

/**
 * Convenience wrapper: call Claude Haiku via x402 (fast tasks)
 */
export async function x402FastCall(agentName: string, prompt: string): Promise<string> {
  const result = await x402LLMCall({
    agentName,
    prompt,
    model: 'claude-haiku-4-5',
  });
  return result.content;
}

export default { x402LLMCall, x402CodeCall, x402FastCall };
