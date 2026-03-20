#!/usr/bin/env ts-node
/**
 * PM2 Startup Orchestrator — Sprint 498
 * Starts all Kognai-local PM2 processes from ecosystem.config.js.
 * Skips Invoica/server processes (cwd = /home/invoica/).
 * Reports health after startup.
 *
 * Usage: npx ts-node scripts/pm2-startup.ts [--dry-run] [--only essential]
 */

import { execSync } from 'child_process';
import * as path from 'path';

const KOGNAI_ROOT = path.resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');
const ESSENTIAL_ONLY = process.argv.includes('--only') && process.argv.includes('essential');

// Essential processes that should always be running
const ESSENTIAL = [
  'telegram-bot',
  'kognai-daily-digest',
  'kognai-gate-regen',
  'kognai-gate-tracker-update',
  'kognai-brief-regen',
  'kognai-pipeline-watchdog',
  'kognai-smoke-test',
  'kognai-auto-healer',
  'scs001-pipeline',
  'vault-dashboard',
  'clawrouter-gateway',
];

// Processes that are Kognai-local (not Invoica server-side)
const KOGNAI_LOCAL_PREFIXES = [
  'pending-local-drain',
  'telegram-bot',
  'kognai-',
  'scs001-',
  'achiri-',
  'vault-dashboard',
  'clawrouter-gateway',
];

interface PM2Process {
  name: string;
  pm2_env: {
    status: string;
    restart_time: number;
    pm_uptime: number;
    cwd?: string;
  };
  monit: {
    memory: number;
    cpu: number;
  };
}

function getRunningProcesses(): PM2Process[] {
  try {
    const output = execSync('pm2 jlist', { encoding: 'utf-8', timeout: 10000 });
    return JSON.parse(output);
  } catch {
    return [];
  }
}

function isKognaiLocal(name: string): boolean {
  return KOGNAI_LOCAL_PREFIXES.some(prefix => name.startsWith(prefix));
}

function startProcess(name: string): { ok: boolean; msg: string } {
  if (DRY_RUN) {
    return { ok: true, msg: `[DRY-RUN] Would start: ${name}` };
  }
  try {
    execSync(
      `pm2 start ${KOGNAI_ROOT}/ecosystem.config.js --only ${name}`,
      { encoding: 'utf-8', timeout: 30000, cwd: KOGNAI_ROOT }
    );
    return { ok: true, msg: `Started: ${name}` };
  } catch (e: any) {
    return { ok: false, msg: `Failed to start ${name}: ${e.message?.slice(0, 100)}` };
  }
}

function formatUptime(ms: number): string {
  if (!ms) return 'N/A';
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function formatMem(bytes: number): string {
  if (!bytes) return '0b';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}kb`;
  return `${Math.round(bytes / (1024 * 1024))}mb`;
}

async function main() {
  console.log('=== PM2 Startup Orchestrator — Sprint 498 ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'} | Filter: ${ESSENTIAL_ONLY ? 'essential' : 'all kognai'}`);
  console.log('');

  // Get current state
  const running = getRunningProcesses();
  const runningNames = new Set(running.filter(p => p.pm2_env.status === 'online').map(p => p.name));
  const registeredNames = new Set(running.map(p => p.name));

  // Parse ecosystem.config.js to find Kognai processes
  // We use the known list instead of require() to avoid side effects
  const ecosystemPath = path.join(KOGNAI_ROOT, 'ecosystem.config.js');
  let allApps: { name: string }[];
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require(ecosystemPath);
    allApps = config.apps || [];
  } catch {
    console.error('Failed to load ecosystem.config.js');
    process.exit(1);
  }

  const kognaiApps = allApps
    .filter(app => isKognaiLocal(app.name))
    .filter(app => !ESSENTIAL_ONLY || ESSENTIAL.includes(app.name));

  console.log(`Found ${kognaiApps.length} Kognai-local processes to manage\n`);

  // Report current state + start stopped processes
  let started = 0;
  let alreadyRunning = 0;
  let failed = 0;

  for (const app of kognaiApps) {
    const isRunning = runningNames.has(app.name);
    const proc = running.find(p => p.name === app.name);
    const restarts = proc?.pm2_env?.restart_time || 0;
    const crashLoop = restarts > 50;

    if (isRunning) {
      const uptime = formatUptime(proc!.pm2_env.pm_uptime);
      const mem = formatMem(proc!.monit.memory);
      const warning = crashLoop ? ` ⚠️ ${restarts} restarts!` : '';
      console.log(`  ✅ ${app.name} — online (${uptime}, ${mem})${warning}`);
      alreadyRunning++;
    } else {
      const result = startProcess(app.name);
      const icon = result.ok ? '🟢' : '🔴';
      console.log(`  ${icon} ${result.msg}`);
      if (result.ok) started++;
      else failed++;
    }
  }

  // Summary
  console.log('\n--- Summary ---');
  console.log(`  Already running: ${alreadyRunning}`);
  console.log(`  Started:         ${started}`);
  console.log(`  Failed:          ${failed}`);
  console.log(`  Total managed:   ${kognaiApps.length}`);

  // Crash-loop warnings
  const crashLoopers = running.filter(
    p => isKognaiLocal(p.name) && p.pm2_env.restart_time > 50
  );
  if (crashLoopers.length > 0) {
    console.log('\n⚠️  CRASH-LOOP WARNINGS:');
    for (const p of crashLoopers) {
      console.log(`  ${p.name}: ${p.pm2_env.restart_time} restarts — investigate logs:`);
      console.log(`    pm2 logs ${p.name} --lines 20`);
    }
  }

  // Save PM2 state so processes survive reboot
  if (!DRY_RUN && started > 0) {
    try {
      execSync('pm2 save', { encoding: 'utf-8', timeout: 10000 });
      console.log('\n✅ PM2 process list saved (survives reboot)');
    } catch {
      console.log('\n⚠️ Could not save PM2 process list');
    }
  }
}

main().catch(console.error);
