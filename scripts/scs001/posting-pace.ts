/**
 * posting-pace.ts — Sprint 729
 *
 * Calculates posting pace: avg posts/day, estimated gate completion date,
 * and daily posting history. Uses publish-ledger.jsonl for data.
 *
 * Usage:
 *   npx ts-node scripts/scs001/posting-pace.ts
 *
 * Telegram: /pace
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const LEDGER_PATH = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const GATE_TARGET = 30;
const GATE_DATE = new Date('2026-04-07T00:00:00Z');

interface LedgerEntry {
  script_id: string;
  timestamp?: string;
  created_at?: string;
  date?: string;
}

function readLedger(): LedgerEntry[] {
  if (!existsSync(LEDGER_PATH)) return [];
  return readFileSync(LEDGER_PATH, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function getDateStr(entry: LedgerEntry): string {
  const ts = entry.timestamp || entry.created_at || entry.date || (entry as any).published_at || '';
  if (!ts) return 'unknown';
  return ts.substring(0, 10); // YYYY-MM-DD
}

function main() {
  const entries = readLedger();
  console.log(`=== Posting Pace Tracker ===\n`);
  console.log(`Total entries in ledger: ${entries.length}`);

  // Group by date
  const byDate = new Map<string, number>();
  for (const e of entries) {
    const d = getDateStr(e);
    if (d === 'unknown') continue;
    byDate.set(d, (byDate.get(d) || 0) + 1);
  }

  // Sort dates
  const dates = [...byDate.keys()].sort();
  if (dates.length === 0) {
    console.log('No dated entries found in ledger.');
    return;
  }

  // Calculate pace
  const firstDate = new Date(dates[0]);
  const lastDate = new Date(dates[dates.length - 1]);
  const totalDays = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / 86400000) + 1);
  const avgPerDay = entries.length / totalDays;

  console.log(`\nDate range: ${dates[0]} → ${dates[dates.length - 1]} (${totalDays} days)`);
  console.log(`Average: ${avgPerDay.toFixed(1)} posts/day`);

  // Gate progress
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - now.getTime()) / 86400000));
  const remaining = Math.max(0, GATE_TARGET - entries.length);

  if (remaining <= 0) {
    console.log(`\n✅ Gate target reached: ${entries.length}/${GATE_TARGET} posts`);
  } else {
    const neededPerDay = daysLeft > 0 ? (remaining / daysLeft).toFixed(1) : 'N/A';
    console.log(`\n⏳ Gate progress: ${entries.length}/${GATE_TARGET} (${remaining} remaining)`);
    console.log(`Need: ${neededPerDay} posts/day (${daysLeft} days left)`);

    // Estimate completion at current pace
    if (avgPerDay > 0) {
      const daysToComplete = Math.ceil(remaining / avgPerDay);
      const estDate = new Date(now.getTime() + daysToComplete * 86400000);
      const onTime = estDate <= GATE_DATE;
      console.log(`Est. completion: ${estDate.toISOString().substring(0, 10)} ${onTime ? '✅ on track' : '❌ will miss gate'}`);
    }
  }

  // Last 7 days history
  console.log(`\nDaily history (last 7 days):`);
  const last7 = dates.slice(-7);
  for (const d of last7) {
    const count = byDate.get(d) || 0;
    const bar = '█'.repeat(Math.min(count, 20));
    console.log(`  ${d}: ${bar} ${count}`);
  }
}

main();
