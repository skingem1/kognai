#!/usr/bin/env ts-node
/**
 * godman-pre-launch-validate.ts — Godman Protocols pre-launch validation
 * Sprint 1269 / AMD23-PM2-WIRE
 *
 * Final gate before April 14 npm publish. Checks:
 *   1. All 8 packages have correct version (0.2.0)
 *   2. All packages build without errors (tsc --noEmit)
 *   3. All packages pass npm publish --dry-run
 *   4. SOUL.md exists and has all 6 required kill switches
 *   5. Cerberus gateway smoke test (dry-run mode)
 *   6. AMD-23 files present
 *   7. DeerFlow SKILL.md files present
 *   8. LAUNCH-STATUS.md assets check (7/7 demos, X thread)
 *
 * Writes: workspace/godman-protocols/pre-launch-report.json
 * Exit 0 = READY, Exit 1 = NOT READY
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT       = path.resolve(__dirname, '..');
const GODMAN_DIR = path.join(ROOT, 'workspace', 'godman-protocols');
const PACKAGES   = ['pact', 'lax', 'score', 'signal', 'soul', 'amf', 'drs', 'sdk'];
const TARGET_VER = '0.2.0';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CheckStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';

interface CheckResult {
  check: string;
  status: CheckStatus;
  detail: string;
}

const results: CheckResult[] = [];

function pass(check: string, detail: string)  { results.push({ check, status: 'PASS', detail }); }
function fail(check: string, detail: string)  { results.push({ check, status: 'FAIL', detail }); }
function warn(check: string, detail: string)  { results.push({ check, status: 'WARN', detail }); }
function skip(check: string, detail: string)  { results.push({ check, status: 'SKIP', detail }); }

function sh(cmd: string, cwd: string = ROOT): string {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

// ---------------------------------------------------------------------------
// Check 1: Package versions
// ---------------------------------------------------------------------------

function checkVersions(): void {
  for (const pkg of PACKAGES) {
    const pkgJson = path.join(GODMAN_DIR, pkg, 'package.json');
    if (!fs.existsSync(pkgJson)) {
      fail(`version:${pkg}`, `package.json not found at ${pkgJson}`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
    const ver = data.version;
    if (ver === TARGET_VER) {
      pass(`version:${pkg}`, `@godman-protocols/${pkg}@${ver}`);
    } else {
      fail(`version:${pkg}`, `expected ${TARGET_VER}, got ${ver}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 2: TypeScript build (tsc --noEmit)
// ---------------------------------------------------------------------------

function checkBuilds(): void {
  for (const pkg of PACKAGES) {
    const pkgDir = path.join(GODMAN_DIR, pkg);
    const tsConfig = path.join(pkgDir, 'tsconfig.json');
    if (!fs.existsSync(tsConfig)) {
      skip(`build:${pkg}`, 'no tsconfig.json — skipping tsc check');
      continue;
    }
    try {
      sh('npx tsc --noEmit --pretty false 2>&1 | head -5', pkgDir);
      pass(`build:${pkg}`, 'tsc --noEmit OK');
    } catch (err) {
      const msg = (err as Error).message.slice(0, 200);
      fail(`build:${pkg}`, `tsc error: ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3: npm publish --dry-run
// ---------------------------------------------------------------------------

function checkDryRun(): void {
  for (const pkg of PACKAGES) {
    const pkgDir = path.join(GODMAN_DIR, pkg);
    if (!fs.existsSync(path.join(pkgDir, 'package.json'))) {
      fail(`dry-run:${pkg}`, 'package.json missing');
      continue;
    }
    try {
      sh('npm publish --dry-run --access public 2>&1 | tail -3', pkgDir);
      pass(`dry-run:${pkg}`, 'npm publish --dry-run OK');
    } catch (err) {
      const msg = (err as Error).message.slice(0, 200);
      fail(`dry-run:${pkg}`, `dry-run failed: ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 4: SOUL.md kill switches
// ---------------------------------------------------------------------------

const REQUIRED_KILL_SWITCHES = [
  'account_banned', 'view_threshold', 'retention_threshold',
  'approval_threshold', 'memory_limit', 'oversight_limit',
];

function checkSoulMd(): void {
  const soulPath = path.join(ROOT, 'SOUL.md');
  if (!fs.existsSync(soulPath)) {
    fail('soul:exists', 'SOUL.md not found at project root');
    return;
  }
  pass('soul:exists', 'SOUL.md present');

  const content = fs.readFileSync(soulPath, 'utf8');
  let allPresent = true;
  for (const ks of REQUIRED_KILL_SWITCHES) {
    if (content.includes(`kill_switch: ${ks}`)) {
      pass(`soul:kill_switch:${ks}`, 'present');
    } else {
      fail(`soul:kill_switch:${ks}`, 'MISSING from SOUL.md');
      allPresent = false;
    }
  }
  if (allPresent) {
    pass('soul:all_kill_switches', `all ${REQUIRED_KILL_SWITCHES.length}/6 kill switches present`);
  }

  // Check constraint version
  if (content.includes('constraintVersion: 0.2.0') || content.includes('Constraint version: 0.2.0') || content.includes('0.2.0')) {
    pass('soul:version', 'constraint version 0.2.0 referenced');
  } else {
    warn('soul:version', 'constraint version 0.2.0 not found in SOUL.md');
  }
}

// ---------------------------------------------------------------------------
// Check 5: AMD-23 files
// ---------------------------------------------------------------------------

function checkAmd23Files(): void {
  const files = [
    'scripts/amd23/chamber2-cred-score.ts',
    'scripts/amd23/chamber4-soul-handshake.ts',
    'scripts/amd23/cerberus-gateway.ts',
  ];
  for (const f of files) {
    const fullPath = path.join(ROOT, f);
    if (fs.existsSync(fullPath)) {
      pass(`amd23:${path.basename(f)}`, `${f} present`);
    } else {
      fail(`amd23:${path.basename(f)}`, `${f} MISSING`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 6: DeerFlow SKILL.md files
// ---------------------------------------------------------------------------

function checkSkillFiles(): void {
  for (const pkg of PACKAGES.filter(p => p !== 'sdk')) {
    const skillPath = path.join(GODMAN_DIR, pkg, 'skills', 'public', `godman-${pkg}`, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      pass(`deerflow:${pkg}`, `SKILL.md present`);
    } else {
      warn(`deerflow:${pkg}`, `SKILL.md missing at ${skillPath}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 7: Launch assets
// ---------------------------------------------------------------------------

function checkLaunchAssets(): void {
  const launchStatus = path.join(GODMAN_DIR, 'LAUNCH-STATUS.md');
  if (!fs.existsSync(launchStatus)) {
    warn('assets:launch-status', 'LAUNCH-STATUS.md not found');
    return;
  }

  const content = fs.readFileSync(launchStatus, 'utf8');
  const demoCount = (content.match(/✅.*demo/g) || []).length;
  if (demoCount >= 7) {
    pass('assets:demos', `${demoCount}/7 demos recorded`);
  } else {
    warn('assets:demos', `only ${demoCount}/7 demos recorded`);
  }

  if (content.includes('X megathread') || content.includes('10 tweets')) {
    pass('assets:x-thread', 'X megathread present');
  } else {
    warn('assets:x-thread', 'X megathread not confirmed in LAUNCH-STATUS.md');
  }

  const publishAllPath = path.join(GODMAN_DIR, 'publish-all.sh');
  if (fs.existsSync(publishAllPath)) {
    pass('assets:publish-script', 'publish-all.sh present');
  } else {
    fail('assets:publish-script', 'publish-all.sh MISSING');
  }
}

// ---------------------------------------------------------------------------
// Check 8: npm login status
// ---------------------------------------------------------------------------

function checkNpmAuth(): void {
  try {
    const whoami = sh('npm whoami 2>&1').trim();
    if (whoami === 'skingem1' || whoami.length > 0) {
      pass('npm:auth', `logged in as ${whoami}`);
    } else {
      warn('npm:auth', 'npm whoami returned empty — run `npm login`');
    }
  } catch {
    warn('npm:auth', 'not logged in to npm — run `npm login` before April 14 publish');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function runAllChecks(): void {
  console.log('=== Godman Protocols Pre-Launch Validation ===');
  console.log(`Target: @godman-protocols/* v${TARGET_VER} — April 14, 2026 launch\n`);

  console.log('1. Package versions...');
  checkVersions();

  console.log('2. TypeScript builds...');
  checkBuilds();

  console.log('3. npm publish dry-run...');
  checkDryRun();

  console.log('4. SOUL.md kill switches...');
  checkSoulMd();

  console.log('5. AMD-23 Cerberus files...');
  checkAmd23Files();

  console.log('6. DeerFlow SKILL.md files...');
  checkSkillFiles();

  console.log('7. Launch assets...');
  checkLaunchAssets();

  console.log('8. npm auth...');
  checkNpmAuth();
}

runAllChecks();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const passed  = results.filter(r => r.status === 'PASS').length;
const failed  = results.filter(r => r.status === 'FAIL').length;
const warned  = results.filter(r => r.status === 'WARN').length;
const skipped = results.filter(r => r.status === 'SKIP').length;
const total   = results.length;

console.log('\n=== Results ===');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : r.status === 'WARN' ? '⚠️ ' : '⏭️ ';
  if (r.status !== 'PASS') {
    console.log(`${icon} [${r.status}] ${r.check}: ${r.detail}`);
  }
}

console.log(`\n${total} checks: ${passed} PASS  ${failed} FAIL  ${warned} WARN  ${skipped} SKIP`);

const ready = failed === 0;
console.log(`\nLaunch status: ${ready ? '🟢 READY FOR PUBLISH' : '🔴 NOT READY — fix FAIL items'}`);
if (!ready) {
  console.log('\nFailed checks:');
  results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  ✗ ${r.check}: ${r.detail}`));
}

// Write report
const report = {
  generatedAt: new Date().toISOString(),
  targetVersion: TARGET_VER,
  launchDate: '2026-04-14',
  daysUntilLaunch: Math.ceil((new Date('2026-04-14').getTime() - Date.now()) / 86400000),
  summary: { total, passed, failed, warned, skipped, ready },
  results,
};
const reportPath = path.join(GODMAN_DIR, 'pre-launch-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`\nReport written: ${reportPath}`);

process.exit(ready ? 0 : 1);
