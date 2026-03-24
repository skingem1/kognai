/**
 * Achiri HTTP API Smoke Test — Sprint 979
 * Tests all endpoints that don't require LLM calls.
 * For /chat: tests input validation only (no LLM needed).
 * Run: npx tsx agents/achiri/smoke.test.ts
 */

import * as http from 'http';

const PORT = 13420; // Use non-default port to avoid conflicts
process.env.ACHIRI_PORT = String(PORT);

let pass = 0;
let fail = 0;

function assert(label: string, condition: boolean) {
  if (condition) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}

function request(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode ?? 0, data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('Achiri HTTP API Smoke Test\n');

  // Wait for server to be ready
  await new Promise(r => setTimeout(r, 500));

  // 1. GET /health
  const health = await request('GET', '/health');
  assert('GET /health → 200', health.status === 200);
  assert('health has status=ok', health.data.status === 'ok');
  assert('health has version', typeof health.data.version === 'string');
  assert('health has uptime_s', typeof health.data.uptime_s === 'number');

  // 2. GET /stats
  const stats = await request('GET', '/stats');
  assert('GET /stats → 200', stats.status === 200);
  assert('stats has uptime_s', typeof stats.data.uptime_s === 'number');

  // 3. GET /analytics
  const analytics = await request('GET', '/analytics');
  assert('GET /analytics → 200', analytics.status === 200);
  assert('analytics has users object', typeof analytics.data.users === 'object');
  assert('analytics has messages object', typeof analytics.data.messages === 'object');
  assert('analytics has errors object', typeof analytics.data.errors === 'object');

  // 4. GET /profile/:userId (non-existent user → empty profile)
  const profile = await request('GET', '/profile/smoke-test-user-xyz');
  assert('GET /profile → 200', profile.status === 200);
  assert('profile has userId', profile.data.userId === 'smoke-test-user-xyz');

  // 5. GET /summary/:userId (non-existent → empty summary)
  const summary = await request('GET', '/summary/smoke-test-user-xyz');
  assert('GET /summary → 200', summary.status === 200);
  assert('summary has facts array', Array.isArray(summary.data.facts));

  // 6. GET /export/:userId (non-existent → empty export)
  const exp = await request('GET', '/export/smoke-test-user-xyz');
  assert('GET /export → 200', exp.status === 200);
  assert('export has turns=0', exp.data.turns === 0);
  assert('export has conversation array', Array.isArray(exp.data.conversation));

  // 7. GET /tier/:userId (non-existent → default tier)
  const tier = await request('GET', '/tier/smoke-test-user-xyz');
  assert('GET /tier → 200', tier.status === 200);
  assert('tier has userId', tier.data.userId === 'smoke-test-user-xyz');
  assert('tier defaults to free', tier.data.tier === 'free');

  // 8. POST /chat — missing message → 400
  const chatBad = await request('POST', '/chat', { userId: 'test' });
  assert('POST /chat no message → 400', chatBad.status === 400);
  assert('chat error says message required', chatBad.data.error === 'message is required');

  // 9. POST /chat — invalid JSON
  const chatInvalid = await new Promise<{ status: number; data: any }>((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path: '/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': 5 },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, data: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write('{bad}');
    req.end();
  });
  assert('POST /chat invalid JSON → 400', chatInvalid.status === 400);

  // 10. GET /upgrade — missing tier → 400
  const upgradeBad = await request('GET', '/upgrade?userId=test');
  assert('GET /upgrade no tier → 400', upgradeBad.status === 400);

  // 11. DELETE /memory/:userId (non-existent → still ok)
  const del = await request('DELETE', '/memory/smoke-test-user-xyz');
  assert('DELETE /memory → 200', del.status === 200);
  assert('delete returns ok:true', del.data.ok === true);

  // 12. 404 for unknown route
  const notFound = await request('GET', '/nonexistent');
  assert('GET /nonexistent → 404', notFound.status === 404);

  console.log(`\n${pass}/${pass + fail} PASS${fail > 0 ? ` (${fail} FAILED)` : ''}`);

  // Cleanup: close server
  const { server } = await import('./server.js');
  server.close();
  process.exit(fail > 0 ? 1 : 0);
}

// Import server to start it, then run tests
import('./server.js').then(() => runTests()).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
