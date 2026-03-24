#!/usr/bin/env npx ts-node
/**
 * pre-deploy-check.ts — Sprint 1160
 *
 * Pre-flight validation for Achiri API before Hetzner deployment.
 * Checks: required env vars, Ollama connectivity, port availability,
 * achiri-api health endpoint, and memory safety.
 *
 * Usage:
 *   npx ts-node scripts/achiri/pre-deploy-check.ts
 *   npx ts-node scripts/achiri/pre-deploy-check.ts --strict   # exit 1 on any WARN
 */

import { execSync } from 'child_process';
import * as https from 'https';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

const ROOT = path.resolve(__dirname, '..', '..');
try { require('dotenv').config({ path: path.join(ROOT, '.env') }); } catch {}

const STRICT = process.argv.includes('--strict');
const ACHIRI_PORT = 3420;

interface Check {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  detail: string;
}

const checks: Check[] = [];

function pass(name: string, detail: string) { checks.push({ name, status: 'PASS', detail }); }
function fail(name: string, detail: string) { checks.push({ name, status: 'FAIL', detail }); }
function warn(name: string, detail: string) { checks.push({ name, status: 'WARN', detail }); }
function skip(name: string, detail: string) { checks.push({ name, status: 'SKIP', detail }); }

// ── 1. Required env vars ─────────────────────────────────────────────────────
const REQUIRED_ENV = [
  'ANTHROPIC_API_KEY', 'TELEGRAM_BOT_TOKEN', 'OWNER_TELEGRAM_CHAT_ID',
  'OLLAMA_HOST', 'VAULT_LOCAL_MODEL_POWER',
];
const OPTIONAL_ENV = ['PAYMEE_API_KEY', 'ELEVENLABS_API_KEY', 'MINIMAX_API_KEY'];

for (const key of REQUIRED_ENV) {
  if (process.env[key]) pass(`env:${key}`, 'SET');
  else fail(`env:${key}`, 'MISSING — required for Achiri API');
}
for (const key of OPTIONAL_ENV) {
  if (process.env[key]) pass(`env:${key}`, 'SET (optional)');
  else warn(`env:${key}`, 'MISSING — optional feature degraded');
}

// ── 2. Ollama connectivity ───────────────────────────────────────────────────
try {
  const raw = execSync('curl -sf --max-time 4 http://localhost:11434/api/tags', {
    encoding: 'utf-8', timeout: 5000,
  });
  const tags = JSON.parse(raw);
  const models: string[] = (tags.models ?? []).map((m: any) => m.name as string);
  const hasQwen4b = models.some(m => m.includes('qwen3') && m.includes('4b'));
  if (hasQwen4b) pass('ollama:qwen3:4b', `loaded (${models.length} models total)`);
  else warn('ollama:qwen3:4b', `not loaded — free tier will fail. Models: ${models.slice(0, 3).join(', ')}`);
} catch {
  fail('ollama:connectivity', 'localhost:11434 unreachable — Ollama must run for free tier');
}

// ── 3. Port availability ─────────────────────────────────────────────────────
try {
  const result = execSync(`lsof -i :${ACHIRI_PORT} -t 2>/dev/null || true`, { encoding: 'utf-8' }).trim();
  if (result) {
    // Check if it's our process
    try {
      const procName = execSync(`ps -p ${result} -o comm= 2>/dev/null || echo unknown`, { encoding: 'utf-8' }).trim();
      if (procName.includes('node') || procName.includes('ts-node')) {
        pass('port:3420', `in use by node (pid ${result}) — achiri-api likely running`);
      } else {
        warn('port:3420', `in use by ${procName} (pid ${result}) — may conflict`);
      }
    } catch {
      warn('port:3420', `in use by pid ${result}`);
    }
  } else {
    warn('port:3420', 'not in use — achiri-api not running yet (will start on deploy)');
  }
} catch {
  skip('port:3420', 'lsof check failed');
}

// ── 4. Health endpoint (if running) ──────────────────────────────────────────
function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 4000 }, (res) => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function runAsync() {
  try {
    const { status, body } = await httpGet(`http://localhost:${ACHIRI_PORT}/stats/health`);
    if (status === 200) {
      const data = JSON.parse(body);
      pass('health:endpoint', `HTTP 200 — status: ${data.status ?? 'ok'}`);
    } else {
      warn('health:endpoint', `HTTP ${status} — check achiri-api logs`);
    }
  } catch {
    warn('health:endpoint', 'unreachable — will be up after deploy');
  }

  // ── 5. Memory check ────────────────────────────────────────────────────────
  try {
    const memRaw = execSync('vm_stat 2>/dev/null || free -m 2>/dev/null || echo ""', {
      encoding: 'utf-8',
    });
    // mac: Pages free * 16384 bytes per page ≈ free MB
    const pagesMatch = memRaw.match(/Pages free:\s+(\d+)/);
    if (pagesMatch) {
      const freeMb = Math.round(parseInt(pagesMatch[1]) * 16384 / 1024 / 1024);
      if (freeMb > 500) pass('memory:free', `${freeMb} MB free`);
      else warn('memory:free', `${freeMb} MB free — low (need >500MB for qwen3:4b)`);
    } else {
      skip('memory:free', 'could not parse memory info');
    }
  } catch {
    skip('memory:free', 'memory check failed');
  }

  // ── 6. Achiri agent files ─────────────────────────────────────────────────
  const REQUIRED_FILES = [
    'agents/achiri/index.ts',
    'agents/achiri/server.ts',
    'agents/achiri/memory-store.ts',
    'kognai-agents/achiri/agent.yaml',
  ];
  for (const f of REQUIRED_FILES) {
    if (fs.existsSync(path.join(ROOT, f))) pass(`file:${f}`, 'exists');
    else fail(`file:${f}`, 'MISSING — required for deploy');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const icons = { PASS: '✅', FAIL: '❌', WARN: '⚠️', SKIP: '➖' };
  console.log('\n=== Achiri Pre-Deploy Check ===\n');
  for (const c of checks) {
    console.log(`${icons[c.status]} [${c.status.padEnd(4)}] ${c.name.padEnd(30)} ${c.detail}`);
  }

  const failures = checks.filter(c => c.status === 'FAIL');
  const warnings = checks.filter(c => c.status === 'WARN');
  console.log(`\n${failures.length === 0 ? '✅' : '❌'} ${checks.filter(c => c.status === 'PASS').length} pass · ${warnings.length} warn · ${failures.length} fail`);

  if (failures.length > 0) {
    console.log('\n❌ Pre-deploy check FAILED — fix failures before deploying');
    process.exit(1);
  }
  if (STRICT && warnings.length > 0) {
    console.log('\n⚠️ Strict mode: warnings treated as failures');
    process.exit(1);
  }
  console.log('\n✅ Ready to deploy');
}

runAsync().catch(e => { console.error('Check failed:', e.message); process.exit(1); });
