#!/usr/bin/env ts-node
/**
 * PM2 Health Reporter — Sprint 498
 * Quick health summary of all Kognai PM2 processes.
 * Outputs plain text (for Telegram /pm2 command) or JSON (--json flag).
 *
 * Usage: npx ts-node scripts/pm2-health.ts [--json] [--telegram]
 */

import { execSync } from 'child_process';

const JSON_MODE = process.argv.includes('--json');
const TELEGRAM_MODE = process.argv.includes('--telegram');

interface PM2Process {
  name: string;
  pm2_env: {
    status: string;
    restart_time: number;
    pm_uptime: number;
    cron_restart?: string;
  };
  monit: {
    memory: number;
    cpu: number;
  };
}

// Kognai-local process prefixes (skip Invoica server processes)
const KOGNAI_PREFIXES = [
  'pending-local-drain',
  'telegram-bot',
  'kognai-',
  'scs001-',
  'achiri-',
  'vault-dashboard',
  'clawrouter-gateway',
];

function isKognaiLocal(name: string): boolean {
  return KOGNAI_PREFIXES.some(prefix => name.startsWith(prefix));
}

function formatUptime(ms: number): string {
  if (!ms) return '-';
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function formatMem(bytes: number): string {
  if (!bytes) return '0b';
  return `${Math.round(bytes / (1024 * 1024))}mb`;
}

function statusIcon(status: string, restarts: number): string {
  if (status === 'online' && restarts > 50) return '⚠️';
  if (status === 'online') return '✅';
  if (status === 'stopped') return '⏸️';
  if (status === 'errored') return '❌';
  return '❓';
}

function main() {
  let processes: PM2Process[];
  try {
    const output = execSync('pm2 jlist', { encoding: 'utf-8', timeout: 10000 });
    processes = JSON.parse(output);
  } catch {
    console.log(JSON_MODE ? '{"error":"PM2 not running"}' : 'PM2 not running or not accessible');
    process.exit(1);
  }

  const kognai = processes.filter(p => isKognaiLocal(p.name));

  if (JSON_MODE) {
    const report = kognai.map(p => ({
      name: p.name,
      status: p.pm2_env.status,
      restarts: p.pm2_env.restart_time,
      uptime: formatUptime(p.pm2_env.pm_uptime),
      memory: formatMem(p.monit.memory),
      cpu: p.monit.cpu,
      cron: p.pm2_env.cron_restart || null,
    }));
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), processes: report }, null, 2));
    return;
  }

  // Group by status
  const online = kognai.filter(p => p.pm2_env.status === 'online');
  const stopped = kognai.filter(p => p.pm2_env.status === 'stopped');
  const errored = kognai.filter(p => p.pm2_env.status === 'errored');
  const crashLoopers = kognai.filter(p => p.pm2_env.restart_time > 50);

  const header = TELEGRAM_MODE
    ? '🖥 *PM2 Health Report*'
    : '=== PM2 Health Report ===';

  const lines: string[] = [header, ''];

  // Summary line
  lines.push(`Online: ${online.length} | Stopped: ${stopped.length} | Errored: ${errored.length} | Total: ${kognai.length}`);
  lines.push('');

  // All processes
  for (const p of kognai) {
    const icon = statusIcon(p.pm2_env.status, p.pm2_env.restart_time);
    const uptime = p.pm2_env.status === 'online' ? formatUptime(p.pm2_env.pm_uptime) : '-';
    const mem = p.pm2_env.status === 'online' ? formatMem(p.monit.memory) : '-';
    const restartInfo = p.pm2_env.restart_time > 0 ? ` (↺${p.pm2_env.restart_time})` : '';
    lines.push(`${icon} ${p.name}: ${p.pm2_env.status} ${uptime} ${mem}${restartInfo}`);
  }

  // Crash-loop warnings
  if (crashLoopers.length > 0) {
    lines.push('');
    lines.push('⚠️ CRASH-LOOP:');
    for (const p of crashLoopers) {
      lines.push(`  ${p.name}: ${p.pm2_env.restart_time} restarts`);
    }
  }

  // Not registered (in ecosystem but not in PM2)
  const registeredNames = new Set(processes.map(p => p.name));
  // We'd need ecosystem.config.js to check, skip for now

  console.log(lines.join('\n'));
}

main();
