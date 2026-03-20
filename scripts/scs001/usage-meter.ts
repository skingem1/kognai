// SCS-001 — Usage Metering (Sprint 485)
// Tracks per-subscriber: videos generated, API costs, posting frequency.
// Store: workspace/billing/usage.json
// Called by pipeline after video production + by billing checks.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const USAGE_PATH = join(ROOT, 'workspace', 'billing', 'usage.json');

export interface SubscriberUsage {
  subscriber_id: string;
  email?: string;
  tier: 'free' | 'growth' | 'premium';
  stripe_customer_id?: string;
  videos_generated: number;
  videos_posted: number;
  api_cost_usd: number;
  last_video_at?: string;
  last_post_at?: string;
  created_at: string;
  monthly_usage: Record<string, { videos: number; cost_usd: number; posts: number }>;
}

export interface UsageStore {
  updated_at: string;
  subscribers: SubscriberUsage[];
  totals: {
    total_videos: number;
    total_posts: number;
    total_cost_usd: number;
    active_subscribers: number;
  };
}

function loadStore(): UsageStore {
  if (!existsSync(USAGE_PATH)) {
    return {
      updated_at: new Date().toISOString(),
      subscribers: [],
      totals: { total_videos: 0, total_posts: 0, total_cost_usd: 0, active_subscribers: 0 },
    };
  }
  try {
    return JSON.parse(readFileSync(USAGE_PATH, 'utf8'));
  } catch {
    return {
      updated_at: new Date().toISOString(),
      subscribers: [],
      totals: { total_videos: 0, total_posts: 0, total_cost_usd: 0, active_subscribers: 0 },
    };
  }
}

function saveStore(store: UsageStore): void {
  store.updated_at = new Date().toISOString();
  refreshTotals(store);
  const dir = join(ROOT, 'workspace', 'billing');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(USAGE_PATH, JSON.stringify(store, null, 2));
}

function refreshTotals(store: UsageStore): void {
  let totalVids = 0, totalPosts = 0, totalCost = 0;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  let active = 0;

  for (const sub of store.subscribers) {
    totalVids += sub.videos_generated;
    totalPosts += sub.videos_posted;
    totalCost += sub.api_cost_usd;
    if (sub.last_video_at && new Date(sub.last_video_at) > thirtyDaysAgo) active++;
  }

  store.totals = {
    total_videos: totalVids,
    total_posts: totalPosts,
    total_cost_usd: Math.round(totalCost * 100) / 100,
    active_subscribers: active,
  };
}

function getMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function findOrCreate(store: UsageStore, subscriberId: string, tier: SubscriberUsage['tier'] = 'free'): SubscriberUsage {
  let sub = store.subscribers.find(s => s.subscriber_id === subscriberId);
  if (!sub) {
    sub = {
      subscriber_id: subscriberId,
      tier,
      videos_generated: 0,
      videos_posted: 0,
      api_cost_usd: 0,
      created_at: new Date().toISOString(),
      monthly_usage: {},
    };
    store.subscribers.push(sub);
  }
  return sub;
}

/** Record a video generation for a subscriber */
export function recordVideoGenerated(subscriberId: string, costUsd: number = 0, tier?: SubscriberUsage['tier']): void {
  const store = loadStore();
  const sub = findOrCreate(store, subscriberId, tier);
  sub.videos_generated++;
  sub.api_cost_usd += costUsd;
  sub.last_video_at = new Date().toISOString();

  const month = getMonthKey();
  if (!sub.monthly_usage[month]) sub.monthly_usage[month] = { videos: 0, cost_usd: 0, posts: 0 };
  sub.monthly_usage[month].videos++;
  sub.monthly_usage[month].cost_usd += costUsd;

  saveStore(store);
}

/** Record a post for a subscriber */
export function recordPost(subscriberId: string): void {
  const store = loadStore();
  const sub = findOrCreate(store, subscriberId);
  sub.videos_posted++;
  sub.last_post_at = new Date().toISOString();

  const month = getMonthKey();
  if (!sub.monthly_usage[month]) sub.monthly_usage[month] = { videos: 0, cost_usd: 0, posts: 0 };
  sub.monthly_usage[month].posts++;

  saveStore(store);
}

/** Get usage summary for Telegram display */
export function getUsageSummary(): string {
  const store = loadStore();
  const lines: string[] = ['💰 *Usage Metering*\n'];

  lines.push(`📊 Total: ${store.totals.total_videos} videos | ${store.totals.total_posts} posts | $${store.totals.total_cost_usd.toFixed(2)} API cost`);
  lines.push(`👥 Active subscribers (30d): ${store.totals.active_subscribers}`);
  lines.push('');

  if (store.subscribers.length === 0) {
    lines.push('No subscriber usage recorded yet.');
    lines.push('Usage is tracked when pipeline produces videos.');
    return lines.join('\n');
  }

  const month = getMonthKey();
  for (const sub of store.subscribers.slice(0, 10)) {
    const mu = sub.monthly_usage[month];
    const monthStr = mu ? `${mu.videos}v/${mu.posts}p this month` : 'no activity this month';
    lines.push(`• ${sub.subscriber_id} [${sub.tier}] — ${sub.videos_generated} videos, ${sub.videos_posted} posts, $${sub.api_cost_usd.toFixed(2)} | ${monthStr}`);
  }

  if (store.subscribers.length > 10) {
    lines.push(`\n... and ${store.subscribers.length - 10} more subscribers`);
  }

  return lines.join('\n');
}

/** Get subscriber usage for upgrade decision */
export function getSubscriberUsage(subscriberId: string): SubscriberUsage | null {
  const store = loadStore();
  return store.subscribers.find(s => s.subscriber_id === subscriberId) ?? null;
}
