// Sprint 115 — Validate Achiri HTTP API
// Spawns server with ACHIRI_DRY_RUN=1, runs 5 checks, then kills server.

import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

const PORT = 3421; // use non-default to avoid conflicts
const BASE_URL = `http://localhost:${PORT}`;
const SERVER_READY_MS = 4000;

let passed = 0;
let failed = 0;
const results: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++;
    results.push(`  ✓ ${name}`);
  } else {
    failed++;
    results.push(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
  }
}

async function fetchJSON(method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const options: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(BASE_URL + path, options);
  let data: unknown;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + SERVER_READY_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Server did not become ready in ' + SERVER_READY_MS + 'ms');
}

async function runChecks(): Promise<void> {
  // 1. GET /health
  const health = await fetchJSON('GET', '/health');
  check('GET /health → status=ok', (health.data as { status?: string }).status === 'ok', JSON.stringify(health.data));

  // 2. POST /chat { userId, message } → has reply field
  const chat = await fetchJSON('POST', '/chat', { userId: 'test-user', message: 'Aslema' });
  check('POST /chat → has reply', typeof (chat.data as { reply?: string }).reply === 'string', JSON.stringify(chat.data).slice(0, 80));

  // 3. GET /stats → has users and total_turns fields
  const stats = await fetchJSON('GET', '/stats');
  const sd = stats.data as { users?: number; total_turns?: number };
  check('GET /stats → has users + total_turns', sd.users !== undefined && sd.total_turns !== undefined, JSON.stringify(stats.data).slice(0, 80));

  // 4. DELETE /memory/test-user → { ok: true }
  const del = await fetchJSON('DELETE', '/memory/test-user');
  check('DELETE /memory/:userId → { ok: true }', (del.data as { ok?: boolean }).ok === true, JSON.stringify(del.data));

  // 5. POST /chat missing message → 400
  const bad = await fetchJSON('POST', '/chat', { userId: 'test-user' });
  check('POST /chat missing message → 400', bad.status === 400, 'status=' + bad.status);
}

async function main(): Promise<void> {
  console.log('[validate-http-api] Starting Achiri API server (dry-run) on port ' + PORT + '...');

  const serverEnv = {
    ...process.env,
    ACHIRI_DRY_RUN: '1',
    ACHIRI_PORT: String(PORT),
    TS_NODE_TRANSPILE_ONLY: 'true',
    TS_NODE_PROJECT: join(__dirname, '../../tsconfig.scripts.json'),
  };

  const serverProc: ChildProcess = spawn(
    'npx', ['ts-node', join(__dirname, '../../agents/achiri/server.ts')],
    { env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'], cwd: join(__dirname, '../..') }
  );

  serverProc.stdout?.on('data', (d: Buffer) => process.stdout.write('[server] ' + d.toString()));
  serverProc.stderr?.on('data', (d: Buffer) => process.stderr.write('[server:err] ' + d.toString()));

  try {
    await waitForServer();
    console.log('[validate-http-api] Server ready. Running checks...\n');
    await runChecks();
  } catch (err) {
    failed++;
    results.push(`  ✗ Server startup: ${err}`);
  } finally {
    serverProc.kill('SIGTERM');
  }

  console.log('');
  results.forEach(r => console.log(r));
  console.log(`\n[validate-http-api] ${passed}/${passed + failed} checks passed`);

  if (failed > 0) {
    console.error('[validate-http-api] FAIL');
    process.exit(1);
  }
  console.log('[validate-http-api] PASS');
}

main().catch(err => { console.error(err); process.exit(1); });
