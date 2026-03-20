/**
 * analytics-aggregator — T2 Content Skill stub
 * Aggregates post performance metrics across platforms.
 */
import * as fs from 'fs';
import * as path from 'path';

const METRICS_PATH = path.join(__dirname, '../../workspace/analytics/post-metrics.json');
const AB_ASSIGNMENTS_PATH = path.join(__dirname, '../../workspace/ab-tests/assignments.jsonl');

interface PostMetric {
  video_id: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares?: number;
  niche?: string;
  date?: string;
}

function loadMetrics(): PostMetric[] {
  if (!fs.existsSync(METRICS_PATH)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(METRICS_PATH, 'utf-8'));
    return Array.isArray(data) ? data : data.posts || [];
  } catch { return []; }
}

function main() {
  const args = process.argv.slice(2);
  const metrics = loadMetrics();

  console.log('=== Analytics Aggregator ===\n');
  console.log(`  Total posts tracked: ${metrics.length}`);

  if (metrics.length === 0) {
    console.log('  No metrics data yet. Use /log command to record post performance.');
    return;
  }

  const totalViews = metrics.reduce((s, m) => s + (m.views || 0), 0);
  const totalLikes = metrics.reduce((s, m) => s + (m.likes || 0), 0);
  const avgViews = Math.round(totalViews / metrics.length);

  console.log(`  Total views: ${totalViews}`);
  console.log(`  Total likes: ${totalLikes}`);
  console.log(`  Avg views/post: ${avgViews}`);

  // Best niche
  if (args.includes('--best-niche')) {
    const nicheStats: Record<string, { views: number; count: number }> = {};
    for (const m of metrics) {
      const niche = m.niche || 'unknown';
      if (!nicheStats[niche]) nicheStats[niche] = { views: 0, count: 0 };
      nicheStats[niche].views += m.views || 0;
      nicheStats[niche].count++;
    }

    console.log('\n  Niche Performance:');
    const sorted = Object.entries(nicheStats).sort((a, b) => (b[1].views / b[1].count) - (a[1].views / a[1].count));
    for (const [niche, stats] of sorted) {
      console.log(`    ${niche}: ${Math.round(stats.views / stats.count)} avg views (${stats.count} posts)`);
    }
  }

  // Top posts
  const topPosts = [...metrics].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
  console.log('\n  Top 5 Posts:');
  for (const p of topPosts) {
    console.log(`    ${p.video_id}: ${p.views} views, ${p.likes} likes (${p.niche || '?'})`);
  }
}

main();
