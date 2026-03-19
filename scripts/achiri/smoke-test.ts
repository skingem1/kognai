#!/usr/bin/env ts-node
// Sprint 166: Achiri pre-deployment smoke test
// Validates all local Achiri services before Hetzner deploy.
// Usage: npx ts-node scripts/achiri/smoke-test.ts
// Exit 0 = all checks pass. Exit 1 = one or more failed.

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const ROOT  = path.join(__dirname, '..', '..');
const PORT  = 3420;
const HOST  = '127.0.0.1';

// ── helpers ──────────────────────────────────────────────────────────────────

function ok(msg: string)   { console.log(`✅ ${msg}`); }
function fail(msg: string) { console.log(`❌ ${msg}`); }

function httpRequest(
  method: string, urlPath: string, body?: object
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const opts: http.RequestOptions = {
      hostname: HOST, port: PORT, path: urlPath, method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, data }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── checks ───────────────────────────────────────────────────────────────────

async function checkConfig(): Promise<boolean> {
  const p = path.join(ROOT, 'kognai-agents', 'achiri', 'config.json');
  if (!fs.existsSync(p)) { fail('config.json not found at kognai-agents/achiri/config.json'); return false; }
  try {
    const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (typeof cfg.memory_enabled === 'undefined') { fail('config.json missing memory_enabled field'); return false; }
    if (!cfg.tiers) { fail('config.json missing tiers field'); return false; }
    ok(`config.json valid (memory_enabled=${cfg.memory_enabled}, tiers=${Object.keys(cfg.tiers).join('/')})`);
    return true;
  } catch (e) { fail(`config.json parse error: ${(e as Error).message}`); return false; }
}

function checkEcosystem(): boolean {
  const p = path.join(ROOT, 'ecosystem.config.js');
  if (!fs.existsSync(p)) { fail('ecosystem.config.js not found'); return false; }
  const src = fs.readFileSync(p, 'utf-8');
  if (!src.includes('achiri-api')) { fail('ecosystem.config.js has no achiri-api entry'); return false; }
  if (!src.includes('3420')) { fail('ecosystem.config.js: achiri-api port 3420 not found'); return false; }
  ok('ecosystem.config.js has achiri-api entry on port 3420');
  return true;
}

async function checkHealth(): Promise<boolean> {
  try {
    const { status, data } = await httpRequest('GET', '/health');
    if (status !== 200) { fail(`GET /health returned ${status}`); return false; }
    ok(`GET /health → 200 OK`);
    return true;
  } catch (e) {
    fail(`GET /health failed — achiri-api not running? (${(e as Error).message})`);
    return false;
  }
}

async function checkStats(): Promise<boolean> {
  try {
    const { status, data } = await httpRequest('GET', '/stats');
    if (status !== 200) { fail(`GET /stats returned ${status}`); return false; }
    const parsed = JSON.parse(data);
    if (typeof parsed.uptime_s === 'undefined' && typeof parsed.uptime === 'undefined' && typeof parsed.ok === 'undefined') {
      fail(`GET /stats response missing expected fields: ${data.slice(0, 80)}`);
      return false;
    }
    ok(`GET /stats → 200 OK`);
    return true;
  } catch (e) {
    fail(`GET /stats failed: ${(e as Error).message}`);
    return false;
  }
}

async function checkChat(): Promise<boolean> {
  try {
    const { status, data } = await httpRequest('POST', '/chat', {
      userId: 'smoke-test',
      tier:   'free',
      message: 'مرحبا',
    });
    if (status !== 200) { fail(`POST /chat returned ${status}: ${data.slice(0, 80)}`); return false; }
    const parsed = JSON.parse(data);
    if (!parsed.reply && !parsed.error) {
      fail(`POST /chat response missing reply field: ${data.slice(0, 80)}`);
      return false;
    }
    if (parsed.error === 'limit_exceeded') {
      ok(`POST /chat → limit_exceeded (free tier daily limit hit — expected in CI)`);
    } else {
      ok(`POST /chat → 200 OK (reply: ${String(parsed.reply).slice(0, 60)}…)`);
    }
    return true;
  } catch (e) {
    fail(`POST /chat failed: ${(e as Error).message}`);
    return false;
  }
}

function checkMemoryDir(): boolean {
  const memDir = path.join(ROOT, 'workspace', 'achiri', 'memory');
  if (fs.existsSync(memDir)) {
    const files = fs.readdirSync(memDir).length;
    ok(`workspace/achiri/memory/ exists (${files} files)`);
    return true;
  }
  // Try creating it
  try {
    fs.mkdirSync(memDir, { recursive: true });
    ok('workspace/achiri/memory/ created successfully');
    return true;
  } catch (e) {
    fail(`workspace/achiri/memory/ missing and cannot create: ${(e as Error).message}`);
    return false;
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('─────────────────────────────────────────────');
  console.log('  Achiri Pre-Deployment Smoke Test');
  console.log('  Sprint 166 — gate: Hetzner deploy (Sprint 167)');
  console.log('─────────────────────────────────────────────');

  const results: boolean[] = [];
  results.push(await checkConfig());
  results.push(checkEcosystem());
  results.push(await checkHealth());
  results.push(await checkStats());
  results.push(await checkChat());
  results.push(checkMemoryDir());

  const passed = results.filter(Boolean).length;
  const total  = results.length;
  console.log('─────────────────────────────────────────────');
  if (passed === total) {
    console.log(`✅ ALL ${total}/${total} checks PASSED — ready for Hetzner deploy`);
    process.exit(0);
  } else {
    console.log(`❌ ${passed}/${total} checks passed — fix failures before deploying`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
