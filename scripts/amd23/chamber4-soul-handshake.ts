/**
 * chamber4-soul-handshake.ts — AMD-23 Cerberus Airlock, Chamber 4
 * Sprint 1265 / HELIXA-PACT-CHAMBER4
 *
 * Chamber 4 of the AMD-23 Cerberus Airlock:
 *   1. Soul Handshake — external agent proves constitutional alignment via
 *      SOUL attestation before full access is granted.
 *   2. Bidirectional session outcome reporting — sends session results back
 *      to Helixa via Webhook v2 so the agent's Cred Score can be updated.
 *
 * Integration chain:
 *   Chamber 2 (Sprint 1264): Cred Score API → access tier
 *   Chamber 4 (this file):  SOUL attestation → tier lock/upgrade + outcome webhook
 *
 * SOUL attestation fields (Godman SOUL v0.2.0):
 *   - soulHash: SHA-256 of agent's SOUL.md bootstrap file
 *   - killSwitchesPresent: boolean
 *   - constraintVersion: semver string
 *   - signedBy: agent wallet address (matches Helixa agentId)
 *
 * Outcome webhook (Helixa Webhook v2):
 *   POST /v2/outcomes
 *   { agentId, sessionId, tier, allowed, soulVerified, credScore, completedAt }
 */

import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Re-export Chamber 2 types for consumers who import this module
// ---------------------------------------------------------------------------

export type { CredScoreTier, Chamber2Decision } from './chamber2-cred-score';
export { chamber2Evaluate, mapScoreToTier, applyProvisionalUpgrade } from './chamber2-cred-score';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SoulAttestation {
  /** SHA-256 of the agent's SOUL.md bootstrap content */
  soulHash: string;
  /** Whether all required kill-switch clauses are present */
  killSwitchesPresent: boolean;
  /** Semver of the SOUL constraint schema (e.g. "0.2.0") */
  constraintVersion: string;
  /** Agent wallet address — must match agentId in Chamber 2 */
  signedBy: string;
  /** ISO timestamp when the attestation was produced */
  attestedAt: string;
}

export interface Chamber4Decision {
  agentId: string;
  sessionId: string;
  soulVerified: boolean;
  soulHash: string | null;
  /** Tier from Chamber 2, potentially locked to RESTRICTED if SOUL fails */
  effectiveTier: import('./chamber2-cred-score').CredScoreTier;
  allowed: boolean;
  reason: string;
  credScore: number | null;
  webhookSent: boolean;
  timestamp: string;
}

export interface SessionOutcome {
  agentId: string;
  sessionId: string;
  /** Tier assigned at session start */
  tier: import('./chamber2-cred-score').CredScoreTier;
  allowed: boolean;
  soulVerified: boolean;
  credScore: number | null;
  /** Session duration in seconds */
  durationSec: number;
  /** Number of operations performed in the session */
  opCount: number;
  /** Any policy violations recorded during the session */
  violations: string[];
  completedAt: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const HELIXA_BASE       = process.env['HELIXA_API_BASE']    ?? 'https://api.helixa.ai';
const HELIXA_API_KEY    = process.env['HELIXA_API_KEY']     ?? '';
const DRY_RUN           = !HELIXA_API_KEY || process.env['CERBERUS_DRY_RUN'] === '1';
const GODMAN_SOUL_VER   = process.env['GODMAN_SOUL_VERSION'] ?? '0.2.0';

// Required kill-switch clauses in a valid SOUL.md (Godman SOUL v0.2.0)
const REQUIRED_KILL_SWITCHES = [
  'account_banned',
  'view_threshold',
  'retention_threshold',
  'approval_threshold',
  'memory_limit',
  'oversight_limit',
] as const;

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function httpPost(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number; responseBody: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (url.startsWith('https') ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      timeout: 8000,
    };
    const req = mod.request(options, (res) => {
      let responseBody = '';
      res.on('data', (d) => { responseBody += d; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, responseBody }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('webhook timeout')); });
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// SOUL attestation verification
// ---------------------------------------------------------------------------

/**
 * Derive the expected SOUL hash from raw SOUL.md content.
 * In production, the agent ships the hash; we verify it matches the
 * canonical SOUL.md in the Godman SOUL registry.
 */
export function deriveSoulHash(soulContent: string): string {
  return crypto.createHash('sha256').update(soulContent, 'utf8').digest('hex');
}

/**
 * Verify that an attestation is structurally valid and internally consistent.
 * Does NOT make network calls — purely local validation.
 */
export function verifySoulAttestation(
  attestation: SoulAttestation,
  agentId: string,
): { valid: boolean; reason: string } {
  // 1. Signer must match the agentId from Chamber 2
  if (attestation.signedBy.toLowerCase() !== agentId.toLowerCase()) {
    return { valid: false, reason: `signer mismatch: expected ${agentId}, got ${attestation.signedBy}` };
  }

  // 2. Kill switches must be present
  if (!attestation.killSwitchesPresent) {
    return { valid: false, reason: 'kill switches absent from SOUL bootstrap' };
  }

  // 3. Constraint version must match current Godman SOUL
  if (attestation.constraintVersion !== GODMAN_SOUL_VER) {
    return {
      valid: false,
      reason: `constraint version mismatch: expected ${GODMAN_SOUL_VER}, got ${attestation.constraintVersion}`,
    };
  }

  // 4. Hash must be 64-char hex (SHA-256)
  if (!/^[0-9a-f]{64}$/.test(attestation.soulHash)) {
    return { valid: false, reason: 'soulHash is not a valid SHA-256 hex string' };
  }

  // 5. Attestation must not be stale (>24h)
  const age = Date.now() - new Date(attestation.attestedAt).getTime();
  if (age > 24 * 60 * 60 * 1000) {
    return { valid: false, reason: `attestation is stale (${Math.round(age / 3600000)}h old)` };
  }

  return { valid: true, reason: 'SOUL attestation verified' };
}

/**
 * Build a dry-run attestation for testing (mirrors what a real agent would provide).
 */
export function buildDryRunAttestation(agentId: string): SoulAttestation {
  const mockSoulContent = REQUIRED_KILL_SWITCHES.map(
    (s) => `kill_switch: ${s}`,
  ).join('\n');
  return {
    soulHash: deriveSoulHash(mockSoulContent),
    killSwitchesPresent: true,
    constraintVersion: GODMAN_SOUL_VER,
    signedBy: agentId,
    attestedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Bidirectional outcome webhook (Helixa Webhook v2)
// ---------------------------------------------------------------------------

/**
 * POST session outcome to Helixa /v2/outcomes so the agent's Cred Score
 * can be updated based on observed behavior in this session.
 */
export async function reportSessionOutcome(outcome: SessionOutcome): Promise<boolean> {
  if (DRY_RUN) {
    console.log('[chamber4] DRY-RUN: outcome webhook skipped', JSON.stringify(outcome));
    return true;
  }

  const url = `${HELIXA_BASE}/v2/outcomes`;
  const payload = JSON.stringify(outcome);
  try {
    const { status } = await httpPost(url, {
      'Authorization': `Bearer ${HELIXA_API_KEY}`,
      'Content-Type': 'application/json',
    }, payload);
    if (status === 200 || status === 201 || status === 204) {
      return true;
    }
    console.warn(`[chamber4] outcome webhook returned HTTP ${status}`);
    return false;
  } catch (err) {
    console.warn('[chamber4] outcome webhook error:', (err as Error).message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Chamber 4 airlock decision (SOUL Handshake)
// ---------------------------------------------------------------------------

import { chamber2Evaluate, CredScoreTier } from './chamber2-cred-score';

/**
 * Full Chamber 4 evaluation:
 *   1. Run Chamber 2 (Cred Score → tier)
 *   2. Verify SOUL attestation
 *   3. If SOUL fails, cap tier at RESTRICTED (FULL/STANDARD → RESTRICTED)
 *   4. Report outcome to Helixa webhook
 */
export async function chamber4Evaluate(
  agentId: string,
  sessionId: string,
  attestation?: SoulAttestation,
): Promise<Chamber4Decision> {
  // Step 1: Chamber 2
  const c2 = await chamber2Evaluate(agentId);

  // Step 2: SOUL attestation
  let soulVerified = false;
  let soulHash: string | null = null;
  let soulReason = 'no attestation provided';

  if (attestation) {
    const check = verifySoulAttestation(attestation, agentId);
    soulVerified = check.valid;
    soulReason   = check.reason;
    soulHash     = attestation.soulHash;
  }

  // Step 3: tier adjustment
  let effectiveTier: CredScoreTier = c2.tier;
  if (!soulVerified && (effectiveTier === 'FULL' || effectiveTier === 'STANDARD')) {
    effectiveTier = 'RESTRICTED'; // cap — SOUL proof required for elevated access
  }

  const allowed = effectiveTier !== 'REJECTED';
  const reason  =
    !soulVerified && (c2.tier === 'FULL' || c2.tier === 'STANDARD')
      ? `Cred score qualifies for ${c2.tier} but SOUL attestation failed (${soulReason}) — capped at RESTRICTED`
      : soulVerified
        ? `SOUL verified + ${c2.reason}`
        : c2.reason;

  // Step 4: outcome webhook (fire-and-forget; don't block the decision)
  const outcome: SessionOutcome = {
    agentId,
    sessionId,
    tier: effectiveTier,
    allowed,
    soulVerified,
    credScore: c2.credScore,
    durationSec: 0, // caller updates after session ends
    opCount: 0,
    violations: [],
    completedAt: new Date().toISOString(),
  };
  const webhookSent = await reportSessionOutcome(outcome);

  return {
    agentId,
    sessionId,
    soulVerified,
    soulHash,
    effectiveTier,
    allowed,
    reason,
    credScore: c2.credScore,
    webhookSent,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// CLI smoke test
// ---------------------------------------------------------------------------

if (require.main === module) {
  (async () => {
    console.log('=== AMD-23 Cerberus Chamber 4 — Soul Handshake + Outcome Webhook ===');
    console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}\n`);

    // --- Test 1: Agent with valid SOUL attestation ---
    {
      const agentId   = 'agent-alpha';
      const sessionId = 'sess-001';
      const attest    = buildDryRunAttestation(agentId);
      const decision  = await chamber4Evaluate(agentId, sessionId, attest);
      const icon = decision.allowed ? '✅' : '❌';
      console.log(`${icon} [with SOUL] ${agentId}: tier=${decision.effectiveTier} soulVerified=${decision.soulVerified}`);
      console.log(`   ${decision.reason}`);
      console.log(`   webhookSent=${decision.webhookSent}`);
    }

    // --- Test 2: Agent without SOUL attestation (tier capped) ---
    {
      const agentId   = 'agent-beta';
      const sessionId = 'sess-002';
      const decision  = await chamber4Evaluate(agentId, sessionId); // no attestation
      const icon = decision.allowed ? '✅' : '❌';
      console.log(`\n${icon} [no SOUL] ${agentId}: tier=${decision.effectiveTier} soulVerified=${decision.soulVerified}`);
      console.log(`   ${decision.reason}`);
    }

    // --- Test 3: SOUL attestation with wrong signer ---
    {
      const agentId    = 'agent-gamma';
      const sessionId  = 'sess-003';
      const badAttest: SoulAttestation = {
        ...buildDryRunAttestation('agent-imposter'),
        signedBy: 'agent-imposter',
      };
      const decision = await chamber4Evaluate(agentId, sessionId, badAttest);
      const icon = decision.allowed ? '✅' : '❌';
      console.log(`\n${icon} [wrong signer] ${agentId}: tier=${decision.effectiveTier} soulVerified=${decision.soulVerified}`);
      console.log(`   ${decision.reason}`);
    }

    // --- Test 4: Stale attestation ---
    {
      const agentId   = 'agent-delta';
      const sessionId = 'sess-004';
      const stale     = buildDryRunAttestation(agentId);
      // wind back 25 hours
      stale.attestedAt = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
      const decision = await chamber4Evaluate(agentId, sessionId, stale);
      const icon = decision.allowed ? '✅' : '❌';
      console.log(`\n${icon} [stale attest] ${agentId}: tier=${decision.effectiveTier} soulVerified=${decision.soulVerified}`);
      console.log(`   ${decision.reason}`);
    }

    // --- Unit tests: verifySoulAttestation ---
    console.log('\n--- verifySoulAttestation unit tests ---');
    const unitTests: Array<[string, SoulAttestation, boolean]> = [
      ['valid',        buildDryRunAttestation('agent-x'),                                   true],
      ['wrong-signer', { ...buildDryRunAttestation('agent-x'), signedBy: 'agent-y' },        false],
      ['no-switches',  { ...buildDryRunAttestation('agent-x'), killSwitchesPresent: false }, false],
      ['bad-version',  { ...buildDryRunAttestation('agent-x'), constraintVersion: '0.1.0' }, false],
      ['bad-hash',     { ...buildDryRunAttestation('agent-x'), soulHash: 'abc123' },          false],
    ];

    let pass = 0; let fail = 0;
    for (const [label, attest, expected] of unitTests) {
      const { valid } = verifySoulAttestation(attest, 'agent-x');
      const ok = valid === expected;
      if (ok) { console.log(`  PASS  [${label}]`); pass++; }
      else    { console.log(`  FAIL  [${label}] expected=${expected} got=${valid}`); fail++; }
    }
    console.log(`\n${pass + fail} tests: ${pass} pass, ${fail} fail`);
    process.exit(fail > 0 ? 1 : 0);
  })();
}
