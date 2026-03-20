/**
 * ab-test-analyze.ts — A/B test analysis for SCS-001 video formats
 *
 * Analyzes performance data from assignments.jsonl to determine:
 * - Which template, hook formula, and music style performs best
 * - Statistical significance of differences
 * - Updated weights for the assignment engine
 *
 * Usage: npx tsx scripts/scs001/ab-test-analyze.ts [--update-weights]
 */

import * as fs from 'fs';
import * as path from 'path';

const CONFIG_PATH = path.join(__dirname, '../../workspace/ab-tests/config.json');
const ASSIGNMENTS_PATH = path.join(__dirname, '../../workspace/ab-tests/assignments.jsonl');
const REPORT_PATH = path.join(__dirname, '../../workspace/ab-tests/analysis-report.json');

interface Assignment {
  video_id: string;
  topic: string;
  timestamp: string;
  assignments: Record<string, string>;
  metrics: Record<string, number | null>;
}

interface VariantStats {
  variant: string;
  count: number;
  avg_views: number;
  avg_likes: number;
  avg_comments: number;
  total_views: number;
  performance_score: number;
}

interface DimensionAnalysis {
  dimension: string;
  total_with_data: number;
  variants: VariantStats[];
  winner: string | null;
  confidence: 'low' | 'medium' | 'high';
  recommended_weights: Record<string, number>;
}

function loadAssignments(): Assignment[] {
  if (!fs.existsSync(ASSIGNMENTS_PATH)) return [];
  return fs.readFileSync(ASSIGNMENTS_PATH, 'utf-8')
    .trim()
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l));
}

function analyzeDimension(dimension: string, assignments: Assignment[]): DimensionAnalysis {
  // Group by variant
  const groups: Record<string, Assignment[]> = {};
  for (const a of assignments) {
    const variant = a.assignments[dimension];
    if (!variant) continue;
    if (!groups[variant]) groups[variant] = [];
    groups[variant].push(a);
  }

  // Calculate stats per variant (only for assignments with metrics)
  const variantStats: VariantStats[] = [];
  for (const [variant, items] of Object.entries(groups)) {
    const withViews = items.filter(a => a.metrics.views !== null && a.metrics.views !== undefined);
    const views = withViews.map(a => a.metrics.views as number);
    const likes = withViews.filter(a => a.metrics.likes !== null).map(a => a.metrics.likes as number);
    const comments = withViews.filter(a => a.metrics.comments !== null).map(a => a.metrics.comments as number);

    const avgViews = views.length > 0 ? views.reduce((s, v) => s + v, 0) / views.length : 0;
    const avgLikes = likes.length > 0 ? likes.reduce((s, v) => s + v, 0) / likes.length : 0;
    const avgComments = comments.length > 0 ? comments.reduce((s, v) => s + v, 0) / comments.length : 0;

    // Performance score: weighted combination (views=60%, likes=25%, comments=15%)
    const score = avgViews * 0.6 + avgLikes * 10 * 0.25 + avgComments * 20 * 0.15;

    variantStats.push({
      variant,
      count: withViews.length,
      avg_views: Math.round(avgViews),
      avg_likes: Math.round(avgLikes * 10) / 10,
      avg_comments: Math.round(avgComments * 10) / 10,
      total_views: views.reduce((s, v) => s + v, 0),
      performance_score: Math.round(score * 100) / 100,
    });
  }

  variantStats.sort((a, b) => b.performance_score - a.performance_score);

  const totalWithData = variantStats.reduce((s, v) => s + v.count, 0);

  // Determine winner and confidence
  let winner: string | null = null;
  let confidence: 'low' | 'medium' | 'high' = 'low';

  if (variantStats.length >= 2 && totalWithData >= 10) {
    const top = variantStats[0];
    const second = variantStats[1];

    if (top.count >= 3 && second.count >= 3) {
      const ratio = second.performance_score > 0
        ? top.performance_score / second.performance_score
        : top.performance_score > 0 ? Infinity : 1;

      if (ratio >= 1.3 && totalWithData >= 30) {
        winner = top.variant;
        confidence = 'high';
      } else if (ratio >= 1.15 && totalWithData >= 20) {
        winner = top.variant;
        confidence = 'medium';
      } else if (ratio >= 1.05) {
        winner = top.variant;
        confidence = 'low';
      }
    }
  }

  // Calculate recommended weights
  const recommended: Record<string, number> = {};
  if (totalWithData >= 30 && winner) {
    // Boost winner, reduce losers
    const totalScore = variantStats.reduce((s, v) => s + Math.max(0.1, v.performance_score), 0);
    for (const v of variantStats) {
      recommended[v.variant] = Math.round((Math.max(0.1, v.performance_score) / totalScore) * 3 * 100) / 100;
    }
  } else {
    // Not enough data — keep equal weights
    for (const v of variantStats) {
      recommended[v.variant] = 1.0;
    }
  }

  return { dimension, total_with_data: totalWithData, variants: variantStats, winner, confidence, recommended_weights: recommended };
}

function main() {
  const args = process.argv.slice(2);
  const updateWeights = args.includes('--update-weights');

  console.log('=== SCS-001 A/B Test Analysis ===');
  console.log();

  const assignments = loadAssignments();
  console.log(`Total assignments: ${assignments.length}`);

  const withMetrics = assignments.filter(a => a.metrics.views !== null && a.metrics.views !== undefined);
  console.log(`With metrics data: ${withMetrics.length}`);

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const analyses: DimensionAnalysis[] = [];

  for (const dimension of Object.keys(config.dimensions)) {
    const analysis = analyzeDimension(dimension, assignments);
    analyses.push(analysis);

    console.log(`\n--- ${dimension} ---`);
    console.log(`  Data points: ${analysis.total_with_data}`);
    for (const v of analysis.variants) {
      const marker = v.variant === analysis.winner ? ' ** WINNER **' : '';
      console.log(`  ${v.variant}: ${v.count} posts, avg views=${v.avg_views}, score=${v.performance_score}${marker}`);
    }
    if (analysis.winner) {
      console.log(`  Winner: ${analysis.winner} (confidence: ${analysis.confidence})`);
    } else {
      console.log(`  No winner yet (need more data)`);
    }
  }

  // Save report
  const report = {
    analysis_date: new Date().toISOString(),
    total_assignments: assignments.length,
    total_with_metrics: withMetrics.length,
    min_posts_for_analysis: config.min_posts_for_analysis,
    dimensions: analyses,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(`\nReport saved: ${REPORT_PATH}`);

  // Update weights in config if requested
  if (updateWeights) {
    let updated = false;
    for (const analysis of analyses) {
      if (analysis.total_with_data >= config.min_posts_for_analysis) {
        const dim = config.dimensions[analysis.dimension];
        for (const v of dim.variants) {
          if (analysis.recommended_weights[v.id] !== undefined) {
            v.weight = analysis.recommended_weights[v.id];
            updated = true;
          }
        }
      }
    }

    if (updated) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
      console.log('\nWeights updated in config.json');
    } else {
      console.log('\nNot enough data to update weights yet');
    }
  }
}

main();
