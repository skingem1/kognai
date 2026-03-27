/**
 * eval-agenttax-x402.ts — Satoshi: AgentTax x402 API evaluation script
 *
 * TICKET-017-AGENTTAX-01
 *
 * Three modes:
 *   1. PROBE (default)  — captures 402 schema, decodes x402 v2 header, no payment
 *   2. CALCULATE        — full POST /api/v1/calculate with AGENTTAX_API_KEY (free tier)
 *   3. RATES            — GET /api/v1/rates for all 51-state tax rates (free, no auth)
 *
 * Usage:
 *   npx ts-node scripts/eval-agenttax-x402.ts              # probe 402 schema
 *   npx ts-node scripts/eval-agenttax-x402.ts --calculate  # test POST with API key
 *   npx ts-node scripts/eval-agenttax-x402.ts --rates      # fetch all state rates
 *
 * Env:
 *   AGENTTAX_API_KEY  — from .env (required for --calculate mode)
 */

import * as https from 'https';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const BASE_URL = 'www.agenttax.io';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadEnvVar(key: string): string {
  if (process.env[key]) return process.env[key]!;
  try {
    const envFile = join(ROOT, '.env');
    if (existsSync(envFile)) {
      const lines = readFileSync(envFile, 'utf-8').split('\n');
      for (const line of lines) {
        if (line.startsWith(`${key}=`)) {
          return line.split('=').slice(1).join('=').trim();
        }
      }
    }
  } catch {}
  return '';
}

function httpsGet(path: string, headers: Record<string, string> = {}): Promise<{
  status: number;
  headers: Record<string, string>;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: BASE_URL, path, method: 'GET', headers: { 'Accept': 'application/json', ...headers } },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          headers: res.headers as Record<string, string>,
          body,
        }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function httpsPost(path: string, payload: object, headers: Record<string, string> = {}): Promise<{
  status: number;
  headers: Record<string, string>;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: BASE_URL,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'Accept': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          headers: res.headers as Record<string, string>,
          body,
        }));
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function decodePaymentRequired(headerValue: string): object | null {
  try {
    // x402 v2: PAYMENT-REQUIRED header is base64url-encoded JSON (no JWT signature)
    const decoded = Buffer.from(headerValue, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// ─── Mode 1: PROBE ────────────────────────────────────────────────────────────

async function probe(): Promise<void> {
  console.log('\n═══ AgentTax x402 PROBE ════════════════════════════════════════');
  console.log('Step 1: GET /api/v1/calculate → 402 + x402 v2 schema');
  console.log('Step 2: POST /api/v1/calculate (no auth) → 200 demo mode\n');

  // ── Step 1: GET probe → expect 402 with x402 schema ──────────────────────
  const getRes = await httpsGet('/api/v1/calculate');
  console.log(`[GET]  HTTP Status: ${getRes.status}`);

  if (getRes.status === 402) {
    console.log('✓ 402 Payment Required — x402 gate confirmed\n');

    const prHeader = getRes.headers['payment-required'];
    if (prHeader) {
      const schema = decodePaymentRequired(prHeader);
      if (schema) {
        console.log('── x402 v2 Schema (PAYMENT-REQUIRED header) ─────────────────');
        console.log(JSON.stringify(schema, null, 2));
      }
    }

    // Parse 402 body for API documentation
    let body: any = {};
    try { body = JSON.parse(getRes.body); } catch {}

    console.log('\n── Access Options ────────────────────────────────────────────');
    const payPerCall = body?.access_options?.option_1_pay_per_call;
    const fullAccount = body?.access_options?.option_2_full_account;
    if (payPerCall) {
      console.log(`  x402: ${payPerCall.price}/call (${payPerCall.network}) asset: ${payPerCall.asset}`);
    }
    if (fullAccount) {
      console.log(`  API Key: free tier = ${fullAccount.pricing?.free?.calls} | ${fullAccount.pricing?.paid_tiers}`);
    }
  } else {
    console.log(`  (GET returned ${getRes.status} — endpoint may require POST for x402 gate)`);
  }

  // ── Step 2: POST probe (no auth) → demo mode ──────────────────────────────
  console.log('\n[POST] Testing demo mode (no auth) ────────────────────────────');
  const postRes = await httpsPost('/api/v1/calculate', {
    role: 'seller',
    amount: 100,
    buyer_state: 'TX',
    transaction_type: 'api_access',
    counterparty_id: 'kognai-probe-test',
    work_type: 'compute',
    is_b2b: false,
  });

  console.log(`[POST] HTTP Status: ${postRes.status}`);

  let result: any = {};
  try { result = JSON.parse(postRes.body); } catch {}

  if (postRes.status === 200 && result.success) {
    const isDemo = result.mode === 'demo';
    const demoLimit = postRes.headers['x-demo-daily-remaining'];
    console.log(`✓ 200 OK — mode: ${result.mode ?? 'authenticated'}`);
    if (isDemo) console.log(`  Demo calls remaining today: ${demoLimit}`);
    console.log(`  Total tax: $${result.total_tax} (rate: ${(result.combined_rate * 100).toFixed(2)}%)`);
    console.log(`  Confidence: ${result.confidence?.score}/100 (${result.confidence?.level})`);
    console.log(`  Classification basis: ${result.classification_basis}`);
    if (isDemo) {
      console.log('\n  ⚠ Demo mode: missing jurisdiction details + statute citations');
      console.log('  → Sign up for free API key for full AMD-22 compliant response');
    }
  } else if (postRes.status === 402) {
    console.log('✓ 402 on POST — x402 payment required for full response');
    const prHeader = postRes.headers['payment-required'];
    if (prHeader) {
      const schema = decodePaymentRequired(prHeader);
      console.log('  x402 schema:', JSON.stringify(schema, null, 2));
    }
  } else {
    console.log(`  Response: ${postRes.body.slice(0, 300)}`);
  }

  console.log('\n✓ PROBE COMPLETE');
  console.log('  Next steps:');
  console.log('  1. Godman: POST /api/v1/auth/signup → save AGENTTAX_API_KEY to .env');
  console.log('  2. Run: npx ts-node scripts/eval-agenttax-x402.ts --calculate');
  console.log('  3. MacGyver: TICKET-017-AGENTTAX-02 (wire into Invoica invoice generation)');
}

// ─── Mode 2: CALCULATE ───────────────────────────────────────────────────────

async function calculate(): Promise<void> {
  const apiKey = loadEnvVar('AGENTTAX_API_KEY');
  if (!apiKey) {
    console.error('\n✗ AGENTTAX_API_KEY not found in .env');
    console.error('  Sign up at: POST https://www.agenttax.io/api/v1/auth/signup');
    console.error('  Then add AGENTTAX_API_KEY=<key> to .env');
    process.exit(1);
  }

  console.log('\n═══ AgentTax CALCULATE TEST ════════════════════════════════════');
  console.log('Calling POST /api/v1/calculate with API key\n');

  // Test cases covering Invoica's primary use cases
  const testCases = [
    {
      label: 'Invoica SaaS subscription (TX client)',
      payload: { role: 'seller', amount: 99, buyer_state: 'TX', transaction_type: 'saas', counterparty_id: 'invoica-client-tx-001', work_type: 'compute', is_b2b: false },
    },
    {
      label: 'ERC-8183 spot job — ai_labor (NY client)',
      payload: { role: 'seller', amount: 250, buyer_state: 'NY', transaction_type: 'ai_labor', counterparty_id: 'kognai-agent-ny-042', work_type: 'compute', is_b2b: false },
    },
    {
      label: 'PACT session fee — api_access (CA client, B2B)',
      payload: { role: 'seller', amount: 500, buyer_state: 'CA', transaction_type: 'api_access', counterparty_id: 'kognai-enterprise-ca-007', work_type: 'compute', is_b2b: true },
    },
    {
      label: 'BOND recurring mandate subscription (WA client)',
      payload: { role: 'seller', amount: 2000, buyer_state: 'WA', transaction_type: 'subscription', counterparty_id: 'kognai-bond-client-wa-001', work_type: 'consulting', is_b2b: true },
    },
  ];

  const results: any[] = [];

  for (const tc of testCases) {
    console.log(`── ${tc.label} ─────────────────────────────`);
    const res = await httpsPost('/api/v1/calculate', tc.payload, { 'X-API-Key': apiKey });

    if (res.status !== 200) {
      console.error(`  ✗ HTTP ${res.status}: ${res.body.slice(0, 200)}`);
      results.push({ label: tc.label, error: `HTTP ${res.status}`, payload: tc.payload });
      continue;
    }

    let result: any = {};
    try { result = JSON.parse(res.body); } catch {}

    if (result.success) {
      console.log(`  ✓ Total tax: $${result.total_tax} (${(result.sales_tax?.rate * 100).toFixed(1)}% ${result.sales_tax?.jurisdiction})`);
      console.log(`    Basis: ${result.classification_basis}`);
      console.log(`    Statute: ${result.sales_tax?.note ?? 'N/A'}`);
      console.log(`    Confidence: ${result.confidence?.score}/100 (${result.confidence?.level})`);
    } else {
      console.error(`  ✗ API error: ${JSON.stringify(result)}`);
    }

    results.push({ label: tc.label, payload: tc.payload, result });
  }

  // Save results to workspace
  const outPath = join(ROOT, 'workspace', 'intel', 'eval-results', 'eval-014-calculate-results.json');
  writeFileSync(outPath, JSON.stringify({ tested_at: new Date().toISOString(), results }, null, 2));
  console.log(`\n✓ Results saved to: ${outPath}`);
}

// ─── Mode 3: RATES ────────────────────────────────────────────────────────────

async function rates(): Promise<void> {
  console.log('\n═══ AgentTax STATE RATES ═══════════════════════════════════════');
  console.log('GET /api/v1/rates (free, no auth)\n');

  const res = await httpsGet('/api/v1/rates');
  if (res.status !== 200) {
    console.error(`✗ HTTP ${res.status}: ${res.body.slice(0, 200)}`);
    return;
  }

  let data: any = {};
  try { data = JSON.parse(res.body); } catch {}

  const states = data?.rates ?? data ?? {};
  const stateList = Object.entries(states)
    .filter(([k]) => k.length === 2)
    .map(([state, info]: [string, any]) => ({ state, rate: info?.rate ?? info, taxable_saas: info?.taxable_saas ?? info?.saas }))
    .sort((a, b) => (b.rate as number) - (a.rate as number));

  console.log('Top 10 highest-rate states for digital/SaaS:');
  stateList.slice(0, 10).forEach((s) => {
    console.log(`  ${s.state}: ${((s.rate as number) * 100).toFixed(2)}%${s.taxable_saas !== undefined ? ` (SaaS taxable: ${s.taxable_saas})` : ''}`);
  });

  console.log(`\nTotal states covered: ${stateList.length}`);
  console.log('✓ Rates fetched');
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--calculate')) {
  calculate().catch(console.error);
} else if (args.includes('--rates')) {
  rates().catch(console.error);
} else {
  probe().catch(console.error);
}
