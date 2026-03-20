/**
 * generate-stats-report.ts — Sprint 536
 * Generates posting analytics summary. Used by /stats Telegram command.
 *
 * Reports: videos produced (today/week/total), deliveries, topic distribution,
 * pipeline costs, run counts, diversity score.
 *
 * Usage: npx ts-node scripts/scs001/generate-stats-report.ts
 */

import { readFileSync, existsSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');

// Load .env
try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

interface StatsReport {
  timestamp: string;
  period: { today: string; week_start: string };
  production: {
    total_videos: number;
    videos_today: number;
    videos_this_week: number;
    pipeline_runs_total: number;
    pipeline_runs_today: number;
  };
  delivery: {
    auto_delivered_total: number;
    auto_delivered_today: number;
    telegram_sent_total: number;
  };
  costs: {
    total_usd: number;
    today_usd: number;
    avg_per_video_usd: number;
  };
  quality: {
    diversity_score: number;
    unique_topics: number;
    hook_types: number;
  };
  gate: {
    posts_target: number;
    posts_delivered: number;
    days_remaining: number;
    on_track: boolean;
  };
}

function readJsonLines(path: string): any[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8').trim().split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function weekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}

function main() {
  const todayStr = today();
  const weekStr = weekStart();

  // Pipeline metrics
  const metricsPath = join(ROOT, 'logs', 'pipeline-metrics', 'metrics.jsonl');
  const metrics = readJsonLines(metricsPath);
  const metricsToday = metrics.filter(m => (m.timestamp || '').startsWith(todayStr));
  const metricsWeek = metrics.filter(m => (m.timestamp || '') >= weekStr);

  const totalVideos = metrics.reduce((s: number, m: any) => s + (m.videos_produced || 0), 0);
  const todayVideos = metricsToday.reduce((s: number, m: any) => s + (m.videos_produced || 0), 0);
  const weekVideos = metricsWeek.reduce((s: number, m: any) => s + (m.videos_produced || 0), 0);
  const totalCost = metrics.reduce((s: number, m: any) => s + (m.total_cost_usd || 0), 0);
  const todayCost = metricsToday.reduce((s: number, m: any) => s + (m.total_cost_usd || 0), 0);

  // Delivery stats
  const deliveredPath = join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');
  const delivered = readJsonLines(deliveredPath);
  const deliveredToday = delivered.filter(d => (d.delivered_at || '').startsWith(todayStr));

  const telegramPath = join(ROOT, 'workspace', 'scs001', 'telegram-sent.jsonl');
  const telegramSent = readJsonLines(telegramPath);

  // Diversity (read cached report if available)
  let diversityScore = 0, uniqueTopics = 0, hookTypes = 0;
  const diversityPath = join(ROOT, 'reports', 'content-diversity-audit.json');
  if (existsSync(diversityPath)) {
    try {
      const div = JSON.parse(readFileSync(diversityPath, 'utf-8'));
      diversityScore = div.diversity_score || 0;
      uniqueTopics = div.unique_topics || 0;
      hookTypes = Object.keys(div.hook_types || {}).length;
    } catch {}
  }

  // Gate calculation (Apr 7 = 2026-04-07)
  const gateDate = new Date('2026-04-07');
  const daysRemaining = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86400000));
  const postsDelivered = delivered.length + telegramSent.length;

  const report: StatsReport = {
    timestamp: new Date().toISOString(),
    period: { today: todayStr, week_start: weekStr },
    production: {
      total_videos: totalVideos,
      videos_today: todayVideos,
      videos_this_week: weekVideos,
      pipeline_runs_total: metrics.length,
      pipeline_runs_today: metricsToday.length,
    },
    delivery: {
      auto_delivered_total: delivered.length,
      auto_delivered_today: deliveredToday.length,
      telegram_sent_total: telegramSent.length,
    },
    costs: {
      total_usd: Math.round(totalCost * 10000) / 10000,
      today_usd: Math.round(todayCost * 10000) / 10000,
      avg_per_video_usd: totalVideos > 0 ? Math.round((totalCost / totalVideos) * 10000) / 10000 : 0,
    },
    quality: {
      diversity_score: diversityScore,
      unique_topics: uniqueTopics,
      hook_types: hookTypes,
    },
    gate: {
      posts_target: 30,
      posts_delivered: postsDelivered,
      days_remaining: daysRemaining,
      on_track: postsDelivered >= 30,
    },
  };

  // Write report
  const reportPath = join(ROOT, 'reports', 'stats-latest.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Print summary
  console.log('=== Kognai Stats Report ===\n');
  console.log(`📊 Production: ${report.production.total_videos} total | ${report.production.videos_today} today | ${report.production.videos_this_week} this week`);
  console.log(`📬 Delivered: ${report.delivery.auto_delivered_total} auto + ${report.delivery.telegram_sent_total} manual = ${postsDelivered} total`);
  console.log(`💰 Cost: $${report.costs.total_usd} total | $${report.costs.today_usd} today | $${report.costs.avg_per_video_usd}/video`);
  console.log(`🎯 Quality: Diversity ${report.quality.diversity_score}/100 | ${report.quality.unique_topics} topics | ${report.quality.hook_types} hook types`);
  console.log(`🚪 Gate: ${postsDelivered}/${report.gate.posts_target} delivered | ${daysRemaining} days left | ${report.gate.on_track ? '✅ ON TRACK' : '⚠️ BEHIND'}`);
  console.log(`\nReport: reports/stats-latest.json`);

  return report;
}

// Export for Telegram command
export { main as generateStats, StatsReport };

main();
