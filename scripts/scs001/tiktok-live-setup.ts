#!/usr/bin/env npx ts-node
/**
 * tiktok-live-setup.ts — Sprint 1312
 *
 * TikTok LIVE stream readiness validation.
 * Checks credentials, simulates live setup in dry-run mode when token is missing.
 * Writes a JSON report to reports/tiktok-live-setup.json.
 *
 * Usage:
 *   npx ts-node scripts/scs001/tiktok-live-setup.ts
 *
 * Exit codes: 0 = ready or dry-run complete, 1 = critical config missing
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
try { require('dotenv').config({ path: path.join(ROOT, '.env') }); } catch {}

const REPORT_PATH = path.join(ROOT, 'reports', 'tiktok-live-setup.json');

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
  action?: string;
}

interface SetupReport {
  generated_at: string;
  token_valid: boolean;
  client_creds_present: boolean;
  dry_run: boolean;
  checks: CheckResult[];
  next_steps: string[];
}

function runChecks(): CheckResult[] {
  const results: CheckResult[] = [];

  // 1. Client Key
  const hasClientKey = !!process.env.TIKTOK_CLIENT_KEY;
  results.push({
    name: 'Client Key',
    pass: hasClientKey,
    detail: hasClientKey ? 'TIKTOK_CLIENT_KEY is set' : 'TIKTOK_CLIENT_KEY missing from .env',
    action: hasClientKey ? undefined : 'Add TIKTOK_CLIENT_KEY to .env',
  });

  // 2. Client Secret
  const hasClientSecret = !!process.env.TIKTOK_CLIENT_SECRET;
  results.push({
    name: 'Client Secret',
    pass: hasClientSecret,
    detail: hasClientSecret ? 'TIKTOK_CLIENT_SECRET is set' : 'TIKTOK_CLIENT_SECRET missing from .env',
    action: hasClientSecret ? undefined : 'Add TIKTOK_CLIENT_SECRET to .env',
  });

  // 3. Access Token
  const hasToken = !!process.env.TIKTOK_ACCESS_TOKEN;
  results.push({
    name: 'Access Token',
    pass: hasToken,
    detail: hasToken ? 'TIKTOK_ACCESS_TOKEN is set — live posting unblocked' : 'TIKTOK_ACCESS_TOKEN missing — dry-run mode active',
    action: hasToken ? undefined : 'Obtain token via TikTok Developer Portal OAuth flow',
  });

  // 4. Reports directory
  const reportsDir = path.join(ROOT, 'reports');
  const reportsExists = fs.existsSync(reportsDir);
  results.push({
    name: 'Reports Directory',
    pass: reportsExists,
    detail: reportsExists ? 'reports/ directory exists' : 'reports/ directory missing',
    action: reportsExists ? undefined : 'mkdir -p reports/',
  });

  // 5. PM2 scs001-live in ecosystem config
  const ecosystemPath = path.join(ROOT, 'ecosystem.config.js');
  let liveProcessFound = false;
  if (fs.existsSync(ecosystemPath)) {
    const content = fs.readFileSync(ecosystemPath, 'utf8');
    liveProcessFound = content.includes('scs001-live');
  }
  results.push({
    name: 'PM2 scs001-live Config',
    pass: liveProcessFound,
    detail: liveProcessFound ? 'scs001-live process found in ecosystem.config.js' : 'scs001-live not in ecosystem.config.js',
    action: liveProcessFound ? undefined : 'Add scs001-live PM2 process to ecosystem.config.js',
  });

  return results;
}

function buildNextSteps(checks: CheckResult[], dryRun: boolean): string[] {
  const steps: string[] = [];
  if (dryRun) {
    steps.push('Obtain TIKTOK_ACCESS_TOKEN via TikTok Developer Portal');
    steps.push('Add TIKTOK_ACCESS_TOKEN to .env');
    steps.push('Re-run this script to verify live readiness');
  }
  for (const c of checks) {
    if (!c.pass && c.action) steps.push(c.action);
  }
  if (!dryRun && checks.every(c => c.pass)) {
    steps.push('Run: pm2 start ecosystem.config.js --only scs001-live');
    steps.push('Monitor: pm2 logs scs001-live');
  }
  return [...new Set(steps)];
}

function main() {
  const checks = runChecks();
  const dryRun = !process.env.TIKTOK_ACCESS_TOKEN;
  const tokenValid = !!process.env.TIKTOK_ACCESS_TOKEN;
  const clientCredsPresent = !!process.env.TIKTOK_CLIENT_KEY && !!process.env.TIKTOK_CLIENT_SECRET;

  const report: SetupReport = {
    generated_at: new Date().toISOString(),
    token_valid: tokenValid,
    client_creds_present: clientCredsPresent,
    dry_run: dryRun,
    checks,
    next_steps: buildNextSteps(checks, dryRun),
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  const passCount = checks.filter(c => c.pass).length;
  const total = checks.length;
  const mode = dryRun ? '[DRY-RUN]' : '[LIVE]';
  console.log(`\nTikTok Live Setup ${mode}`);
  console.log(`Checks: ${passCount}/${total} passed`);
  for (const c of checks) {
    const icon = c.pass ? '\u2713' : '\u2717';
    console.log(`  ${icon} ${c.name}: ${c.detail}`);
  }
  if (report.next_steps.length > 0) {
    console.log('\nNext steps:');
    for (const s of report.next_steps) console.log(`  -> ${s}`);
  }
  console.log(`\nReport: ${REPORT_PATH}`);

  process.exit(clientCredsPresent ? 0 : 1);
}

main();
