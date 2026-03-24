/**
 * BOND Runtime — Sprint 987
 * MandateManager: create, execute, revoke, budget check, period rotation.
 * In-memory implementation (no blockchain required).
 * Uses Node.js crypto for mandate ID generation.
 */

import { createHash, randomBytes } from 'crypto';
import {
  RecurringMandate,
  MandateState,
  XMandateHeaders,
  buildXMandateHeaders,
  resolveEnforcementPath,
  getModelTier,
  ModelEnforcementPath,
} from './bond-schema';

// ---------------------------------------------------------------------------
// Mandate Manager
// ---------------------------------------------------------------------------

export interface ExecuteResult {
  allowed: boolean;
  enforcementPath: ModelEnforcementPath;
  mandateState: MandateState;
  reason?: string;
}

export interface CreateMandateOpts {
  grantor: string;
  grantee: string;
  tokenAddress?: string;
  maxAmountPerCall: bigint;
  maxCallsPerPeriod: number;
  periodSeconds: number;
  validFrom?: number;
  validUntil?: number;
  modelTier: string;
}

export class MandateManager {
  private mandates = new Map<string, RecurringMandate>();
  private states = new Map<string, MandateState>();

  /**
   * Create a new recurring mandate. Returns the mandate with a generated ID and signature.
   */
  create(opts: CreateMandateOpts): RecurringMandate {
    const now = Math.floor(Date.now() / 1000);
    const mandateId = '0x' + randomBytes(32).toString('hex');
    const nonce = 0;

    // Simulate EIP-712 signature with HMAC (real impl would use ethers.js)
    const sigData = `${mandateId}:${opts.grantor}:${opts.grantee}:${nonce}`;
    const signature = '0x' + createHash('sha256').update(sigData).digest('hex');

    const mandate: RecurringMandate = {
      mandateId,
      grantor: opts.grantor,
      grantee: opts.grantee,
      tokenAddress: opts.tokenAddress ?? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
      maxAmountPerCall: opts.maxAmountPerCall,
      maxCallsPerPeriod: opts.maxCallsPerPeriod,
      periodSeconds: opts.periodSeconds,
      validFrom: opts.validFrom ?? now,
      validUntil: opts.validUntil ?? 0,
      modelTier: opts.modelTier,
      nonce,
      signature,
    };

    const state: MandateState = {
      mandateId,
      periodStart: now,
      callsThisPeriod: 0,
      amountThisPeriod: 0n,
      revoked: false,
      lastExecutedAt: 0,
    };

    this.mandates.set(mandateId, mandate);
    this.states.set(mandateId, state);
    return mandate;
  }

  /**
   * Get mandate by ID.
   */
  getMandate(mandateId: string): RecurringMandate | undefined {
    return this.mandates.get(mandateId);
  }

  /**
   * Get mandate state by ID.
   */
  getState(mandateId: string): MandateState | undefined {
    return this.states.get(mandateId);
  }

  /**
   * Build X-Mandate headers for an API call.
   */
  buildHeaders(mandateId: string): XMandateHeaders | undefined {
    const mandate = this.mandates.get(mandateId);
    if (!mandate) return undefined;
    return buildXMandateHeaders(mandate);
  }

  /**
   * Check if a mandate can execute a call for the given model and cost.
   * If allowed, debits the budget and increments the call counter.
   */
  execute(mandateId: string, model: string, cost: bigint): ExecuteResult {
    const mandate = this.mandates.get(mandateId);
    const state = this.states.get(mandateId);

    if (!mandate || !state) {
      return {
        allowed: false,
        enforcementPath: 'reject',
        mandateState: state ?? { mandateId, periodStart: 0, callsThisPeriod: 0, amountThisPeriod: 0n, revoked: true, lastExecutedAt: 0 },
        reason: 'Mandate not found',
      };
    }

    // Check revocation
    if (state.revoked) {
      return { allowed: false, enforcementPath: 'reject', mandateState: state, reason: 'Mandate revoked' };
    }

    // Check validity window
    const now = Math.floor(Date.now() / 1000);
    if (now < mandate.validFrom) {
      return { allowed: false, enforcementPath: 'reject', mandateState: state, reason: 'Mandate not yet valid' };
    }
    if (mandate.validUntil > 0 && now > mandate.validUntil) {
      return { allowed: false, enforcementPath: 'reject', mandateState: state, reason: 'Mandate expired' };
    }

    // Check model tier enforcement
    const path = resolveEnforcementPath(mandate.modelTier, model);
    if (path === 'reject' || path === 'escalate') {
      return { allowed: false, enforcementPath: path, mandateState: state, reason: `Model ${model} (${getModelTier(model)}) not allowed by mandate tier ${mandate.modelTier}` };
    }

    // Rotate period if needed
    if (now - state.periodStart >= mandate.periodSeconds) {
      state.periodStart = now;
      state.callsThisPeriod = 0;
      state.amountThisPeriod = 0n;
    }

    // Check call limit
    if (state.callsThisPeriod >= mandate.maxCallsPerPeriod) {
      return { allowed: false, enforcementPath: 'reject', mandateState: state, reason: 'Period call limit exceeded' };
    }

    // Check amount limit
    if (cost > mandate.maxAmountPerCall) {
      return { allowed: false, enforcementPath: 'reject', mandateState: state, reason: `Cost ${cost} exceeds max per call ${mandate.maxAmountPerCall}` };
    }

    // Execute: debit budget
    state.callsThisPeriod++;
    state.amountThisPeriod += cost;
    state.lastExecutedAt = now;

    return { allowed: true, enforcementPath: path, mandateState: state };
  }

  /**
   * Revoke a mandate. Irreversible.
   */
  revoke(mandateId: string): boolean {
    const state = this.states.get(mandateId);
    if (!state) return false;
    state.revoked = true;
    return true;
  }

  /**
   * Get all active (non-revoked, non-expired) mandates.
   */
  listActive(): RecurringMandate[] {
    const now = Math.floor(Date.now() / 1000);
    const active: RecurringMandate[] = [];
    for (const [id, mandate] of this.mandates) {
      const state = this.states.get(id);
      if (!state || state.revoked) continue;
      if (mandate.validUntil > 0 && now > mandate.validUntil) continue;
      active.push(mandate);
    }
    return active;
  }

  /**
   * Get budget remaining for a mandate in the current period.
   */
  budgetRemaining(mandateId: string): { callsLeft: number; amountUsed: bigint } | undefined {
    const mandate = this.mandates.get(mandateId);
    const state = this.states.get(mandateId);
    if (!mandate || !state) return undefined;

    // Rotate period if stale
    const now = Math.floor(Date.now() / 1000);
    if (now - state.periodStart >= mandate.periodSeconds) {
      return { callsLeft: mandate.maxCallsPerPeriod, amountUsed: 0n };
    }

    return {
      callsLeft: mandate.maxCallsPerPeriod - state.callsThisPeriod,
      amountUsed: state.amountThisPeriod,
    };
  }
}
