// SCS-001 — Analytics Agent (Agent 9 — Feedback Loop)
// Consumes: PublishedVideo[] from Publishing Agent
// Produces: PerformanceSignal[] (per contracts/scs-001/publishing-analytics-v1.json)
// Engine: Deterministic — KPI aggregation + classification (no LLM)
// Sprint BUGFIX-ANALYTICS-01: Real KPIs from Browser Use scraper + manual-posts.jsonl
//   Falls back to mock profiles when no real data is available.

import { randomUUID } from 'crypto';
import type { PublishedVideo } from '../scs001-publishing/index';
import { lookupKPIs, getMetricsSummary } from '../../scripts/scs001/analytics-scraper';

export interface PerformanceKPIs {
  completion_rate:         number;
  avg_watch_time_seconds:  number;
  rewatch_rate:            number;
  comments:                number;
  shares:                  number;
  views:                   number;
  likes:                   number;
  followers_gained:        number;
}

export interface PerformanceSignal {
  signal_id:                string;
  video_id:                 string;
  platform:                 string;
  kpis:                     PerformanceKPIs;
  viral_status:             'viral' | 'performing' | 'underperforming' | 'failure';
  flywheel_triggered:       boolean;
  failure_library_entry:    boolean;
  topic_performance:        { topic_tags: string[]; topic_avg_completion: number };
  speaker_performance:      { speaker_name: string; speaker_avg_completion: number };
  posting_slot_performance: { slot: string; slot_avg_completion: number };
  hook_formula_performance: { formula: string; formula_avg_completion: number; uses_count: number };
  measured_at:              string;
}

// Classify completion rate → viral status
function classifyViralStatus(completionRate: number): PerformanceSignal['viral_status'] {
  if (completionRate >= 70) return 'viral';
  if (completionRate >= 40) return 'performing';
  if (completionRate >= 20) return 'underperforming';
  return 'failure';
}

// Mock KPI profiles — used ONLY as fallback when no real data is available
const MOCK_PROFILES = [
  { completion: 78, watch: 42, rewatch: 25, comments: 340, shares: 120, views: 85000, likes: 12000, followers: 450 },
  { completion: 55, watch: 28, rewatch: 12, comments: 85, shares: 30, views: 22000, likes: 3200, followers: 80 },
  { completion: 32, watch: 16, rewatch: 5, comments: 12, shares: 3, views: 4500, likes: 400, followers: 10 },
];

/**
 * Build KPIs for a video — real data first, mock fallback.
 * Priority:
 *   1. Scraped from TikTok Creator Center (Browser Use analytics scraper)
 *   2. Recorded via /record command in Telegram (has real views from manual log)
 *   3. Mock profile (rotating 3-profile fallback — no real data available)
 */
function buildKPIs(videoId: string, videoIndex: number): { kpis: PerformanceKPIs; source: string } {
  const real = lookupKPIs(videoId, videoIndex);

  if (real) {
    // Estimate rewatch_rate and followers_gained if not available from scraper
    const rewatch = real.completion_rate > 70 ? 20 : real.completion_rate > 40 ? 8 : 3;
    const followers = real.views > 50000 ? 300 : real.views > 10000 ? 60 : real.views > 1000 ? 10 : 2;
    return {
      kpis: {
        completion_rate:        real.completion_rate,
        avg_watch_time_seconds: real.avg_watch_time_seconds,
        rewatch_rate:           rewatch,
        comments:               real.comments,
        shares:                 real.shares,
        views:                  real.views,
        likes:                  real.likes,
        followers_gained:       followers,
      },
      source: real.source,
    };
  }

  // Fallback: mock profile
  const p = MOCK_PROFILES[videoIndex % MOCK_PROFILES.length];
  return {
    kpis: {
      completion_rate:        p.completion,
      avg_watch_time_seconds: p.watch,
      rewatch_rate:           p.rewatch,
      comments:               p.comments,
      shares:                 p.shares,
      views:                  p.views,
      likes:                  p.likes,
      followers_gained:       p.followers,
    },
    source: 'mock',
  };
}

export class AnalyticsAgent {
  run(publishedVideos: PublishedVideo[]): PerformanceSignal[] {
    console.log('[AnalyticsAgent] ' + publishedVideos.length + ' PublishedVideos in for analysis');

    if (publishedVideos.length === 0) {
      console.log('[AnalyticsAgent] No published videos — nothing to analyze');
      return [];
    }

    // Log metrics data availability
    const metricsSummary = getMetricsSummary();
    console.log(
      `[AnalyticsAgent] Metrics sources — scraped: ${metricsSummary.scraped}, ` +
      `manual_with_views: ${metricsSummary.manual_with_views}, ` +
      `latest_scrape: ${metricsSummary.latest_scrape ?? 'never'}`
    );

    const signals: PerformanceSignal[] = [];

    publishedVideos.forEach((pv, idx) => {
      const { kpis, source } = buildKPIs(pv.video_id, idx);
      const viralStatus = classifyViralStatus(kpis.completion_rate);
      const flywheelTriggered = kpis.completion_rate >= 70;
      const failureEntry = kpis.completion_rate < 40;

      const signal: PerformanceSignal = {
        signal_id:   'sig-' + randomUUID().substring(0, 8),
        video_id:    pv.video_id,
        platform:    pv.platform,
        kpis,
        viral_status: viralStatus,
        flywheel_triggered: flywheelTriggered,
        failure_library_entry: failureEntry,
        topic_performance: {
          topic_tags: pv.hashtags.slice(0, 3),
          topic_avg_completion: kpis.completion_rate,
        },
        speaker_performance: {
          speaker_name: pv.hashtags[0] ?? 'unknown',
          speaker_avg_completion: kpis.completion_rate,
        },
        posting_slot_performance: {
          slot: pv.posting_slot,
          slot_avg_completion: kpis.completion_rate,
        },
        hook_formula_performance: {
          formula: pv.hashtags[1] ?? 'unknown',
          formula_avg_completion: kpis.completion_rate,
          uses_count: 1,
        },
        measured_at: new Date().toISOString(),
      };

      signals.push(signal);

      const status = viralStatus.toUpperCase();
      const flywheel = flywheelTriggered ? ' [FLYWHEEL]' : '';
      const failure = failureEntry ? ' [FAILURE LIBRARY]' : '';
      const srcTag = source === 'mock' ? ' [MOCK]' : ` [${source.toUpperCase()}]`;
      console.log('[AnalyticsAgent] ' + pv.video_id + ' → ' + status +
        ' (' + kpis.completion_rate + '% completion, ' + kpis.views + ' views)' +
        flywheel + failure + srcTag);
    });

    // Summary
    const viralCount = signals.filter(s => s.viral_status === 'viral').length;
    const performingCount = signals.filter(s => s.viral_status === 'performing').length;
    const failCount = signals.filter(s => s.failure_library_entry).length;
    console.log('[AnalyticsAgent] Summary: ' + viralCount + ' viral, ' + performingCount +
      ' performing, ' + failCount + ' failure library entries');

    return signals;
  }
}
