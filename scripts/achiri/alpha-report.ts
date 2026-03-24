#!/usr/bin/env npx ts-node
/**
 * alpha-report.ts — Sprint 984
 * Weekly alpha readiness report for April 25 Achiri launch.
 *
 * Reads live project data and produces a go/no-go summary:
 * - Gate dates with countdowns
 * - Waitlist / whitelist counts
 * - Telegram bot health check
 * - Latest readiness test results
 * - Critical blockers
 *
 * Usage: npx ts-node scripts/achiri/alpha-report.ts [--json] [--telegram]
 * Output: reports/achiri-alpha-report.json + console
 * --telegram: also sends summary to operator via Telegram
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as https from 'https';

const CWD = process.cwd();
const JSON_FLAG = process.argv.includes('--json');
const TELEGRAM_FLAG = process.argv.includes('--telegram');
const NOW = new Date();

interface GateStatus {
  name: string;
  targetDate: string;
  daysRemaining: number;
  status: 'pass' | 'pending' | 'overdue';
  notes: string;
}

interface AlphaReport {
  generated: string;
  launchDate: string;
  daysToLaunch: number;
  verdict: 'GO' | 'NO-GO' | 'AT-RISK';
  gates: GateStatus[];
  waitlistCount: number;
  whitelistCount: number;
  botHealthy: boolean;
  readinessPassRate: string;
  blockers: string[];
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + ' 2026');
  const diff = target.getTime() - NOW.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function parseGateTracker(): GateStatus[] {
  const gates: GateStatus[] = [];
  const path = join(CWD, 'docs/gate-tracker.md');
  if (!existsSync(path)) return gates;

  const content = readFileSync(path, 'utf8');
  const rows = content.split('\n').filter(l => l.startsWith('|') && !l.includes('Gate |') && !l.includes('---|'));

  for (const row of rows) {
    const cols = row.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 4) continue;

    const name = cols[0];
    const dateStr = cols[1];
    const statusRaw = cols[2];
    const notes = cols[4] || '';

    let status: GateStatus['status'] = 'pending';
    if (statusRaw.includes('PASS')) status = 'pass';
    else {
      const days = daysUntil(dateStr);
      if (days < 0) status = 'overdue';
    }

    gates.push({
      name,
      targetDate: dateStr,
      daysRemaining: daysUntil(dateStr),
      status,
      notes,
    });
  }
  return gates;
}

function countJsonlLines(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  const lines = readFileSync(filePath, 'utf8').trim().split('\n').filter(l => l.trim());
  return lines.length;
}

function checkBotHealth(): boolean {
  const offsetFile = join(CWD, 'data/telegram-bot-offset.txt');
  if (!existsSync(offsetFile)) return false;
  const content = readFileSync(offsetFile, 'utf8').trim();
  return content.length > 0 && !isNaN(Number(content));
}

function getReadinessResults(): string {
  const reportPath = join(CWD, 'reports/achiri-readiness.json');
  if (!existsSync(reportPath)) return 'NOT RUN';
  try {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    const passed = report.checks?.filter((c: any) => c.pass).length || 0;
    const total = report.checks?.length || 0;
    return `${passed}/${total}`;
  } catch {
    return 'PARSE ERROR';
  }
}

function identifyBlockers(gates: GateStatus[], botHealthy: boolean, waitlist: number): string[] {
  const blockers: string[] = [];

  const overdueGates = gates.filter(g => g.status === 'overdue');
  for (const g of overdueGates) {
    blockers.push(`OVERDUE: ${g.name} (was ${g.targetDate})`);
  }

  if (!botHealthy) {
    blockers.push('Telegram bot not responding (no offset file or invalid)');
  }

  if (waitlist < 5) {
    blockers.push(`Waitlist too small (${waitlist}) — target: 10+ for alpha`);
  }

  const envPath = join(CWD, '.env');
  if (existsSync(envPath)) {
    const env = readFileSync(envPath, 'utf8');
    if (!env.includes('TIKTOK_ACCESS_TOKEN=') || env.includes('TIKTOK_ACCESS_TOKEN=\n')) {
      blockers.push('TIKTOK_ACCESS_TOKEN not set — live posting blocked');
    }
  }

  return blockers;
}

function sendTelegram(text: string): Promise<void> {
  return new Promise((resolve) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.OWNER_TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      console.log('  ⚠️  Telegram not configured (missing token or chat ID)');
      resolve();
      return;
    }

    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    });

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        console.log(`  📤 Telegram sent (status: ${res.statusCode})`);
        resolve();
      });
    });

    req.on('error', (e) => {
      console.log(`  ⚠️  Telegram error: ${e.message}`);
      resolve();
    });

    req.write(payload);
    req.end();
  });
}

async function main() {
  const gates = parseGateTracker();
  const waitlistCount = countJsonlLines(join(CWD, 'workspace/achiri/waitlist.jsonl'));
  const whitelistCount = countJsonlLines(join(CWD, 'workspace/achiri/alpha-whitelist.jsonl'));
  const botHealthy = checkBotHealth();
  const readinessPassRate = getReadinessResults();
  const blockers = identifyBlockers(gates, botHealthy, waitlistCount);

  const launchGate = gates.find(g => g.name.includes('Alpha Launch'));
  const daysToLaunch = launchGate?.daysRemaining ?? -1;

  let verdict: AlphaReport['verdict'] = 'GO';
  if (blockers.length > 2) verdict = 'NO-GO';
  else if (blockers.length > 0) verdict = 'AT-RISK';

  const report: AlphaReport = {
    generated: NOW.toISOString(),
    launchDate: 'Apr 25 2026',
    daysToLaunch,
    verdict,
    gates,
    waitlistCount,
    whitelistCount,
    botHealthy,
    readinessPassRate,
    blockers,
  };

  // Write JSON report
  const reportsDir = join(CWD, 'reports');
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, 'achiri-alpha-report.json'), JSON.stringify(report, null, 2));

  if (JSON_FLAG) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Console output
  const verdictIcon = verdict === 'GO' ? '🟢' : verdict === 'AT-RISK' ? '🟡' : '🔴';
  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  ACHIRI ALPHA REPORT — ${verdictIcon} ${verdict}`);
  console.log(`  Generated: ${NOW.toISOString().slice(0, 16)}`);
  console.log(`  Days to launch: ${daysToLaunch}`);
  console.log('══════════════════════════════════════════════════════\n');

  console.log('  📅 GATES');
  for (const g of gates) {
    const icon = g.status === 'pass' ? '✅' : g.status === 'overdue' ? '🚫' : '⏳';
    const days = g.daysRemaining > 0 ? `${g.daysRemaining}d` : g.status === 'pass' ? 'done' : 'OVERDUE';
    console.log(`     ${icon} ${g.name} — ${g.targetDate} (${days})`);
  }

  console.log(`\n  👥 USERS`);
  console.log(`     Waitlist: ${waitlistCount}`);
  console.log(`     Whitelist: ${whitelistCount}`);

  console.log(`\n  🤖 BOT HEALTH`);
  console.log(`     Telegram: ${botHealthy ? '✅ online' : '❌ offline'}`);

  console.log(`\n  🧪 READINESS`);
  console.log(`     Last test: ${readinessPassRate}`);

  if (blockers.length > 0) {
    console.log(`\n  🚧 BLOCKERS (${blockers.length})`);
    for (const b of blockers) {
      console.log(`     • ${b}`);
    }
  }

  console.log('\n══════════════════════════════════════════════════════\n');

  // Telegram notification
  if (TELEGRAM_FLAG) {
    const tgText = [
      `${verdictIcon} *ACHIRI ALPHA REPORT*`,
      `Days to launch: ${daysToLaunch}`,
      `Verdict: *${verdict}*`,
      `Waitlist: ${waitlistCount} | Whitelist: ${whitelistCount}`,
      `Bot: ${botHealthy ? '✅' : '❌'} | Tests: ${readinessPassRate}`,
      blockers.length > 0 ? `\nBlockers:\n${blockers.map(b => `• ${b}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    await sendTelegram(tgText);
  }

  process.exit(verdict === 'NO-GO' ? 1 : 0);
}

main();
