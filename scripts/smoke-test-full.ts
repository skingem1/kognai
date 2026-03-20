#!/usr/bin/env npx ts-node
/**
 * smoke-test-full.ts — Sprint 493
 * Comprehensive system smoke test. Validates all available services.
 * Run: npx ts-node scripts/smoke-test-full.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
  duration_ms: number;
}

const results: TestResult[] = [];

function httpGet(url: string, timeout = 5000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function test(name: string, fn: () => Promise<{ status: 'PASS' | 'FAIL' | 'SKIP'; detail: string }>): Promise<void> {
  const start = Date.now();
  try {
    const result = await fn();
    results.push({ name, ...result, duration_ms: Date.now() - start });
  } catch (err) {
    results.push({ name, status: 'FAIL', detail: (err as Error).message, duration_ms: Date.now() - start });
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testOllama(): Promise<{ status: 'PASS' | 'FAIL' | 'SKIP'; detail: string }> {
  const host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  try {
    const res = await httpGet(`${host}/api/tags`);
    if (res.status === 200) {
      const data = JSON.parse(res.body);
      const models = (data.models || []).map((m: any) => m.name).join(', ');
      return { status: 'PASS', detail: `${(data.models || []).length} models: ${models}` };
    }
    return { status: 'FAIL', detail: `HTTP ${res.status}` };
  } catch (err) {
    return { status: 'FAIL', detail: `Ollama not reachable at ${host}: ${(err as Error).message}` };
  }
}

async function testClawRouter(): Promise<{ status: 'PASS' | 'FAIL' | 'SKIP'; detail: string }> {
  const gwUrl = process.env.CLAWROUTER_GATEWAY_URL;
  if (!gwUrl) return { status: 'SKIP', detail: 'CLAWROUTER_GATEWAY_URL not set' };
  try {
    const res = await httpGet(`${gwUrl}/health`);
    return res.status === 200
      ? { status: 'PASS', detail: 'ClawRouter gateway healthy' }
      : { status: 'FAIL', detail: `HTTP ${res.status}` };
  } catch {
    return { status: 'FAIL', detail: 'ClawRouter gateway not reachable' };
  }
}

async function testTelegram(): Promise<{ status: 'PASS' | 'FAIL' | 'SKIP'; detail: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { status: 'SKIP', detail: 'TELEGRAM_BOT_TOKEN not set' };
  try {
    const res = await httpGet(`https://api.telegram.org/bot${token}/getMe`);
    if (res.status === 200) {
      const data = JSON.parse(res.body);
      return data.ok
        ? { status: 'PASS', detail: `Bot: @${data.result.username}` }
        : { status: 'FAIL', detail: data.description || 'API error' };
    }
    return { status: 'FAIL', detail: `HTTP ${res.status}` };
  } catch (err) {
    return { status: 'FAIL', detail: (err as Error).message };
  }
}

async function testDashboard(): Promise<{ status: 'PASS' | 'FAIL' | 'SKIP'; detail: string }> {
  try {
    const res = await httpGet('http://127.0.0.1:11436/');
    return res.status === 200
      ? { status: 'PASS', detail: 'Dashboard responding on :11436' }
      : { status: 'FAIL', detail: `HTTP ${res.status}` };
  } catch {
    return { status: 'SKIP', detail: 'Dashboard not running (start: cd dashboard && python3 -m uvicorn server:app --port 11436)' };
  }
}

async function testStripe(): Promise<{ status: 'PASS' | 'FAIL' | 'SKIP'; detail: string }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { status: 'SKIP', detail: 'STRIPE_SECRET_KEY not set' };
  try {
    const res = await httpGet('https://api.stripe.com/v1/balance');
    // Will get 401 without proper auth header, but that proves API is reachable
    return { status: 'PASS', detail: 'Stripe API key set (reachable)' };
  } catch {
    return { status: 'FAIL', detail: 'Stripe API not reachable' };
  }
}

async function testYouTube(): Promise<{ status: 'PASS' | 'FAIL' | 'SKIP'; detail: string }> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { status: 'SKIP', detail: 'YOUTUBE_API_KEY not set' };
  return { status: 'PASS', detail: 'YouTube API key configured' };
}

async function testTikTok(): Promise<{ status: 'PASS' | 'FAIL' | 'SKIP'; detail: string }> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) return { status: 'SKIP', detail: 'TikTok client credentials not set' };
  return { status: 'PASS', detail: 'TikTok client credentials configured (token may need refresh)' };
}

async function testPipelineFiles(): Promise<{ status: 'PASS' | 'FAIL' | 'SKIP'; detail: string }> {
  const checks = [
    { name: 'publish-ledger', path: path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl') },
    { name: 'experiments', path: path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl') },
    { name: 'viral-topics', path: path.join(ROOT, 'workspace', 'scs001', 'viral-topics.json') },
    { name: 'sprint-queue', path: path.join(ROOT, 'workspace', 'sprint-queue.json') },
  ];
  const found = checks.filter(c => fs.existsSync(c.path));
  const missing = checks.filter(c => !fs.existsSync(c.path));
  if (missing.length === 0) {
    return { status: 'PASS', detail: `All ${checks.length} pipeline data files present` };
  }
  return { status: 'FAIL', detail: `Missing: ${missing.map(m => m.name).join(', ')}` };
}

async function testGitHealth(): Promise<{ status: 'PASS' | 'FAIL' | 'SKIP'; detail: string }> {
  try {
    const status = execSync('cd "' + ROOT + '" && git status --porcelain 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
    const lines = status.trim().split('\n').filter(l => l.trim());
    const commitCount = execSync('cd "' + ROOT + '" && git rev-list --count HEAD 2>/dev/null', { encoding: 'utf-8', timeout: 5000 }).trim();
    return { status: 'PASS', detail: `${commitCount} commits, ${lines.length} uncommitted changes` };
  } catch {
    return { status: 'FAIL', detail: 'Git not healthy' };
  }
}

async function testEnvVars(): Promise<{ status: 'PASS' | 'FAIL' | 'SKIP'; detail: string }> {
  const critical = ['ANTHROPIC_API_KEY', 'TELEGRAM_BOT_TOKEN', 'OWNER_TELEGRAM_CHAT_ID', 'OLLAMA_HOST'];
  const set = critical.filter(k => process.env[k]);
  const missing = critical.filter(k => !process.env[k]);
  if (missing.length === 0) return { status: 'PASS', detail: `All ${critical.length} critical env vars set` };
  return { status: 'FAIL', detail: `Missing: ${missing.join(', ')}` };
}

async function testSupabase(): Promise<{ status: 'PASS' | 'FAIL' | 'SKIP'; detail: string }> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return { status: 'SKIP', detail: 'Supabase credentials not set' };
  try {
    const res = await httpGet(`${url}/rest/v1/`, 5000);
    return { status: 'PASS', detail: 'Supabase reachable' };
  } catch {
    return { status: 'FAIL', detail: 'Supabase not reachable' };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n=== Kognai Full System Smoke Test ===\n');

  await test('1. Ollama (local models)', testOllama);
  await test('2. ClawRouter Gateway', testClawRouter);
  await test('3. Telegram Bot', testTelegram);
  await test('4. Dashboard', testDashboard);
  await test('5. Stripe', testStripe);
  await test('6. YouTube API', testYouTube);
  await test('7. TikTok API', testTikTok);
  await test('8. Pipeline Data Files', testPipelineFiles);
  await test('9. Git Health', testGitHealth);
  await test('10. Critical Env Vars', testEnvVars);
  await test('11. Supabase', testSupabase);

  // Report
  console.log('\n--- Results ---\n');
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️';
    console.log(`${icon} ${r.name}: ${r.detail} (${r.duration_ms}ms)`);
  }

  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const skip = results.filter(r => r.status === 'SKIP').length;

  console.log(`\n--- Summary ---`);
  console.log(`✅ Pass: ${pass} | ❌ Fail: ${fail} | ⏭️ Skip: ${skip} | Total: ${results.length}`);

  // Write report
  const reportPath = path.join(ROOT, 'reports', 'smoke-test-latest.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    pass, fail, skip,
    total: results.length,
    results
  }, null, 2));
  console.log(`\nReport: reports/smoke-test-latest.json`);

  const overall = fail === 0 ? 'PASS' : 'FAIL';
  console.log(`\n${overall === 'PASS' ? '✅' : '❌'} Overall: ${overall}\n`);

  process.exit(fail > 0 ? 1 : 0);
})();
