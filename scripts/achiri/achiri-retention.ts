// Sprint 316 — achiri-retention.ts
// Analyzes workspace/achiri/daily-counts.json to compute retention metrics.
// Filters out test/validation userIds (e2e-*, smoke-test, validate-*).
// Outputs human-readable report or JSON (--json flag).
// Run: npx ts-node scripts/achiri/achiri-retention.ts [--json]

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const COUNTS_PATH = join(process.cwd(), 'workspace', 'achiri', 'daily-counts.json');

function isRealUser(userId: string): boolean {
  if (userId.startsWith('e2e-')) return false;
  if (userId.startsWith('validate-')) return false;
  if (userId.startsWith('smoke-test')) return false;
  if (userId === 'anonymous') return false;
  return true;
}

interface RetentionReport {
  generated_at: string;
  total_days: number;
  total_real_users: number;
  total_real_messages: number;
  dau_trend: Array<{ date: string; users: number; messages: number }>;
  returning_users: number;
  new_only_users: number;
  retention_rate_pct: number;
  top_users: Array<{ userId: string; total_messages: number; active_days: number; first_seen: string; last_seen: string }>;
  churned_users: Array<{ userId: string; last_seen: string; days_inactive: number }>;
  avg_messages_per_user: number;
  avg_messages_per_day: number;
}

function analyze(): RetentionReport {
  if (!existsSync(COUNTS_PATH)) {
    return {
      generated_at: new Date().toISOString(),
      total_days: 0, total_real_users: 0, total_real_messages: 0,
      dau_trend: [], returning_users: 0, new_only_users: 0,
      retention_rate_pct: 0, top_users: [], churned_users: [],
      avg_messages_per_user: 0, avg_messages_per_day: 0,
    };
  }

  const raw = JSON.parse(readFileSync(COUNTS_PATH, 'utf-8')) as Record<string, Record<string, number>>;
  const days = Object.keys(raw).sort();

  // Per-user aggregate
  const userStats = new Map<string, { total: number; days: string[] }>();

  for (const day of days) {
    for (const [userId, count] of Object.entries(raw[day])) {
      if (!isRealUser(userId)) continue;
      if (!userStats.has(userId)) userStats.set(userId, { total: 0, days: [] });
      const u = userStats.get(userId)!;
      u.total += count;
      u.days.push(day);
    }
  }

  // DAU trend (real users only)
  const dauTrend = days.map(day => {
    const realEntries = Object.entries(raw[day]).filter(([uid]) => isRealUser(uid));
    return {
      date: day,
      users: realEntries.length,
      messages: realEntries.reduce((sum, [, c]) => sum + c, 0),
    };
  });

  // Returning = appeared on 2+ different days
  const allUsers = Array.from(userStats.entries());
  const returningUsers = allUsers.filter(([, s]) => s.days.length >= 2).length;
  const newOnlyUsers = allUsers.filter(([, s]) => s.days.length === 1).length;
  const totalRealUsers = allUsers.length;
  const retentionRate = totalRealUsers > 0 ? Math.round((returningUsers / totalRealUsers) * 100) : 0;

  // Top users by engagement
  const topUsers = allUsers
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([userId, s]) => ({
      userId,
      total_messages: s.total,
      active_days: s.days.length,
      first_seen: s.days[0],
      last_seen: s.days[s.days.length - 1],
    }));

  // Churn detection: users not seen in last 3 days
  const today = new Date();
  const threeDaysAgo = new Date(today.getTime() - 3 * 86400000).toISOString().slice(0, 10);
  const churnedUsers = allUsers
    .filter(([, s]) => s.days[s.days.length - 1] < threeDaysAgo)
    .map(([userId, s]) => {
      const lastSeen = s.days[s.days.length - 1];
      const daysInactive = Math.round((today.getTime() - new Date(lastSeen).getTime()) / 86400000);
      return { userId, last_seen: lastSeen, days_inactive: daysInactive };
    })
    .sort((a, b) => b.days_inactive - a.days_inactive);

  const totalMsgs = allUsers.reduce((sum, [, s]) => sum + s.total, 0);

  return {
    generated_at: new Date().toISOString(),
    total_days: days.length,
    total_real_users: totalRealUsers,
    total_real_messages: totalMsgs,
    dau_trend: dauTrend,
    returning_users: returningUsers,
    new_only_users: newOnlyUsers,
    retention_rate_pct: retentionRate,
    top_users: topUsers,
    churned_users: churnedUsers,
    avg_messages_per_user: totalRealUsers > 0 ? Math.round(totalMsgs / totalRealUsers) : 0,
    avg_messages_per_day: days.length > 0 ? Math.round(totalMsgs / days.length) : 0,
  };
}

function printReport(r: RetentionReport): void {
  console.log('══════════════════════════════════════════════════════');
  console.log('  ACHIRI RETENTION REPORT');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Period: ${r.total_days} day(s) | ${r.total_real_users} users | ${r.total_real_messages} messages`);
  console.log(`  Retention: ${r.retention_rate_pct}% (${r.returning_users} returning / ${r.new_only_users} new-only)`);
  console.log(`  Avg: ${r.avg_messages_per_user} msgs/user, ${r.avg_messages_per_day} msgs/day`);
  console.log('──────────────────────────────────────────────────────');

  if (r.dau_trend.length > 0) {
    console.log('\n  📊 DAU Trend');
    for (const d of r.dau_trend) {
      const bar = '█'.repeat(Math.min(d.users, 30));
      console.log(`     ${d.date}: ${d.users} user(s), ${d.messages} msg(s) ${bar}`);
    }
  }

  if (r.top_users.length > 0) {
    console.log('\n  🏆 Top Users');
    for (const u of r.top_users) {
      console.log(`     ${u.userId}: ${u.total_messages} msgs over ${u.active_days} day(s) [${u.first_seen} → ${u.last_seen}]`);
    }
  }

  if (r.churned_users.length > 0) {
    console.log('\n  ⚠️  Churned (inactive 3+ days)');
    for (const u of r.churned_users.slice(0, 5)) {
      console.log(`     ${u.userId}: last seen ${u.last_seen} (${u.days_inactive}d ago)`);
    }
  } else {
    console.log('\n  ✅ No churned users');
  }

  console.log('\n──────────────────────────────────────────────────────');
}

// Main
const report = analyze();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}
