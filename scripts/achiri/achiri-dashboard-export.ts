/**
 * achiri-dashboard-export.ts — Sprint 677
 * Unified dashboard-ready export combining:
 * - DAU, retention, user stats (from daily-counts.json)
 * - Topic analytics (from memory/*.jsonl)
 * - Waitlist/whitelist counts
 * - 7-day rolling averages for engagement trends
 *
 * Output: reports/achiri-dashboard.json
 * Usage: npx ts-node scripts/achiri/achiri-dashboard-export.ts
 */

import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const ACHIRI_DIR = join(ROOT, 'workspace', 'achiri');
const REPORTS_DIR = join(ROOT, 'reports');
const OUTPUT_PATH = join(REPORTS_DIR, 'achiri-dashboard.json');

// --- Helpers ---

function readLines(filePath: string): any[] {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function isRealUser(id: string): boolean {
  return !id.startsWith('e2e-') && !id.startsWith('validate-') &&
    !id.startsWith('smoke-test') && !id.startsWith('smoke_test') &&
    id !== 'anonymous' && !id.includes('limit') && !id.includes('bypass');
}

// --- Topic detection (from achiri-topic-analytics.ts) ---

const TOPIC_KEYWORDS: Record<string, string[]> = {
  education: ['study', 'school', 'university', 'exam', 'learn', 'course', 'homework',
    'étudier', 'école', 'université', 'na9ra', 'naqra', 'imti7an'],
  technology: ['code', 'programming', 'app', 'phone', 'computer', 'ai', 'tech',
    'informatique', 'ordinateur', 'internet'],
  health: ['health', 'exercise', 'sleep', 'stress', 'workout', 'diet',
    'santé', 'sport', 'sa7a', 'riyadha'],
  career: ['job', 'work', 'career', 'interview', 'salary', 'business',
    'travail', 'emploi', 'khedma'],
  relationships: ['friend', 'family', 'love', 'parent', 'brother', 'sister',
    'ami', 'famille', 'sa7bi', '3a2ila'],
  entertainment: ['movie', 'music', 'game', 'book', 'youtube', 'tiktok', 'netflix',
    'film', 'musique', 'jeu'],
  emotions: ['happy', 'sad', 'angry', 'anxious', 'bored', 'tired', 'worried',
    'triste', 'far7an', '7zin', 'za3lan'],
  culture: ['tunisia', 'tunis', 'arabic', 'darija', 'ramadan', 'tradition',
    'tunisie', 'tounes', 'couscous'],
  goals: ['goal', 'dream', 'plan', 'future', 'achieve', 'success',
    'objectif', 'rêve', 'hadaf', 'nja7'],
};

function detectTopics(text: string): string[] {
  const lc = text.toLowerCase();
  const found: string[] = [];
  for (const [topic, kws] of Object.entries(TOPIC_KEYWORDS)) {
    if (kws.some(kw => lc.includes(kw))) found.push(topic);
  }
  return found;
}

// --- Main export ---

function main(): void {
  console.log('=== Achiri Dashboard Export ===\n');

  // 1. Daily counts → DAU, retention, trends
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
    let dau = 0, msgs = 0, newUsers = 0;
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

  // 3. 7-day rolling averages
  const trends: Array<{ date: string; dau_7d: number; msgs_7d: number }> = [];
  for (let i = 0; i < dailyMetrics.length; i++) {
    const window = dailyMetrics.slice(Math.max(0, i - 6), i + 1);
    const dau7d = Math.round(window.reduce((s, d) => s + d.dau, 0) / window.length * 10) / 10;
    const msgs7d = Math.round(window.reduce((s, d) => s + d.msgs, 0) / window.length * 10) / 10;
    trends.push({ date: dailyMetrics[i].date, dau_7d: dau7d, msgs_7d: msgs7d });
  }

  // 4. Topic analytics from memory files
  const memDir = join(ACHIRI_DIR, 'memory');
  const topicCounts: Record<string, number> = {};
  let totalMsgsAnalyzed = 0;
  let uncategorized = 0;

  for (const t of Object.keys(TOPIC_KEYWORDS)) topicCounts[t] = 0;

  if (existsSync(memDir)) {
    const files = readdirSync(memDir).filter(f => f.endsWith('.jsonl'));
    for (const file of files) {
      try {
        const lines = readFileSync(join(memDir, file), 'utf-8').split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry.role === 'user' && entry.content) {
              totalMsgsAnalyzed++;
              const topics = detectTopics(entry.content);
              if (topics.length === 0) { uncategorized++; }
              else { for (const t of topics) topicCounts[t]++; }
            }
          } catch {}
        }
      } catch {}
    }
  }

  const topicResults = Object.entries(topicCounts)
    .map(([topic, count]) => ({
      topic,
      count,
      pct: totalMsgsAnalyzed > 0 ? Math.round((count / totalMsgsAnalyzed) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // 5. Waitlist + whitelist
  const waitlist = readLines(join(ACHIRI_DIR, 'waitlist.jsonl'));
  const whitelist = readLines(join(ACHIRI_DIR, 'alpha-whitelist.jsonl'));

  // 6. Sessions
  const sessionDir = join(ACHIRI_DIR, 'session-logs');
  let sessionCount = 0;
  if (existsSync(sessionDir)) {
    sessionCount = readdirSync(sessionDir).filter(f => f.endsWith('.json')).length;
  }

  // 7. Errors (7d)
  const errors = readLines(join(ACHIRI_DIR, 'error-log.jsonl'));
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const recentErrors = errors.filter((e: any) => (e.timestamp ?? '') >= weekAgo);

  const today = new Date().toISOString().slice(0, 10);

  const dashboard = {
    generated_at: new Date().toISOString(),
    version: '2.0',
    overview: {
      total_users: totalUsers,
      returning_users: returningUsers,
      retention_pct: retentionPct,
      total_sessions: sessionCount,
      waitlist_count: waitlist.length,
      invited_count: whitelist.length,
      errors_7d: recentErrors.length,
    },
    today: dailyMetrics.find(m => m.date === today) ?? { date: today, dau: 0, msgs: 0, new_users: 0 },
    daily: dailyMetrics,
    trends_7d: trends,
    topics: {
      total_analyzed: totalMsgsAnalyzed,
      uncategorized: uncategorized,
      distribution: topicResults,
    },
    top_users: Object.entries(userStats)
      .sort((a, b) => b[1].total_msgs - a[1].total_msgs)
      .slice(0, 10)
      .map(([uid, s]) => ({ user_id: uid, ...s })),
  };

  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(dashboard, null, 2));

  console.log(`Users: ${totalUsers} total | ${returningUsers} returning (${retentionPct}%)`);
  console.log(`Sessions: ${sessionCount}`);
  console.log(`Topics analyzed: ${totalMsgsAnalyzed} msgs`);
  console.log(`Top topics: ${topicResults.filter(t => t.count > 0).map(t => `${t.topic}(${t.count})`).join(', ') || 'none'}`);
  console.log(`Trends: ${trends.length} data points`);
  console.log(`Waitlist: ${waitlist.length} | Invited: ${whitelist.length}`);
  console.log(`\nDashboard: ${OUTPUT_PATH}`);
}

export { main as achiriDashboardExport };

main();
