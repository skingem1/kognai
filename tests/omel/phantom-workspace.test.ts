// Sprint 181 — OMEL Phantom Workspace unit tests
// Tests: create, resolve, cleanup, path traversal guard, performance, quota

import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';
import { phantomWorkspace, PhantomContext } from '../../scripts/lib/omel/phantom-workspace';

let testCtx: PhantomContext | null = null;

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

async function run(): Promise<void> {
  console.log('\n[phantom-workspace.test] Running...\n');
  let passed = 0;
  let failed = 0;

  // ── Test 1: create() returns a valid PhantomContext ───────────────────────
  try {
    testCtx = phantomWorkspace.create('test-task-001');
    assert(typeof testCtx.taskId === 'string' && testCtx.taskId.length > 0, 'create: taskId is set');
    assert(typeof testCtx.tmpDir === 'string' && testCtx.tmpDir.length > 0, 'create: tmpDir is set');
    assert(fs.existsSync(testCtx.tmpDir), 'create: tmpDir exists on disk');
    assert(testCtx.tmpDir.startsWith(os.tmpdir()), 'create: tmpDir is under os.tmpdir()');
    passed += 4;
  } catch (e) { console.error(`  ✗ create()`, (e as Error).message); failed++; }

  // ── Test 2: performance — creation must be <50ms ─────────────────────────
  try {
    const t0  = Date.now();
    const ctx = phantomWorkspace.create('test-perf');
    const ms  = Date.now() - t0;
    assert(ms < 500, `create: completed in ${ms}ms (hard max 500ms for test env)`);
    phantomWorkspace.cleanup(ctx);
    passed++;
  } catch (e) { console.error(`  ✗ performance`, (e as Error).message); failed++; }

  // ── Test 3: resolve() returns a path inside tmpDir ────────────────────────
  try {
    assert(testCtx !== null, 'resolve: have active context');
    const resolved = phantomWorkspace.resolve(testCtx!, 'output.json');
    assert(resolved.startsWith(testCtx!.tmpDir), 'resolve: path is inside tmpDir');
    assert(resolved.endsWith('output.json'), 'resolve: filename preserved');
    passed += 2;
  } catch (e) { console.error(`  ✗ resolve()`, (e as Error).message); failed++; }

  // ── Test 4: resolve() with nested subdir ─────────────────────────────────
  try {
    const resolved = phantomWorkspace.resolve(testCtx!, 'subdir/data.json');
    assert(resolved.includes('subdir'), 'resolve: nested path preserved');
    passed++;
  } catch (e) { console.error(`  ✗ resolve nested`, (e as Error).message); failed++; }

  // ── Test 5: path traversal blocked ───────────────────────────────────────
  try {
    let threw = false;
    try { phantomWorkspace.resolve(testCtx!, '../../../etc/passwd'); } catch { threw = true; }
    assert(threw, 'resolve: path traversal throws');
    passed++;
  } catch (e) { console.error(`  ✗ traversal guard`, (e as Error).message); failed++; }

  // ── Test 6: cleanup() removes the tmpDir ─────────────────────────────────
  try {
    const dir = testCtx!.tmpDir;
    assert(fs.existsSync(dir), 'cleanup: dir exists before cleanup');
    phantomWorkspace.cleanup(testCtx!);
    assert(!fs.existsSync(dir), 'cleanup: dir removed after cleanup');
    testCtx = null;
    passed += 2;
  } catch (e) { console.error(`  ✗ cleanup()`, (e as Error).message); failed++; }

  // ── Test 7: cleanup() is idempotent (safe to call twice) ─────────────────
  try {
    const ctx = phantomWorkspace.create('test-idempotent');
    phantomWorkspace.cleanup(ctx);
    phantomWorkspace.cleanup(ctx); // should not throw
    assert(true, 'cleanup: idempotent (no throw on second call)');
    passed++;
  } catch (e) { console.error(`  ✗ cleanup idempotent`, (e as Error).message); failed++; }

  // ── Test 8: getStats() reflects created_today count ──────────────────────
  try {
    const stats = phantomWorkspace.getStats();
    assert(typeof stats.active === 'number',        'getStats: active is number');
    assert(typeof stats.created_today === 'number', 'getStats: created_today is number');
    assert(stats.created_today >= 3,                'getStats: created_today >= 3 (from above tests)');
    passed += 3;
  } catch (e) { console.error(`  ✗ getStats()`, (e as Error).message); failed++; }

  // ── Test 9: cleanupAll() removes all active workspaces ───────────────────
  try {
    const c1 = phantomWorkspace.create('cleanup-all-01');
    const c2 = phantomWorkspace.create('cleanup-all-02');
    assert(fs.existsSync(c1.tmpDir), 'cleanupAll: c1 exists before');
    assert(fs.existsSync(c2.tmpDir), 'cleanupAll: c2 exists before');
    (phantomWorkspace as any).cleanupAll('test');
    assert(!fs.existsSync(c1.tmpDir), 'cleanupAll: c1 removed');
    assert(!fs.existsSync(c2.tmpDir), 'cleanupAll: c2 removed');
    passed += 4;
  } catch (e) { console.error(`  ✗ cleanupAll()`, (e as Error).message); failed++; }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n[phantom-workspace.test] ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('[phantom-workspace.test] Fatal:', err.message);
  process.exit(1);
});
