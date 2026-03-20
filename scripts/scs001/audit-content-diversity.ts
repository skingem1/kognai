/**
 * audit-content-diversity.ts — Sprint 533
 * Analyzes content diversity across all pipeline runs.
 * Reports: unique topics, speakers, hook formulas, and dedup status.
 *
 * Usage: npx ts-node scripts/scs001/audit-content-diversity.ts
 */

import { readdirSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');

// Load .env
try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

// ── Read all SRT files for hook/content analysis ─────

interface VideoInfo {
  videoId: string;
  runId: string;
  srtContent: string;
  hookLine: string;
  captionFile: string;
}

function scanVideos(): VideoInfo[] {
  const runsDir = join(ROOT, 'workspace', 'scs001');
  const videos: VideoInfo[] = [];

  const runDirs = readdirSync(runsDir).filter(d => d.startsWith('run-'));
  for (const runDir of runDirs) {
    const captionDir = join(runsDir, runDir, 'caption');
    if (!existsSync(captionDir)) continue;

    const srtFiles = readdirSync(captionDir).filter(f => f.endsWith('.srt'));
    for (const srt of srtFiles) {
      const videoId = srt.replace('.srt', '');
      const content = readFileSync(join(captionDir, srt), 'utf-8');
      const lines = content.split('\n').filter(l => l.trim() && !/^\d+$/.test(l.trim()) && !l.includes('-->'));
      const hookLine = lines[0] || '';

      videos.push({
        videoId,
        runId: runDir,
        srtContent: content,
        hookLine,
        captionFile: join(captionDir, srt),
      });
    }
  }
  return videos;
}

// ── Read trend data for topic analysis ───────────────

interface TopicInfo {
  topicId: string;
  topicName: string;
  speaker: string;
}

function scanTopics(): TopicInfo[] {
  const trendDir = join(ROOT, 'workspace', 'scs001', 'trend-outputs');
  if (!existsSync(trendDir)) return [];

  const topics: TopicInfo[] = [];
  const files = readdirSync(trendDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(trendDir, file), 'utf-8'));
      const topicList = data.topics || [];
      for (const t of topicList) {
        topics.push({
          topicId: t.topic_id || 'unknown',
          topicName: t.topic_name || t.title || 'unknown',
          speaker: t.speaker || t.keyword_cluster?.[0] || 'unknown',
        });
      }
    } catch {}
  }
  return topics;
}

// ── Analyze hooks ────────────────────────────────────

function classifyHook(hook: string): string {
  const h = hook.toLowerCase();
  if (h.includes('what if')) return 'what-if';
  if (h.includes('did you know')) return 'did-you-know';
  if (h.includes('nobody')) return 'nobody-talking';
  if (h.includes('changed everything')) return 'changed-everything';
  if (h.includes('broke') || h.includes('breaking')) return 'breaking';
  if (h.includes('wrong about')) return 'everyone-wrong';
  if (h.includes('3... 2... 1') || h.includes('countdown')) return 'countdown';
  if (h.includes('secret') || h.includes('truth')) return 'secret-truth';
  return 'other';
}

// ── Main ─────────────────────────────────────────────

function main() {
  console.log('=== Content Diversity Audit ===\n');

  // Videos
  const videos = scanVideos();
  console.log(`Total videos with SRT: ${videos.length}`);

  // Hook analysis
  const hookTypes = new Map<string, number>();
  const uniqueHooks = new Set<string>();
  for (const v of videos) {
    const type = classifyHook(v.hookLine);
    hookTypes.set(type, (hookTypes.get(type) || 0) + 1);
    uniqueHooks.add(v.hookLine.substring(0, 50));
  }
  console.log(`\nHook Formulas (${hookTypes.size} types):`);
  for (const [type, count] of [...hookTypes.entries()].sort((a, b) => b[1] - a[1])) {
    const pct = ((count / videos.length) * 100).toFixed(0);
    console.log(`  ${type}: ${count} (${pct}%)`);
  }
  console.log(`Unique hook openings (first 50 chars): ${uniqueHooks.size}`);

  // Topics
  const topics = scanTopics();
  console.log(`\nTrend Topics: ${topics.length}`);
  const topicNames = new Set(topics.map(t => t.topicName));
  console.log(`Unique topic names: ${topicNames.size}`);
  if (topicNames.size > 0) {
    console.log('Topics:');
    for (const name of [...topicNames].slice(0, 15)) {
      console.log(`  - ${name.substring(0, 80)}`);
    }
  }

  // Runs
  const runIds = new Set(videos.map(v => v.runId));
  console.log(`\nPipeline Runs: ${runIds.size}`);
  console.log(`Avg videos per run: ${(videos.length / runIds.size).toFixed(1)}`);

  // Delivery stats
  const deliveredPath = join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');
  let deliveredCount = 0;
  if (existsSync(deliveredPath)) {
    deliveredCount = readFileSync(deliveredPath, 'utf-8').trim().split('\n').filter(Boolean).length;
  }
  const telegramSentPath = join(ROOT, 'workspace', 'scs001', 'telegram-sent.jsonl');
  let telegramCount = 0;
  if (existsSync(telegramSentPath)) {
    telegramCount = readFileSync(telegramSentPath, 'utf-8').trim().split('\n').filter(Boolean).length;
  }
  console.log(`\nDelivery Stats:`);
  console.log(`  Auto-delivered: ${deliveredCount}`);
  console.log(`  Telegram-sent: ${telegramCount}`);
  console.log(`  Total produced: ${videos.length}`);

  // Diversity score
  const diversityScore = Math.min(100, Math.round(
    (uniqueHooks.size / Math.max(videos.length, 1)) * 50 +
    (topicNames.size / Math.max(15, 1)) * 50
  ));
  console.log(`\nDiversity Score: ${diversityScore}/100`);

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    total_videos: videos.length,
    unique_hooks: uniqueHooks.size,
    hook_types: Object.fromEntries(hookTypes),
    unique_topics: topicNames.size,
    topics: [...topicNames],
    pipeline_runs: runIds.size,
    deliveries: { auto: deliveredCount, telegram: telegramCount },
    diversity_score: diversityScore,
  };
  const reportPath = join(ROOT, 'reports', 'content-diversity-audit.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved: reports/content-diversity-audit.json`);
}

main();
