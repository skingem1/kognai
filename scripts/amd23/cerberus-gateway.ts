/**
 * cerberus-gateway.ts — AMD-23 Cerberus Airlock Gateway
 * Sprint 1268 / AMD23-CERBERUS-GATEWAY
 *
 * The single entry-point for external agents requesting access to Kognai services.
 * Runs the full Chamber 2 → Chamber 4 pipeline in sequence:
 *
 *   Chamber 2: Helixa Cred Score API → access tier (Sprint 1264)
 *   Chamber 4: SOUL attestation + outcome webhook (Sprint 1265)
 *
 * Access flow:
 *   1. External agent POSTs { agentId, sessionId, attestation? } to /cerberus/evaluate
 *   2. Gateway runs C2 (Cred Score) + C4 (SOUL Handshake) in sequence
 *   3. Returns signed GatewayDecision (HMAC-SHA256 over decision payload)
 *   4. Access token (JWT-lite) valid for SESSION_TTL_MINUTES (default: 60)
 *
 * HTTP server: POST /cerberus/evaluate, GET /cerberus/health (port 3419)
 *
 * Environment:
 *   CERBERUS_PORT         — HTTP port (default: 3419)
 *   CERBERUS_SECRET       — HMAC signing secret for gateway decisions
 *   CERBERUS_DRY_RUN=1   — dry-run mode (no external API calls)
 *   HELIXA_API_KEY        — Helixa Cred Score API key
 *   HELIXA_API_BASE       — Helixa base URL
 */

import * as http from 'http';
import * as crypto from 'crypto';
import { chamber4Evaluate, SoulAttestation } from './chamber4-soul-handshake';
import type { CredScoreTier } from './chamber2-cred-score';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT           = parseInt(process.env['CERBERUS_PORT'] ?? '3419', 10);
const SECRET         = process.env['CERBERUS_SECRET'] ?? 'cerberus-dev-secret';
const DRY_RUN        = process.env['CERBERUS_DRY_RUN'] === '1' || !process.env['HELIXA_API_KEY'];
const SESSION_TTL_MS = (parseInt(process.env['CERBERUS_SESSION_TTL_MIN'] ?? '60', 10)) * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvaluateRequest {
  agentId: string;
  sessionId?: string;
  attestation?: SoulAttestation;
}

export interface GatewayDecision {
  agentId: string;
  sessionId: string;
  tier: CredScoreTier;
  allowed: boolean;
  soulVerified: boolean;
  credScore: number | null;
  reason: string;
  /** ISO expiry timestamp — token valid until this time */
  expiresAt: string;
  /** HMAC-SHA256 signature over the canonical payload */
  signature: string;
  timestamp: string;
}

export interface GatewayError {
  error: string;
  code: 'BAD_REQUEST' | 'INTERNAL_ERROR' | 'REJECTED';
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Sign a gateway decision. The signature is HMAC-SHA256 over the canonical payload:
 * `${agentId}|${sessionId}|${tier}|${allowed}|${expiresAt}`
 *
 * Consumers verify by recomputing the HMAC with the shared secret.
 */
function signDecision(
  agentId: string,
  sessionId: string,
  tier: CredScoreTier,
  allowed: boolean,
  expiresAt: string,
): string {
  const payload = `${agentId}|${sessionId}|${tier}|${allowed}|${expiresAt}`;
  return crypto.createHmac('sha256', SECRET).update(payload, 'utf8').digest('hex');
}

export function verifyDecision(decision: GatewayDecision): boolean {
  const expected = signDecision(
    decision.agentId,
    decision.sessionId,
    decision.tier,
    decision.allowed,
    decision.expiresAt,
  );
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(decision.signature));
}

// ---------------------------------------------------------------------------
// Core evaluation
// ---------------------------------------------------------------------------

/**
 * Run the full Cerberus pipeline (C2 → C4) for an external agent access request.
 */
export async function evaluate(req: EvaluateRequest): Promise<GatewayDecision> {
  const sessionId = req.sessionId ?? crypto.randomUUID();
  const now       = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  const c4 = await chamber4Evaluate(req.agentId, sessionId, req.attestation);

  const signature = signDecision(
    c4.agentId,
    c4.sessionId,
    c4.effectiveTier,
    c4.allowed,
    expiresAt,
  );

  return {
    agentId:      c4.agentId,
    sessionId:    c4.sessionId,
    tier:         c4.effectiveTier,
    allowed:      c4.allowed,
    soulVerified: c4.soulVerified,
    credScore:    c4.credScore,
    reason:       c4.reason,
    expiresAt,
    signature,
    timestamp:    now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJSON(res: http.ServerResponse, status: number, data: unknown): void {
  const payload = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Cerberus-Version': '1.0',
  });
  res.end(payload);
}

export function createCerberusServer(): http.Server {
  return http.createServer(async (req, res) => {
    const { method, url } = req;

    // Health check
    if (method === 'GET' && url === '/cerberus/health') {
      sendJSON(res, 200, {
        status: 'ok',
        mode: DRY_RUN ? 'dry-run' : 'live',
        port: PORT,
        sessionTtlMin: SESSION_TTL_MS / 60000,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Evaluate endpoint
    if (method === 'POST' && url === '/cerberus/evaluate') {
      let body: string;
      try {
        body = await readBody(req);
      } catch {
        sendJSON(res, 400, { error: 'Failed to read request body', code: 'BAD_REQUEST', timestamp: new Date().toISOString() } as GatewayError);
        return;
      }

      let evalReq: EvaluateRequest;
      try {
        evalReq = JSON.parse(body);
      } catch {
        sendJSON(res, 400, { error: 'Invalid JSON', code: 'BAD_REQUEST', timestamp: new Date().toISOString() } as GatewayError);
        return;
      }

      if (!evalReq.agentId || typeof evalReq.agentId !== 'string') {
        sendJSON(res, 400, { error: 'agentId is required', code: 'BAD_REQUEST', timestamp: new Date().toISOString() } as GatewayError);
        return;
      }

      try {
        const decision = await evaluate(evalReq);
        const statusCode = decision.allowed ? 200 : 403;
        sendJSON(res, statusCode, decision);
      } catch (err) {
        console.error('[cerberus] evaluation error:', (err as Error).message);
        sendJSON(res, 500, { error: 'Internal evaluation error', code: 'INTERNAL_ERROR', timestamp: new Date().toISOString() } as GatewayError);
      }
      return;
    }

    sendJSON(res, 404, { error: 'Not found', code: 'BAD_REQUEST', timestamp: new Date().toISOString() });
  });
}

// ---------------------------------------------------------------------------
// CLI / server entry point
// ---------------------------------------------------------------------------

async function runSmokeTest(): Promise<void> {
  console.log('=== AMD-23 Cerberus Gateway — Smoke Test ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}\n`);

  // Test 1: no attestation
  {
    const d = await evaluate({ agentId: 'agent-alpha', sessionId: 'smoke-001' });
    const icon = d.allowed ? '✅' : '❌';
    console.log(`${icon} [no attest] ${d.agentId}: tier=${d.tier} soul=${d.soulVerified} score=${d.credScore}`);
    console.log(`   ${d.reason}`);
    const valid = verifyDecision(d);
    console.log(`   sig valid: ${valid}`);
  }

  // Test 2: with valid SOUL attestation
  {
    const { buildDryRunAttestation } = await import('./chamber4-soul-handshake');
    const attest = buildDryRunAttestation('agent-beta');
    const d = await evaluate({ agentId: 'agent-beta', sessionId: 'smoke-002', attestation: attest });
    const icon = d.allowed ? '✅' : '❌';
    console.log(`\n${icon} [with SOUL] ${d.agentId}: tier=${d.tier} soul=${d.soulVerified} score=${d.credScore}`);
    console.log(`   ${d.reason}`);
    console.log(`   expires: ${d.expiresAt}`);
    const valid = verifyDecision(d);
    console.log(`   sig valid: ${valid}`);
  }

  // Test 3: signature tamper detection
  {
    const d = await evaluate({ agentId: 'agent-gamma', sessionId: 'smoke-003' });
    const tampered = { ...d, tier: 'FULL' as CredScoreTier }; // forge a tier upgrade
    const valid = verifyDecision(tampered);
    console.log(`\n🔒 Tamper detection: forged FULL tier → sig valid=${valid} (expected: false)`);
    if (!valid) console.log('   PASS — signature correctly rejected tampered decision');
    else        console.log('   FAIL — signature should have rejected tampered tier');
  }

  console.log('\n✅ Smoke test complete.');
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--smoke-test')) {
    runSmokeTest().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
  } else {
    const server = createCerberusServer();
    server.listen(PORT, () => {
      console.log(`AMD-23 Cerberus Gateway listening on :${PORT}`);
      console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
      console.log('Routes: POST /cerberus/evaluate  GET /cerberus/health');
    });
  }
}
