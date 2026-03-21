#!/usr/bin/env npx ts-node
/**
 * verify-brainx-db.ts — BrainX PostgreSQL + pgvector setup verification
 * Sprint 705: GOV Phase 2. Checks DB connectivity, extensions, tables.
 *
 * Run: npx ts-node scripts/verify-brainx-db.ts
 * Returns JSON status + human-readable summary.
 * If DB missing, prints setup commands from scripts/lib/brainx-schema.sql.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface CheckResult {
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
}

function run(cmd: string): string | null {
  try { return execSync(cmd, { timeout: 5000, encoding: 'utf-8' }).trim(); }
  catch { return null; }
}

function checkPostgresRunning(): CheckResult {
  const result = run('pg_isready -q 2>/dev/null && echo OK || echo FAIL');
  return {
    check: 'PostgreSQL running',
    status: result?.includes('OK') ? 'PASS' : 'FAIL',
    detail: result?.includes('OK') ? 'pg_isready: accepting connections' : 'PostgreSQL not running or not installed'
  };
}

function checkDatabase(): CheckResult {
  const db = process.env.PGDATABASE || 'kognai';
  const result = run(`psql -d ${db} -c "SELECT 1;" 2>/dev/null`);
  return {
    check: `Database '${db}' exists`,
    status: result ? 'PASS' : 'FAIL',
    detail: result ? `Connected to ${db}` : `Database '${db}' not found. Run: psql -d postgres -c "CREATE DATABASE ${db};"`
  };
}

function checkVectorExtension(): CheckResult {
  const db = process.env.PGDATABASE || 'kognai';
  const result = run(`psql -d ${db} -tAc "SELECT extname FROM pg_extension WHERE extname='vector';" 2>/dev/null`);
  return {
    check: 'pgvector extension',
    status: result === 'vector' ? 'PASS' : 'FAIL',
    detail: result === 'vector' ? 'vector extension loaded' : `pgvector not installed. Run: psql -d ${db} -c "CREATE EXTENSION IF NOT EXISTS vector;"`
  };
}

function checkUuidExtension(): CheckResult {
  const db = process.env.PGDATABASE || 'kognai';
  const result = run(`psql -d ${db} -tAc "SELECT extname FROM pg_extension WHERE extname='uuid-ossp';" 2>/dev/null`);
  return {
    check: 'uuid-ossp extension',
    status: result === 'uuid-ossp' ? 'PASS' : 'WARN',
    detail: result === 'uuid-ossp' ? 'uuid-ossp extension loaded' : 'uuid-ossp not loaded (needed for brainx_memories)'
  };
}

function checkBrainxTable(): CheckResult {
  const db = process.env.PGDATABASE || 'kognai';
  const result = run(`psql -d ${db} -tAc "SELECT COUNT(*) FROM brainx_memories;" 2>/dev/null`);
  if (result !== null) {
    return {
      check: 'brainx_memories table',
      status: 'PASS',
      detail: `Table exists, ${result} rows`
    };
  }
  return {
    check: 'brainx_memories table',
    status: 'FAIL',
    detail: `Table not found. Run: psql -d ${db} -f scripts/lib/brainx-schema.sql`
  };
}

function checkEnvVars(): CheckResult {
  const required = ['PGHOST', 'PGDATABASE', 'PGUSER'];
  const missing = required.filter(k => !process.env[k]);
  return {
    check: 'Environment variables',
    status: missing.length === 0 ? 'PASS' : 'WARN',
    detail: missing.length === 0
      ? `All set: ${required.join(', ')}`
      : `Missing: ${missing.join(', ')}. Using defaults (localhost/kognai).`
  };
}

// ── Main ──

const checks: CheckResult[] = [
  checkEnvVars(),
  checkPostgresRunning(),
];

// Only run DB-level checks if PostgreSQL is running
if (checks[1].status === 'PASS') {
  checks.push(checkDatabase());
  if (checks[2].status === 'PASS') {
    checks.push(checkVectorExtension());
    checks.push(checkUuidExtension());
    checks.push(checkBrainxTable());
  }
}

const overall = checks.some(c => c.status === 'FAIL') ? 'NOT READY'
  : checks.every(c => c.status === 'PASS') ? 'READY'
  : 'READY';  // WARN-only = functional, just missing optional env vars

const report = {
  timestamp: new Date().toISOString(),
  overall,
  checks,
  setup_commands: overall !== 'READY' ? [
    'brew install postgresql@16',
    'brew services start postgresql@16',
    'psql -d postgres -c "CREATE DATABASE kognai;"',
    'psql -d kognai -c "CREATE EXTENSION IF NOT EXISTS vector;"',
    'psql -d kognai -c "CREATE EXTENSION IF NOT EXISTS \\"uuid-ossp\\";"',
    'psql -d kognai -f scripts/lib/brainx-schema.sql'
  ] : undefined
};

// Output
console.log('\n=== BrainX Database Verification ===');
for (const c of checks) {
  const icon = c.status === 'PASS' ? '✅' : c.status === 'WARN' ? '⚠️' : '❌';
  console.log(`${icon} ${c.check}: ${c.detail}`);
}
console.log(`\nOverall: ${overall}`);

if (overall !== 'READY') {
  console.log('\n📋 Setup commands (run in order):');
  for (const cmd of report.setup_commands!) {
    console.log(`  ${cmd}`);
  }
}

// Write status file
const statusPath = path.join(__dirname, '..', 'reports', 'brainx-status.json');
fs.writeFileSync(statusPath, JSON.stringify(report, null, 2));
console.log(`\n📄 Status written to reports/brainx-status.json`);

// Export for Telegram bot
export function getBrainxStatus(): string {
  try {
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    const lines = [`🧠 BrainX DB: ${status.overall}`];
    for (const c of status.checks) {
      const icon = c.status === 'PASS' ? '✅' : c.status === 'WARN' ? '⚠️' : '❌';
      lines.push(`${icon} ${c.check}`);
    }
    if (status.overall !== 'READY') {
      lines.push('\n⚠️ Run: npx ts-node scripts/verify-brainx-db.ts for setup commands');
    }
    return lines.join('\n');
  } catch {
    return '🧠 BrainX DB: Unknown (run verify-brainx-db.ts first)';
  }
}
