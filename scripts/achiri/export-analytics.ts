/**
 * export-analytics.ts — Sprint 601
 * Exports Achiri conversation analytics as JSON for future web dashboard.
 * Reads: daily-counts.json, waitlist.jsonl, error-log.jsonl, session-logs/.
 *
 * Usage: npx ts-node scripts/achiri/export-analytics.ts
 * Output: reports/achiri-analytics.json
 */

import { readFileSync, existsSync, readdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const ACHIRI_DIR = join(ROOT, 'workspace', 'achiri');
const REPORT_PATH = join(ROOT, 'reports', 'achiri-analytics.json');

function readLines(filePath: string): any[] {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

// Filter test/validation users
function isRealUser(id: string): boolean {
  return !id.startsWith('e2e-') && !id.startsWith('validate-') &&
    !id.startsWith('smoke-test') && !id.startsWith('smoke_test') &&
    id !== 'anonymous' && !id.includes('limit') && !id.includes('bypass');
}

function main(): void {
  console.log('=== Achiri Analytics Export ===\n');

  // 1. Daily counts
  const countsPath = join(ACHIRI_DIR, 'daily-counts.json');
  let dailyCounts: Record<string, Record<string, number>> = {};
  if (existsSync(countsPath)) {
    try { dailyCounts = JSON.parse(readFileSync(countsPath, 'utf-8')); } catch {}
  }

  const allDays = Object.keys(dailyCounts).sort();
  const userStats: Record<string, { total_msgs: number; days_active: number; first_seen: string; last_seen: string }> = {};
  const dailyMetrics: Array<{ date: string; dau: number; msgs: number; new_users: number }> = [];
  const knownUsers = new Set<string>();

  for (const day of allDays) {
    let dau = 0;
    let msgs = 0;
    let newUsers = 0;

    for (const [uid, count] of Object.entries(dailyCounts[day])) {
      if (!isRealUser(uid)) continue;
      dau++;
      msgs += count;

      if (!userStats[uid]) {
        userStats[uid] = { total_msgs: 0, days_active: 0, first_seen: day, last_seen: day };
        newUsers++;
        knownUsers.add(uid);
      }
      userStats[uid].total_msgs += count;
      userStats[uid].days_active++;
      userStats[uid].last_seen = day;
    }

    dailyMetrics.push({ date: day, dau, msgs, new_users: newUsers });
  }

  // 2. Retention
  const totalUsers = Object.keys(userStats).length;
  const returningUsers = Object.values(userStats).filter(u => u.days_active >= 2).length;
  const retentionPct = totalUsers > 0 ? Math.round((returningUsers / totalUsers) * 100) : 0;

  // 3. Waitlist
  const waitlist = readLines(join(ACHIRI_DIR, 'waitlist.jsonl'));
  const whitelistPath = join(ACHIRI_DIR, 'alpha-whitelist.jsonl');
  const whitelist = readLines(whitelistPath);

  // 4. Errors (last 7 days)
  const errorPath = join(ACHIRI_DIR, 'error-log.jsonl');
  const errors = readLines(errorPath);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const recentErrors = errors.filter((e: any) => (e.timestamp ?? '') >= weekAgo);

  // 5. Session count
  const sessionDir = join(ACHIRI_DIR, 'session-logs');
  let sessionCount = 0;
  if (existsSync(sessionDir)) {
    sessionCount = readdirSync(sessionDir).filter(f => f.endsWith('.json')).length;
  }

  // 6. Today's metrics
  const today = new Date().toISOString().slice(0, 10);
  const todayMetrics = dailyMetrics.find(m => m.date === today) ?? { date: today, dau: 0, msgs: 0, new_users: 0 };

  const analytics = {
    generated_at: new Date().toISOString(),
    overview: {
      total_users: totalUsers,
      returning_users: returningUsers,
      retention_pct: retentionPct,
      total_sessions: sessionCount,
      waitlist_count: waitlist.length,
      invited_count: whitelist.length,
      errors_7d: recentErrors.length,
    },
    today: todayMetrics,
    daily: dailyMetrics,
    top_users: Object.entries(userStats)
      .sort((a, b) => b[1].total_msgs - a[1].total_msgs)
      .slice(0, 10)
      .map(([uid, s]) => ({ user_id: uid, ...s })),
    recent_errors: recentErrors.slice(-5).map((e: any) => ({
      timestamp: e.timestamp,
      type: e.type ?? 'unknown',
      message: (e.message ?? e.error ?? '').slice(0, 100),
    })),
  };

  writeFileSync(REPORT_PATH, JSON.stringify(analytics, null, 2));

  console.log(`Users: ${totalUsers} total | ${returningUsers} returning (${retentionPct}%)`);
  console.log(`Today: ${todayMetrics.dau} DAU | ${todayMetrics.msgs} msgs`);
  console.log(`Sessions: ${sessionCount}`);
  console.log(`Waitlist: ${waitlist.length} | Invited: ${whitelist.length}`);
  console.log(`Errors (7d): ${recentErrors.length}`);
  console.log(`Days tracked: ${allDays.length}`);
  console.log(`\nReport: ${REPORT_PATH}`);
}

export { main as exportAchiriAnalytics };

main();
