/**
 * chamber2-cred-score.ts — AMD-23 Cerberus Airlock, Chamber 2
 * Sprint 1264 / HELIXA-PACT-CHAMBER2
 *
 * Integrates Helixa Cred Score API into the AMD-23 Cerberus airlock.
 * Helixa merged into Bankr (69K agents).
 *
 * Score ceiling mapping (INTEL-019 + PACT×Helixa spec):
 *   85–100 → FULL
 *   70–84  → STANDARD
 *   50–69  → RESTRICTED
 *   <30    → REJECTED
 *   unverified → PROVISIONAL (upgrades to STANDARD with SIWA + score >= 60)
 *
 * Three PACT integration points:
 *   1. Chamber 2 (this file): Cred Score API → access tier
 *   2. Bidirectional outcomes (Sprint 1265)
 *   3. Chamber 4 Soul Handshake (Sprint 1265)
 */

import * as https from 'https';
import * as http from 'http';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CredScoreTier = 'FULL' | 'STANDARD' | 'RESTRICTED' | 'REJECTED' | 'PROVISIONAL';

export interface HelixaCredResult {
  agentId: string;
  score: number | null;           // null = unverified / API unavailable
  tier: CredScoreTier;
  siwaVerified: boolean;
  rawResponse: unknown;
}

export interface Chamber2Decision {
  agentId: string;
  tier: CredScoreTier;
  allowed: boolean;
  reason: string;
  credScore: number | null;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Cred Score → Tier mapping
// ---------------------------------------------------------------------------

export function mapScoreToTier(score: number | null, siwaVerified: boolean): CredScoreTier {
  if (score === null) return 'PROVISIONAL';
  if (score < 30)   return 'REJECTED';
  if (score < 50)   return 'PROVISIONAL';
  if (score < 70)   return 'RESTRICTED';
  if (score < 85)   return 'STANDARD';
  return 'FULL';
}

/**
 * Upgrade PROVISIONAL or RESTRICTED → STANDARD if SIWA-verified and score >= 60.
 * SIWA (Sign In With Aptos) verification + sufficient score unlocks STANDARD tier.
 */
export function applyProvisionalUpgrade(tier: CredScoreTier, score: number | null, siwaVerified: boolean): CredScoreTier {
  if (siwaVerified && score !== null && score >= 60 &&
      (tier === 'PROVISIONAL' || tier === 'RESTRICTED')) {
    return 'STANDARD';
  }
  return tier;
}

// ---------------------------------------------------------------------------
// Helixa API client (dry-run safe)
// ---------------------------------------------------------------------------

const HELIXA_BASE = process.env['HELIXA_API_BASE'] ?? 'https://api.helixa.ai';
const HELIXA_API_KEY = process.env['HELIXA_API_KEY'] ?? '';
const DRY_RUN = !HELIXA_API_KEY || process.env['CERBERUS_DRY_RUN'] === '1';

function httpGet(url: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers, timeout: 6000 }, (res) => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/**
 * Fetch Helixa Cred Score for an agent wallet address.
 * Returns null score if API unavailable or dry-run mode.
 */
export async function fetchCredScore(agentId: string): Promise<HelixaCredResult> {
  if (DRY_RUN) {
    // Dry-run: return a mock score for testing
    const mockScore = Math.floor(Math.random() * 50) + 50; // 50–100 range
    const tier = mapScoreToTier(mockScore, false);
    return { agentId, score: mockScore, tier, siwaVerified: false, rawResponse: { dry_run: true, mock_score: mockScore } };
  }

  try {
    const url = `${HELIXA_BASE}/v1/cred/score?agent=${encodeURIComponent(agentId)}`;
    const { status, body } = await httpGet(url, { Authorization: `Bearer ${HELIXA_API_KEY}` });
    if (status !== 200) {
      return { agentId, score: null, tier: 'PROVISIONAL', siwaVerified: false, rawResponse: { status, error: body } };
    }
    const data = JSON.parse(body);
    const score: number | null = typeof data.score === 'number' ? data.score : null;
    const siwaVerified: boolean = data.siwa_verified === true;
    let tier = mapScoreToTier(score, siwaVerified);
    tier = applyProvisionalUpgrade(tier, score, siwaVerified);
    return { agentId, score, tier, siwaVerified, rawResponse: data };
  } catch (err) {
    return { agentId, score: null, tier: 'PROVISIONAL', siwaVerified: false, rawResponse: { error: (err as Error).message } };
  }
}

// ---------------------------------------------------------------------------
// Chamber 2 airlock decision
// ---------------------------------------------------------------------------

const ALLOWED_TIERS: CredScoreTier[] = ['FULL', 'STANDARD', 'RESTRICTED', 'PROVISIONAL'];

export async function chamber2Evaluate(agentId: string): Promise<Chamber2Decision> {
  const cred = await fetchCredScore(agentId);
  const tier = applyProvisionalUpgrade(cred.tier, cred.score, cred.siwaVerified);
  const allowed = ALLOWED_TIERS.includes(tier);
  const reason =
    tier === 'FULL'        ? 'Cred score ≥85 — full access granted'
    : tier === 'STANDARD'  ? 'Cred score 70–84 — standard access'
    : tier === 'RESTRICTED'? 'Cred score 50–69 — restricted access (read-only operations)'
    : tier === 'PROVISIONAL'? 'Unverified — provisional access (SIWA + score≥60 to upgrade)'
    : 'Cred score <30 — access rejected';

  return {
    agentId,
    tier,
    allowed,
    reason,
    credScore: cred.score,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// CLI smoke test
// ---------------------------------------------------------------------------

if (require.main === module) {
  (async () => {
    console.log('=== AMD-23 Cerberus Chamber 2 — Helixa Cred Score ===');
    console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}\n`);

    const testAgents = ['agent-alpha', 'agent-beta', 'agent-gamma'];
    for (const agent of testAgents) {
      const decision = await chamber2Evaluate(agent);
      const icon = decision.allowed ? '✅' : '❌';
      console.log(`${icon} ${agent}: ${decision.tier} (score=${decision.credScore ?? 'n/a'})`);
      console.log(`   ${decision.reason}`);
    }

    // Verify tier mapping
    const tests: [number | null, boolean, CredScoreTier][] = [
      [90, false, 'FULL'], [75, false, 'STANDARD'], [60, false, 'RESTRICTED'],
      [62, true,  'STANDARD'], // PROVISIONAL upgraded via SIWA + score>=60
      [25, false, 'REJECTED'], [null, false, 'PROVISIONAL'],
    ];
    console.log('\n--- Tier mapping tests ---');
    let pass = 0; let fail = 0;
    for (const [score, siwa, expected] of tests) {
      let tier = mapScoreToTier(score, siwa);
      tier = applyProvisionalUpgrade(tier, score, siwa);
      const ok = tier === expected;
      if (ok) { console.log(`  PASS  score=${score ?? 'null'} siwa=${siwa} → ${tier}`); pass++; }
      else    { console.log(`  FAIL  score=${score ?? 'null'} siwa=${siwa} → ${tier} (expected ${expected})`); fail++; }
    }
    console.log(`\n${pass + fail} tests: ${pass} pass, ${fail} fail`);
    process.exit(fail > 0 ? 1 : 0);
  })();
}
