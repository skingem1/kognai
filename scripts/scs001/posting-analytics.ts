/**
 * SCS-001 Posting Analytics — April 7 Gate Tracker
 *
 * Analyzes manual-posts.jsonl for gate progress tracking:
 *   - Daily posting cadence + streak
 *   - View velocity (views/day, views/post)
 *   - Best-performing content (speaker, hook formula)
 *   - Gate projection: will we hit 30 posts + 500 views by April 7?
 *   - Actionable recommendations
 *
 * Works even with 0 posts (shows what's needed to start).
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ── Types ─────────────────────────────────────────────

export interface PostEntry {
  video_id: string;
  views?: number;
  title?: string;
  posted_at?: string;
  speaker?: string;
  hook_formula?: string;
}

export interface DailyStats {
  date: string;
  posts: number;
  views: number;
}

export interface GateProjection {
  posts_current: number;
  posts_target: number;
  posts_remaining: number;
  views_current: number;
  views_target: number;
  views_remaining: number;
  days_remaining: number;
  posts_per_day_needed: number;
  views_per_day_needed: number;
  on_track_posts: boolean;
  on_track_views: boolean;
  projection_posts: number; // projected total by gate date
  projection_views: number;
}

export interface Analytics {
  total_posts: number;
  total_views: number;
  avg_views_per_post: number;
  best_post: PostEntry | null;
  worst_post: PostEntry | null;
  daily_stats: DailyStats[];
  posting_streak: number; // consecutive days with at least 1 post
  gate_projection: GateProjection;
  top_speakers: Array<{ speaker: string; posts: number; avg_views: number }>;
  top_formulas: Array<{ formula: string; posts: number; avg_views: number }>;
}

// ── Config ─────────────────────────────────────────────

const ROOT = join(__dirname, "..", "..");
const MANUAL_POSTS_PATH = join(ROOT, "workspace", "scs001", "manual-posts.jsonl");
const GATE_DATE = new Date("2026-04-07T00:00:00Z");
const POSTS_TARGET = 30;
const VIEWS_TARGET = 500;

// ── Data Loading ──────────────────────────────────────

function loadPosts(): PostEntry[] {
  if (!existsSync(MANUAL_POSTS_PATH)) return [];
  const entries: PostEntry[] = [];
  try {
    for (const line of readFileSync(MANUAL_POSTS_PATH, "utf-8").split("\n")) {
      if (!line.trim()) continue;
      try { entries.push(JSON.parse(line)); } catch { /* skip */ }
    }
  } catch { /* file error */ }
  return entries;
}

// ── Analytics Engine ──────────────────────────────────

export function computeAnalytics(): Analytics {
  const posts = loadPosts();
  const now = new Date();
  const daysRemaining = Math.max(0, Math.ceil((GATE_DATE.getTime() - now.getTime()) / 86_400_000));

  // Basic stats
  const totalPosts = posts.length;
  const totalViews = posts.reduce((sum, p) => sum + (p.views ?? 0), 0);
  const avgViews = totalPosts > 0 ? Math.round(totalViews / totalPosts) : 0;

  // Best/worst posts
  const sortedByViews = [...posts].filter((p) => p.views != null).sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  const bestPost = sortedByViews[0] ?? null;
  const worstPost = sortedByViews.length > 1 ? sortedByViews[sortedByViews.length - 1] : null;

  // Daily stats
  const dailyMap = new Map<string, { posts: number; views: number }>();
  for (const post of posts) {
    const date = post.posted_at ? post.posted_at.slice(0, 10) : "unknown";
    if (!dailyMap.has(date)) dailyMap.set(date, { posts: 0, views: 0 });
    const day = dailyMap.get(date)!;
    day.posts++;
    day.views += post.views ?? 0;
  }
  const dailyStats = [...dailyMap.entries()]
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Posting streak (consecutive days ending today)
  let streak = 0;
  const today = now.toISOString().slice(0, 10);
  let checkDate = new Date(now);
  while (true) {
    const dateStr = checkDate.toISOString().slice(0, 10);
    if (dailyMap.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // Gate projection
  const postsRemaining = Math.max(0, POSTS_TARGET - totalPosts);
  const viewsRemaining = Math.max(0, VIEWS_TARGET - totalViews);
  const postsPerDayNeeded = daysRemaining > 0 ? postsRemaining / daysRemaining : postsRemaining;
  const viewsPerDayNeeded = daysRemaining > 0 ? viewsRemaining / daysRemaining : viewsRemaining;

  // Project current velocity
  const activeDays = dailyStats.length || 1;
  const postsPerDay = totalPosts / activeDays;
  const viewsPerDay = totalViews / activeDays;
  const projectionPosts = Math.round(totalPosts + postsPerDay * daysRemaining);
  const projectionViews = Math.round(totalViews + viewsPerDay * daysRemaining);

  const gateProjection: GateProjection = {
    posts_current: totalPosts,
    posts_target: POSTS_TARGET,
    posts_remaining: postsRemaining,
    views_current: totalViews,
    views_target: VIEWS_TARGET,
    views_remaining: viewsRemaining,
    days_remaining: daysRemaining,
    posts_per_day_needed: Math.round(postsPerDayNeeded * 10) / 10,
    views_per_day_needed: Math.round(viewsPerDayNeeded * 10) / 10,
    on_track_posts: projectionPosts >= POSTS_TARGET,
    on_track_views: projectionViews >= VIEWS_TARGET,
    projection_posts: projectionPosts,
    projection_views: projectionViews,
  };

  // Top speakers
  const speakerMap = new Map<string, { posts: number; views: number }>();
  for (const post of posts) {
    const s = post.speaker ?? "unknown";
    if (!speakerMap.has(s)) speakerMap.set(s, { posts: 0, views: 0 });
    const entry = speakerMap.get(s)!;
    entry.posts++;
    entry.views += post.views ?? 0;
  }
  const topSpeakers = [...speakerMap.entries()]
    .map(([speaker, stats]) => ({ speaker, posts: stats.posts, avg_views: stats.posts > 0 ? Math.round(stats.views / stats.posts) : 0 }))
    .sort((a, b) => b.avg_views - a.avg_views)
    .slice(0, 5);

  // Top formulas
  const formulaMap = new Map<string, { posts: number; views: number }>();
  for (const post of posts) {
    const f = post.hook_formula ?? "unknown";
    if (!formulaMap.has(f)) formulaMap.set(f, { posts: 0, views: 0 });
    const entry = formulaMap.get(f)!;
    entry.posts++;
    entry.views += post.views ?? 0;
  }
  const topFormulas = [...formulaMap.entries()]
    .map(([formula, stats]) => ({ formula, posts: stats.posts, avg_views: stats.posts > 0 ? Math.round(stats.views / stats.posts) : 0 }))
    .sort((a, b) => b.avg_views - a.avg_views)
    .slice(0, 5);

  return {
    total_posts: totalPosts,
    total_views: totalViews,
    avg_views_per_post: avgViews,
    best_post: bestPost,
    worst_post: worstPost,
    daily_stats: dailyStats,
    posting_streak: streak,
    gate_projection: gateProjection,
    top_speakers: topSpeakers,
    top_formulas: topFormulas,
  };
}

// ── Formatting ────────────────────────────────────────

export function formatGateAnalytics(): string {
  const a = computeAnalytics();
  const g = a.gate_projection;

  const lines: string[] = [
    "📊 *April 7 Gate Analytics*",
    "",
  ];

  // Gate progress bars
  const postBar = makeProgressBar(g.posts_current, g.posts_target);
  const viewBar = makeProgressBar(g.views_current, g.views_target);
  lines.push(`📮 Posts: ${postBar} ${g.posts_current}/${g.posts_target}`);
  lines.push(`👁 Views: ${viewBar} ${g.views_current}/${g.views_target}`);
  lines.push(`📅 Days left: ${g.days_remaining}`);
  lines.push("");

  // Velocity
  if (a.total_posts > 0) {
    lines.push("*Velocity:*");
    lines.push(`  Posts/day needed: ${g.posts_per_day_needed}`);
    lines.push(`  Views/day needed: ${g.views_per_day_needed}`);
    lines.push(`  Avg views/post: ${a.avg_views_per_post}`);
    lines.push(`  Streak: ${a.posting_streak} days`);
    lines.push("");

    // Projection
    const postEmoji = g.on_track_posts ? "✅" : "⚠️";
    const viewEmoji = g.on_track_views ? "✅" : "⚠️";
    lines.push("*Projection (at current pace):*");
    lines.push(`  ${postEmoji} Posts: ~${g.projection_posts} by Apr 7`);
    lines.push(`  ${viewEmoji} Views: ~${g.projection_views} by Apr 7`);

    if (a.top_speakers.length > 0) {
      lines.push("");
      lines.push("*Top Speakers:*");
      for (const s of a.top_speakers.slice(0, 3)) {
        lines.push(`  ${s.speaker}: ${s.posts} posts, ~${s.avg_views} views/post`);
      }
    }
  } else {
    lines.push("⚠️ *No posts yet.* Start posting to track analytics.");
    lines.push("");
    lines.push("*To start:*");
    lines.push("1. /postnow — get best video to post");
    lines.push("2. Post to TikTok manually");
    lines.push(`3. /record <video_id> 0 — log it`);
    lines.push(`4. Need ${g.posts_per_day_needed} posts/day for gate`);
  }

  return lines.join("\n");
}

function makeProgressBar(current: number, target: number): string {
  const pct = target > 0 ? Math.min(1, current / target) : 0;
  const filled = Math.round(pct * 10);
  const empty = 10 - filled;
  return "▓".repeat(filled) + "░".repeat(empty) + ` ${Math.round(pct * 100)}%`;
}
