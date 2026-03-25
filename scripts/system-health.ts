/**
 * system-health.ts — Kognai System Health Aggregator
 * Sprint 1233 / HEALTH-DASH
 *
 * Aggregates all critical system metrics into reports/system-health.json.
 * Tracks history for trend analysis. Run daily via PM2 cron.
 *
 * Usage: npx tsx scripts/system-health.ts [--telegram]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ROOT = join(import.meta.dirname ?? __dirname, '..');
const REPORT_PATH = join(ROOT, 'reports', 'system-health.json');
const HISTORY_PATH = join(ROOT, 'reports', 'system-health-history.jsonl');
const SEND_TELEGRAM = process.argv.includes('--telegram');

// ---------------------------------------------------------------------------
// Metric collectors
// ---------------------------------------------------------------------------

interface Metric {
  name: string;
  value: number | string;
  status: 'ok' | 'warn' | 'critical';
  detail: string;
}

function collectGateMetrics(): Metric {
  const gateFile = join(ROOT, 'workspace', 'gates', 'phase1-5-gate.json');
  if (!existsSync(gateFile)) return { name: 'gate_progress', value: 0, status: 'warn', detail: 'Gate file missing' };
  try {
    const gate = JSON.parse(readFileSync(gateFile, 'utf-8'));
    const deadline = new Date('2026-04-07');
    const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / (86400000));
    const posts = gate.current_posts ?? gate.posts ?? 0;
    const paceNeeded = daysLeft > 0 ? Math.ceil((30 - posts) / daysLeft) : 999;
    return {
      name: 'gate_progress',
      value: posts,
      status: posts >= 30 ? 'ok' : (daysLeft < 7 && posts < 20 ? 'critical' : 'warn'),
      detail: `${posts}/30 posts, ${daysLeft}d left, need ${paceNeeded}/day`,
    };
  } catch { return { name: 'gate_progress', value: 0, status: 'warn', detail: 'Gate parse error' }; }
}

function collectScriptInventory(): Metric {
  const dir = join(ROOT, 'workspace', 'scs001', 'scripts');
  if (!existsSync(dir)) return { name: 'script_inventory', value: 0, status: 'warn', detail: 'Scripts dir missing' };
  const count = readdirSync(dir).filter(f => f.endsWith('.json')).length;
  return {
    name: 'script_inventory',
    value: count,
    status: count >= 10 ? 'ok' : 'warn',
    detail: `${count} scripts ready`,
  };
}

function collectLedgerHealth(): Metric {
  const ledger = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  if (!existsSync(ledger)) return { name: 'ledger_entries', value: 0, status: 'warn', detail: 'Ledger missing' };
  const lines = readFileSync(ledger, 'utf-8').split('\n').filter(l => l.trim());
  return { name: 'ledger_entries', value: lines.length, status: 'ok', detail: `${lines.length} entries` };
}

function collectReportsFreshness(): Metric {
  const reports = ['posting-health.json', 'stats-latest.json', 'achiri-analytics.json'];
  const oneDayAgo = Date.now() - 86400000;
  let stale = 0;
  for (const r of reports) {
    const p = join(ROOT, 'reports', r);
    if (!existsSync(p) || statSync(p).mtimeMs < oneDayAgo) stale++;
  }
  return {
    name: 'reports_freshness',
    value: reports.length - stale,
    status: stale === 0 ? 'ok' : 'warn',
    detail: `${reports.length - stale}/${reports.length} fresh`,
  };
}

function collectKnowledgeStore(): Metric {
  const dir = join(ROOT, 'workspace', 'knowledge', 'trading', 'records');
  if (!existsSync(dir)) return { name: 'knowledge_trading', value: 0, status: 'warn', detail: 'No records' };
  const files = readdirSync(dir).filter(f => f.startsWith('batch-'));
  let total = 0;
  for (const f of files) {
    try {
      const batch = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
      total += batch.count ?? 0;
    } catch {}
  }
  return { name: 'knowledge_trading', value: total, status: total > 0 ? 'ok' : 'warn', detail: `${total} records in ${files.length} batches` };
}

function collectObserverStatus(): Metric {
  const stateFile = join(ROOT, 'workspace', 'memory', '.observer-state.json');
  if (!existsSync(stateFile)) return { name: 'observer_status', value: 0, status: 'warn', detail: 'Never ran' };
  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
    const lastRun = new Date(state.lastRunAt);
    const hoursAgo = Math.round((Date.now() - lastRun.getTime()) / 3600000);
    return {
      name: 'observer_status',
      value: state.totalProcessed,
      status: hoursAgo < 24 ? 'ok' : 'warn',
      detail: `${state.totalProcessed} AAR entries, last run ${hoursAgo}h ago`,
    };
  } catch { return { name: 'observer_status', value: 0, status: 'warn', detail: 'State unreadable' }; }
}

function collectAARVolume(): Metric {
  const dir = join(ROOT, 'logs', 'aar');
  if (!existsSync(dir)) return { name: 'aar_volume', value: 0, status: 'warn', detail: 'AAR dir missing' };
  const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  let total = 0;
  for (const f of files) {
    total += readFileSync(join(dir, f), 'utf-8').split('\n').filter(l => l.trim()).length;
  }
  return { name: 'aar_volume', value: total, status: 'ok', detail: `${total} entries across ${files.length} files` };
}

function collectGitStatus(): Metric {
  try {
    const log = execSync('git log --oneline -1', { cwd: ROOT, timeout: 5000 }).toString().trim();
    return { name: 'git_head', value: log.slice(0, 8), status: 'ok', detail: log };
  } catch { return { name: 'git_head', value: 'unknown', status: 'warn', detail: 'Git unavailable' }; }
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

function run(): void {
  const ts = new Date().toISOString();
  const metrics: Metric[] = [
    collectGateMetrics(),
    collectScriptInventory(),
    collectLedgerHealth(),
    collectReportsFreshness(),
    collectKnowledgeStore(),
    collectObserverStatus(),
    collectAARVolume(),
    collectGitStatus(),
  ];

  const okCount = metrics.filter(m => m.status === 'ok').length;
  const warnCount = metrics.filter(m => m.status === 'warn').length;
  const critCount = metrics.filter(m => m.status === 'critical').length;
  const overall = critCount > 0 ? 'critical' : warnCount > 2 ? 'warn' : 'ok';

  const report = {
    generated_at: ts,
    overall_status: overall,
    summary: `${okCount} ok, ${warnCount} warn, ${critCount} critical`,
    metrics,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  // Append to history
  const historyEntry = JSON.stringify({ ts, overall, ok: okCount, warn: warnCount, critical: critCount, metrics: Object.fromEntries(metrics.map(m => [m.name, m.value])) });
  writeFileSync(HISTORY_PATH, (existsSync(HISTORY_PATH) ? readFileSync(HISTORY_PATH, 'utf-8') : '') + historyEntry + '\n');

  // Console output
  console.log(`\n━━━ Kognai System Health — ${ts} ━━━\n`);
  for (const m of metrics) {
    const icon = m.status === 'ok' ? '✓' : m.status === 'critical' ? '✗' : '⚠';
    console.log(`  ${icon} ${m.name}: ${m.detail}`);
  }
  console.log(`\n━━━ Overall: ${overall.toUpperCase()} (${report.summary}) ━━━\n`);

  // Telegram notification
  if (SEND_TELEGRAM) {
    const token = process.env['TELEGRAM_BOT_TOKEN'];
    const chatId = process.env['OWNER_TELEGRAM_CHAT_ID'];
    if (token && chatId) {
      const text = `🏥 *System Health*\n${metrics.map(m => {
        const icon = m.status === 'ok' ? '✅' : m.status === 'critical' ? '🔴' : '⚠️';
        return `${icon} ${m.name}: ${m.detail}`;
      }).join('\n')}\n\n*Overall: ${overall.toUpperCase()}*`;

      try {
        execSync(`curl -s -X POST "https://api.telegram.org/bot${token}/sendMessage" -d "chat_id=${chatId}&text=${encodeURIComponent(text)}&parse_mode=Markdown"`, { timeout: 10000 });
        console.log('[health] Telegram notification sent');
      } catch { console.warn('[health] Telegram send failed'); }
    }
  }
}

run();
