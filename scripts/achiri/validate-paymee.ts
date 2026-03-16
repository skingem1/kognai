// Sprint 126 — validate-paymee.ts
// 5 validation checks for the paymee T3 skill.
// Run: npx ts-node scripts/achiri/validate-paymee.ts

import * as http from 'http';
import * as child_process from 'child_process';
import * as path from 'path';

// Force mock mode for validation (no real API key needed)
process.env.PAYMEE_MOCK = '1';

import { createCheckoutUrl, getUpgradeMessage } from '../../agents/achiri/paymee';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function waitForPort(port: number, maxMs = 4000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/health`, (res) => {
          res.resume();
          resolve();
        });
        req.on('error', reject);
        req.setTimeout(200, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return false;
}

function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function main(): Promise<void> {
  console.log('=== Sprint 126 — Paymee T3 Skill Validation ===\n');

  // Check 1: tnd_basic checkout URL generated in mock mode, amount=9
  console.log('Check 1: tnd_basic checkout URL (mock mode, amount=9)');
  const r1 = await createCheckoutUrl({ userId: 'user-test-001', tier: 'tnd_basic' });
  check('checkout_url contains order_id', r1.checkout_url.includes(r1.order_id));
  check('amount_tnd = 9', r1.amount_tnd === 9);
  check('mock = true', r1.mock === true);
  check('tier = tnd_basic', r1.tier === 'tnd_basic');

  console.log('\nCheck 2: tnd_premium checkout URL (mock mode, amount=25)');
  const r2 = await createCheckoutUrl({ userId: 'user-test-002', tier: 'tnd_premium' });
  check('checkout_url contains order_id', r2.checkout_url.includes(r2.order_id));
  check('amount_tnd = 25', r2.amount_tnd === 25);
  check('tier = tnd_premium', r2.tier === 'tnd_premium');

  console.log('\nCheck 3: order_id is unique per call');
  const r3a = await createCheckoutUrl({ userId: 'user-uid', tier: 'tnd_basic' });
  const r3b = await createCheckoutUrl({ userId: 'user-uid', tier: 'tnd_basic' });
  check('order_ids are different', r3a.order_id !== r3b.order_id, `${r3a.order_id} vs ${r3b.order_id}`);

  console.log('\nCheck 4: getUpgradeMessage returns Arabic string for lang=ar');
  const msg_ar = getUpgradeMessage('tnd_basic', 'https://paymee.tn/checkout/test', 'ar');
  check('Arabic message contains Arabic chars', /[\u0600-\u06FF]/.test(msg_ar), msg_ar.slice(0, 40));
  check('Arabic message contains checkout URL', msg_ar.includes('https://paymee.tn/checkout/test'));

  // Check 5: GET /upgrade endpoint via HTTP (start server, hit endpoint, kill)
  console.log('\nCheck 5: GET /upgrade endpoint returns checkout_url');
  const serverPath = path.join(__dirname, '..', '..', 'agents', 'achiri', 'server.ts');
  const port = 3421; // use alternate port to avoid conflict with running server

  const proc = child_process.spawn(
    'npx', ['ts-node', '--project', path.join(__dirname, '..', '..', 'tsconfig.json'), serverPath],
    {
      env: { ...process.env, ACHIRI_PORT: String(port), PAYMEE_MOCK: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    }
  );

  let serverReady = false;
  try {
    serverReady = await waitForPort(port, 8000);
  } catch {
    serverReady = false;
  }

  if (!serverReady) {
    check('server started on port ' + port, false, 'server did not become ready within 8s');
  } else {
    check('server started on port ' + port, true);
    try {
      const resp = await httpGet(`http://localhost:${port}/upgrade?tier=tnd_basic&userId=user-e2e-001`);
      const parsed = JSON.parse(resp.body);
      check('GET /upgrade status 200', resp.status === 200, 'status=' + resp.status);
      check('GET /upgrade returns checkout_url', typeof parsed.checkout_url === 'string' && parsed.checkout_url.length > 0, JSON.stringify(parsed).slice(0, 80));
      check('GET /upgrade amount_tnd=9', parsed.amount_tnd === 9, 'amount=' + parsed.amount_tnd);
    } catch (err) {
      check('GET /upgrade request succeeded', false, (err as Error).message);
    }
  }

  proc.kill();

  console.log(`\n=== Results: ${passed} PASS, ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Validation error:', err);
  process.exit(1);
});
