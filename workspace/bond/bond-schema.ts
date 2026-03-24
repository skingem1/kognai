/**
 * BOND Protocol v0.1 — Mandate Schema + PayAI Executor Interface
 * Sprint 960 — Design only, no on-chain deployment
 *
 * BOND enables recurring, signed mandates for agent-to-agent payments.
 * Uses EIP-712 typed data for mandate signing.
 */

// ---------------------------------------------------------------------------
// EIP-712 Domain + Types
// ---------------------------------------------------------------------------

/**
 * EIP-712 domain separator for BOND mandates.
 */
export const BOND_EIP712_DOMAIN = {
  name: 'BOND Protocol',
  version: '0.1',
  chainId: 1, // Ethereum mainnet (override for testnet)
  verifyingContract: '0x0000000000000000000000000000000000000000', // TBD — placeholder
} as const;

/**
 * EIP-712 type definitions for the RecurringMandate struct.
 */
export const BOND_EIP712_TYPES = {
  RecurringMandate: [
    { name: 'mandateId', type: 'bytes32' },
    { name: 'grantor', type: 'address' },
    { name: 'grantee', type: 'address' },
    { name: 'tokenAddress', type: 'address' },
    { name: 'maxAmountPerCall', type: 'uint256' },
    { name: 'maxCallsPerPeriod', type: 'uint256' },
    { name: 'periodSeconds', type: 'uint256' },
    { name: 'validFrom', type: 'uint256' },
    { name: 'validUntil', type: 'uint256' },
    { name: 'modelTier', type: 'string' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

// ---------------------------------------------------------------------------
// Mandate Types
// ---------------------------------------------------------------------------

/**
 * A recurring mandate — the core BOND primitive.
 * Signed by the grantor using EIP-712 typed data.
 */
export interface RecurringMandate {
  /** Unique mandate ID (bytes32 hex) */
  mandateId: string;
  /** Wallet address of the grantor (agent paying) */
  grantor: string;
  /** Wallet address of the grantee (agent receiving) */
  grantee: string;
  /** ERC-20 token address (USDC on Base, etc.) */
  tokenAddress: string;
  /** Maximum payment per invocation (in token base units) */
  maxAmountPerCall: bigint;
  /** Maximum calls allowed per period */
  maxCallsPerPeriod: number;
  /** Period duration in seconds (e.g. 86400 = daily) */
  periodSeconds: number;
  /** Unix timestamp — mandate becomes valid */
  validFrom: number;
  /** Unix timestamp — mandate expires (0 = indefinite) */
  validUntil: number;
  /** Required model tier for execution ('T1' | 'T2' | 'T3' | 'T4' | '*') */
  modelTier: string;
  /** Nonce for replay protection */
  nonce: number;
  /** EIP-712 signature (hex) */
  signature: string;
}

/**
 * Mandate execution state — tracks usage within a period.
 */
export interface MandateState {
  mandateId: string;
  /** Current period start (Unix timestamp) */
  periodStart: number;
  /** Calls made in current period */
  callsThisPeriod: number;
  /** Total amount spent in current period (token base units) */
  amountThisPeriod: bigint;
  /** Whether the mandate has been revoked */
  revoked: boolean;
  /** Last execution timestamp */
  lastExecutedAt: number;
}

// ---------------------------------------------------------------------------
// X-Mandate HTTP Headers
// ---------------------------------------------------------------------------

/**
 * The three X-Mandate headers sent with every BOND-authorized API call.
 *
 * These headers allow any HTTP endpoint (model gateway, tool API, etc.)
 * to verify the caller has a valid mandate without on-chain lookup.
 */
export interface XMandateHeaders {
  /**
   * X-Mandate-Id: The mandate ID (bytes32 hex).
   * The server uses this to look up the mandate and verify the signature.
   */
  'X-Mandate-Id': string;

  /**
   * X-Mandate-Signature: The EIP-712 signature from the grantor.
   * The server verifies this against the mandate fields and grantor address.
   */
  'X-Mandate-Signature': string;

  /**
   * X-Mandate-Nonce: Current nonce value.
   * Prevents replay attacks. Server must check nonce >= last seen nonce.
   */
  'X-Mandate-Nonce': string;
}

/**
 * Build X-Mandate headers from a RecurringMandate.
 */
export function buildXMandateHeaders(
  mandate: RecurringMandate,
): XMandateHeaders {
  return {
    'X-Mandate-Id': mandate.mandateId,
    'X-Mandate-Signature': mandate.signature,
    'X-Mandate-Nonce': String(mandate.nonce),
  };
}

// ---------------------------------------------------------------------------
// PayAI Executor Interface
// ---------------------------------------------------------------------------

/**
 * PayAI Executor — the interface that model gateways and tool APIs implement
 * to accept BOND mandate-authorized payments.
 */
export interface PayAIExecutor {
  /**
   * Verify a mandate is valid and has remaining budget for this call.
   * Returns the verified mandate state, or throws if invalid.
   */
  verifyMandate(headers: XMandateHeaders): Promise<MandateState>;

  /**
   * Execute a model call under a mandate.
   * Debits the mandate's budget and returns the result.
   */
  executeUnderMandate(
    headers: XMandateHeaders,
    request: PayAIRequest,
  ): Promise<PayAIResponse>;

  /**
   * Report usage for a completed call (for billing reconciliation).
   */
  reportUsage(
    mandateId: string,
    usage: PayAIUsage,
  ): Promise<void>;
}

/**
 * A request to a model/tool under BOND mandate authorization.
 */
export interface PayAIRequest {
  /** Model ID (e.g. 'claude-sonnet-4-6', 'qwen3:14b') */
  model: string;
  /** Request payload (model-specific) */
  payload: unknown;
  /** Maximum tokens to generate */
  maxTokens?: number;
}

/**
 * Response from a PayAI execution.
 */
export interface PayAIResponse {
  /** Model output */
  result: unknown;
  /** Actual cost in token base units (USDC) */
  costBaseUnits: bigint;
  /** Tokens used */
  tokensUsed: {
    input: number;
    output: number;
  };
  /** Model that actually served the request */
  modelUsed: string;
}

/**
 * Usage report for billing reconciliation.
 */
export interface PayAIUsage {
  /** ISO 8601 timestamp of the call */
  timestamp: string;
  /** Model used */
  model: string;
  /** Token counts */
  tokens: { input: number; output: number };
  /** Cost in token base units */
  costBaseUnits: bigint;
  /** Whether the call succeeded */
  success: boolean;
}

// ---------------------------------------------------------------------------
// Model Enforcement Paths
// ---------------------------------------------------------------------------

/**
 * Model enforcement path — defines how the BOND executor
 * routes model requests based on mandate tier restrictions.
 */
export type ModelEnforcementPath =
  | 'allow'          // Mandate tier matches or exceeds — proceed
  | 'downgrade'      // Mandate tier is lower — route to cheaper model
  | 'reject'         // Mandate explicitly forbids this tier
  | 'escalate';      // Mandate requires approval from grantor

/** Tier numeric ranking — higher = more powerful/expensive */
const TIER_RANK: Record<string, number> = {
  'T1': 1, 'T2': 2, 'T3': 3, 'T4': 4, '*': 99,
};

/** Map known models to their tiers */
const MODEL_TIERS: Record<string, string> = {
  'qwen3:0.6b': 'T1', 'qwen3:4b': 'T1',
  'qwen3:14b': 'T2', 'deepseek-r1:14b': 'T2',
  'claude-sonnet-4-6': 'T3', 'gpt-4o': 'T3',
  'claude-opus-4-6': 'T4',
};

/**
 * Get the tier for a model ID. Returns 'T3' as default for unknown models.
 */
export function getModelTier(model: string): string {
  return MODEL_TIERS[model] ?? 'T3';
}

/**
 * Determine the enforcement path for a model request.
 * Logic follows enforcement-paths.md default resolution.
 */
export function resolveEnforcementPath(
  mandateTier: string,
  requestedModel: string,
): ModelEnforcementPath {
  if (mandateTier === '*') return 'allow';

  const requestedTier = getModelTier(requestedModel);
  const mandateRank = TIER_RANK[mandateTier] ?? 0;
  const requestedRank = TIER_RANK[requestedTier] ?? 0;

  if (requestedRank <= mandateRank) return 'allow';
  return 'reject';
}
