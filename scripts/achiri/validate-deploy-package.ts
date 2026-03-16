// Sprint 129 — validate-deploy-package.ts
// 5 validation checks for the Achiri Hetzner deployment package.
// Run: npx ts-node scripts/achiri/validate-deploy-package.ts

import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';

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

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(process.cwd(), rel));
}

function readFile(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

async function main(): Promise<void> {
  console.log('=== Sprint 129 — Achiri Hetzner Deploy Package Validation ===\n');

  // Check 1: nginx config exists and proxies to port 3420
  console.log('Check 1: infra/nginx-achiri.conf — nginx proxy config');
  check('file exists', fileExists('infra/nginx-achiri.conf'));
  const nginxContent = fileExists('infra/nginx-achiri.conf') ? readFile('infra/nginx-achiri.conf') : '';
  check('proxies to port 3420', nginxContent.includes('3420'), 'missing port 3420');
  check('has /achiri/ location block', nginxContent.includes('location /achiri/'));

  // Check 2: PM2 config for Hetzner exists and has achiri-api process
  console.log('\nCheck 2: infra/ecosystem-hetzner-achiri.config.js — PM2 config');
  check('file exists', fileExists('infra/ecosystem-hetzner-achiri.config.js'));
  const pm2Content = fileExists('infra/ecosystem-hetzner-achiri.config.js') ? readFile('infra/ecosystem-hetzner-achiri.config.js') : '';
  check("has 'achiri-api' process name", pm2Content.includes("'achiri-api'") || pm2Content.includes('"achiri-api"'));
  check('has ACHIRI_PORT 3420', pm2Content.includes('3420'));

  // Check 3: deploy script exists and is executable
  console.log('\nCheck 3: scripts/deploy-achiri.sh — deploy script');
  const deployPath = path.join(process.cwd(), 'scripts/deploy-achiri.sh');
  check('file exists', fs.existsSync(deployPath));
  if (fs.existsSync(deployPath)) {
    const stat = fs.statSync(deployPath);
    const isExec = (stat.mode & 0o111) !== 0;
    check('file is executable', isExec, `mode: ${(stat.mode & 0o777).toString(8)}`);
  } else {
    failed++;
    console.log('  FAIL  file is executable — file missing');
  }

  // Check 4: deploy script dry-run produces SSH commands
  console.log('\nCheck 4: deploy script dry-run produces expected commands');
  const result = child_process.spawnSync('bash', [deployPath, '--dry-run'], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  const dryOutput = (result.stdout ?? '') + (result.stderr ?? '');
  check('dry-run exits 0', result.status === 0, `exit code: ${result.status}, stderr: ${result.stderr?.slice(0, 80)}`);
  check('dry-run mentions rsync', dryOutput.includes('rsync'), dryOutput.slice(0, 100));
  check('dry-run mentions PM2 restart', dryOutput.includes('pm2'), dryOutput.slice(0, 100));

  // Check 5: all required Achiri agent files exist
  console.log('\nCheck 5: all required Achiri agent files present');
  const requiredFiles = [
    'agents/achiri/server.ts',
    'agents/achiri/index.ts',
    'agents/achiri/memory-store.ts',
    'agents/achiri/safety-filter.ts',
    'agents/achiri/eval-harness.ts',
    'agents/achiri/derja-profiler.ts',
    'agents/achiri/paymee.ts',
    'agents/achiri/voice-handler.ts',
    'agents/achiri/memory-search.ts',
    'kognai-agents/achiri/config.json',
    'kognai-agents/achiri/prompt.md',
  ];
  let allPresent = true;
  const missing: string[] = [];
  for (const f of requiredFiles) {
    if (!fileExists(f)) { allPresent = false; missing.push(f); }
  }
  check('all 11 agent files exist', allPresent, missing.length > 0 ? 'missing: ' + missing.join(', ') : '');

  console.log(`\n=== Results: ${passed} PASS, ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Validation error:', err);
  process.exit(1);
});
