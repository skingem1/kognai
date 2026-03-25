#!/usr/bin/env npx ts-node
/**
 * cerberus-integration-test.ts — Sprint 1289
 * AMD23 Cerberus gateway end-to-end integration test via HTTP.
 *
 * Starts the Cerberus server in dry-run mode, sends a full evaluate request,
 * confirms the signed GatewayDecision is returned with a valid HMAC.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/amd23/cerberus-integration-test.ts
 *   CERBERUS_DRY_RUN=1 npx ts-node --transpile-only scripts/amd23/cerberus-integration-test.ts
 */

import * as http from 'http';
import * as crypto from 'crypto';
import * as path from 'path';
import * as dotenv from 'dotenv';

const ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(ROOT, '.env') });

// Force dry-run for test so no external API calls are made
process.env['CERBERUS_DRY_RUN'] = '1';
process.env['CERBERUS_PORT'] = '3420'; // use different port to avoid conflict with live server
const PORT   = 3420;
const SECRET = process.env['CERBERUS_SECRET'] ?? 'cerberus-dev-secret';

// ---- helpers ----------------------------------------------------------------

function post(port: number, path: string, body: unknown): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let raw = '';
        res.on('data', (d) => { raw += d; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode ?? 0, data: raw }); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(new Error('Request timeout')); });
    req.write(payload);
    req.end();
  });
}

function get(port: number, path: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'GET' },
      (res) => {
        let raw = '';
        res.on('data', (d) => { raw += d; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode ?? 0, data: raw }); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(new Error('Request timeout')); });
    req.end();
  });
}

function verifyHmac(d: any): boolean {
  const payload = `${d.agentId}|${d.sessionId}|${d.tier}|${d.allowed}|${d.expiresAt}`;
  const expected = crypto.createHmac('sha256', SECRET).update(payload, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(d.signature ?? ''));
  } catch {
    return false;
  }
}

// ---- test runner ------------------------------------------------------------

interface TestResult { name: string; pass: boolean; detail: string }
const results: TestResult[] = [];

function test(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  const icon = pass ? '✅' : '❌';
  console.log(`${icon} ${name}: ${detail}`);
}

// ---- main -------------------------------------------------------------------

(async () => {
  console.log('\n=== Cerberus Integration Test (dry-run) ===\n');

  // Start server in-process
  const { createCerberusServer } = await import('./cerberus-gateway');
  const server = createCerberusServer();
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  console.log(`Server started on port ${PORT}\n`);

  try {
    // Test 1: Health check
    const health = await get(PORT, '/cerberus/health');
    test('1. Health endpoint returns 200', health.status === 200,
      `status=${health.status} mode=${health.data?.mode ?? '?'}`);

    // Test 2: Basic evaluate (no attestation)
    const eval1 = await post(PORT, '/cerberus/evaluate', { agentId: 'test-agent-alpha' });
    const d1 = eval1.data;
    test('2. Evaluate returns 200', eval1.status === 200, `status=${eval1.status}`);
    test('3. Response has agentId', d1?.agentId === 'test-agent-alpha', `agentId=${d1?.agentId}`);
    test('4. Response has signature', typeof d1?.signature === 'string' && d1.signature.length === 64,
      `signature length=${d1?.signature?.length ?? 0}`);
    test('5. HMAC signature is valid', verifyHmac(d1),
      verifyHmac(d1) ? 'signature verified' : 'HMAC mismatch');
    test('6. Response has expiresAt', !!d1?.expiresAt,
      `expiresAt=${d1?.expiresAt ?? 'missing'}`);
    test('7. Response has tier', !!d1?.tier,
      `tier=${d1?.tier ?? 'missing'}`);

    // Test 3: Evaluate with session ID (determinism)
    const eval2 = await post(PORT, '/cerberus/evaluate', {
      agentId: 'test-agent-beta',
      sessionId: 'fixed-session-42',
    });
    const d2 = eval2.data;
    test('8. Evaluate with sessionId returns provided sessionId',
      d2?.sessionId === 'fixed-session-42', `sessionId=${d2?.sessionId}`);

    // Test 4: Tampered signature detection
    if (d1) {
      const tampered = { ...d1, signature: 'a'.repeat(64) };
      const sigOk = verifyHmac(tampered);
      test('9. Tampered signature is rejected', !sigOk, `tampered signature ${sigOk ? 'WRONGLY accepted' : 'correctly rejected'}`);
    }

    // Test 5: Missing agentId → 400
    const evalBad = await post(PORT, '/cerberus/evaluate', { sessionId: 'no-agent' });
    test('10. Missing agentId returns 400', evalBad.status === 400,
      `status=${evalBad.status} error=${evalBad.data?.code ?? '?'}`);

  } finally {
    server.close();
  }

  // Summary
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n--- Summary ---`);
  console.log(`✅ Pass: ${passed} | ❌ Fail: ${failed} | Total: ${results.length}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter(r => !r.pass)) {
      console.log(`  ❌ ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed — Cerberus gateway integration verified');
    process.exit(0);
  }
})();
