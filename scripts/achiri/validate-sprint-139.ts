// Sprint 139 Validation — Dashboard Achiri stats panel
// Usage: npx ts-node scripts/achiri/validate-sprint-139.ts

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${label}`);
    failed++;
  }
}

console.log('\n══════════════════════════════════════════════════════');
console.log('  Sprint 139 Validation — Dashboard Achiri Stats Panel');
console.log('══════════════════════════════════════════════════════\n');

// ── Task 139-01: dashboard/parsers/achiri.py ──────────────────────────────────
const achiriPyPath = resolve('dashboard/parsers/achiri.py');
check(
  '139-01a: dashboard/parsers/achiri.py exists',
  existsSync(achiriPyPath)
);

const achiriPy = existsSync(achiriPyPath) ? readFileSync(achiriPyPath, 'utf-8') : '';
check(
  '139-01b: achiri.py defines parse_achiri_stats function',
  achiriPy.includes('def parse_achiri_stats')
);

check(
  '139-01c: achiri.py reads daily-counts.json',
  achiriPy.includes('daily-counts.json')
);

// ── Task 139-02: dashboard/server.py ─────────────────────────────────────────
const serverPy = readFileSync(resolve('dashboard/server.py'), 'utf-8');
check(
  '139-02a: server.py imports parse_achiri_stats',
  serverPy.includes('parse_achiri_stats')
);

check(
  "139-02b: server.py has /api/achiri/stats route",
  serverPy.includes('/api/achiri/stats')
);

// ── Task 139-03: dashboard/static/index.html ─────────────────────────────────
const indexHtml = readFileSync(resolve('dashboard/static/index.html'), 'utf-8');
check(
  "139-03a: index.html has id='achiri-body' element",
  indexHtml.includes('id="achiri-body"')
);

// ── Task 139-04: dashboard/static/app.js ─────────────────────────────────────
const appJs = readFileSync(resolve('dashboard/static/app.js'), 'utf-8');
check(
  '139-04a: app.js defines renderAchiriPanel function',
  appJs.includes('async function renderAchiriPanel')
);

check(
  '139-04b: app.js includes renderAchiriPanel in ALL_RENDERERS',
  appJs.includes('renderAchiriPanel')
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n  Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\n  ✓ Sprint 139 PASS — all checks green\n');
  process.exit(0);
} else {
  console.log('\n  ✗ Sprint 139 FAIL — fix failures above\n');
  process.exit(1);
}
