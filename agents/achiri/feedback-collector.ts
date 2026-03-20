/**
 * feedback-collector.ts — Sprint 312
 * Achiri alpha quality monitoring: collects user satisfaction ratings.
 *
 * shouldAskFeedback(userId): returns true every 10th message (configurable)
 * parseFeedbackRating(message): detects 1-5 rating from user message
 * storeFeedback(userId, rating): appends to workspace/achiri/feedback.jsonl
 * getFeedbackSummary(): aggregate stats for operator dashboard
 * buildFeedbackPromptHint(): system prompt hint asking for rating
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const FEEDBACK_PATH = join(ROOT, 'workspace', 'achiri', 'feedback.jsonl');
const DAILY_COUNTS_PATH = join(ROOT, 'workspace', 'achiri', 'daily-counts.json');

const FEEDBACK_INTERVAL = 10; // Ask every N messages

export interface FeedbackEntry {
  userId: string;
  rating: number;       // 1-5
  timestamp: string;
  messageCount: number; // total messages at time of feedback
}

export interface FeedbackSummary {
  total: number;
  average: number;
  distribution: Record<number, number>; // { 1: n, 2: n, ... 5: n }
  uniqueUsers: number;
  recentAvg: number;    // last 20 ratings
  nps: number;          // promoters (4-5) minus detractors (1-2) as %
}

/**
 * Check if we should ask this user for feedback based on their message count.
 */
export function shouldAskFeedback(userId: string): boolean {
  if (!existsSync(DAILY_COUNTS_PATH)) return false;
  try {
    const counts = JSON.parse(readFileSync(DAILY_COUNTS_PATH, 'utf-8')) as Record<string, Record<string, number>>;
    // Sum all messages across all days for this user
    let total = 0;
    for (const day of Object.values(counts)) {
      total += day[userId] ?? 0;
    }
    // Ask at every FEEDBACK_INTERVAL messages, but not on the very first set
    return total > 0 && total % FEEDBACK_INTERVAL === 0;
  } catch {
    return false;
  }
}

/**
 * Parse a feedback rating from user message. Returns 0 if not a rating.
 */
export function parseFeedbackRating(message: string): number {
  const trimmed = message.trim();
  // Direct number: "4", "5/5", "3 stars"
  const numMatch = trimmed.match(/^([1-5])(?:\s*(?:\/5|stars?|étoiles?))?$/i);
  if (numMatch) return parseInt(numMatch[1], 10);
  // Words: "excellent" = 5, "good" = 4, "ok" = 3, "bad" = 2, "terrible" = 1
  // Also Darija/French
  const lc = trimmed.toLowerCase();
  if (/^(excellent|ممتاز|5\/5|parfait|behi barsha)$/i.test(lc)) return 5;
  if (/^(good|bon|behi|جيد|4\/4|très bien)$/i.test(lc)) return 4;
  if (/^(ok|okay|moyen|عادي|3\/5|normal)$/i.test(lc)) return 3;
  if (/^(bad|mauvais|مش باهي|2\/5|pas bien)$/i.test(lc)) return 2;
  if (/^(terrible|nul|فاشل|1\/5|horrible)$/i.test(lc)) return 1;
  return 0; // Not a rating
}

/**
 * Store a feedback rating.
 */
export function storeFeedback(userId: string, rating: number): void {
  const dir = join(ROOT, 'workspace', 'achiri');
  mkdirSync(dir, { recursive: true });
  const entry: FeedbackEntry = {
    userId,
    rating,
    timestamp: new Date().toISOString(),
    messageCount: getUserTotalMessages(userId),
  };
  appendFileSync(FEEDBACK_PATH, JSON.stringify(entry) + '\n', 'utf-8');
  console.log(`[Achiri] feedback stored user=${userId} rating=${rating}`);
}

/**
 * Get total message count for a user.
 */
function getUserTotalMessages(userId: string): number {
  if (!existsSync(DAILY_COUNTS_PATH)) return 0;
  try {
    const counts = JSON.parse(readFileSync(DAILY_COUNTS_PATH, 'utf-8')) as Record<string, Record<string, number>>;
    let total = 0;
    for (const day of Object.values(counts)) {
      total += day[userId] ?? 0;
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Load all feedback entries.
 */
export function loadFeedback(): FeedbackEntry[] {
  if (!existsSync(FEEDBACK_PATH)) return [];
  return readFileSync(FEEDBACK_PATH, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l) as FeedbackEntry; } catch { return null; } })
    .filter(Boolean) as FeedbackEntry[];
}

/**
 * Compute aggregate feedback summary.
 */
export function getFeedbackSummary(): FeedbackSummary {
  const entries = loadFeedback();
  if (entries.length === 0) {
    return { total: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, uniqueUsers: 0, recentAvg: 0, nps: 0 };
  }

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const users = new Set<string>();
  let sum = 0;

  for (const e of entries) {
    distribution[e.rating] = (distribution[e.rating] ?? 0) + 1;
    users.add(e.userId);
    sum += e.rating;
  }

  const average = Math.round((sum / entries.length) * 10) / 10;

  // Recent average (last 20)
  const recent = entries.slice(-20);
  const recentSum = recent.reduce((s, e) => s + e.rating, 0);
  const recentAvg = Math.round((recentSum / recent.length) * 10) / 10;

  // NPS: promoters (4-5) minus detractors (1-2) as percentage
  const promoters = (distribution[4] ?? 0) + (distribution[5] ?? 0);
  const detractors = (distribution[1] ?? 0) + (distribution[2] ?? 0);
  const nps = Math.round(((promoters - detractors) / entries.length) * 100);

  return { total: entries.length, average, distribution, uniqueUsers: users.size, recentAvg, nps };
}

/**
 * System prompt hint asking for a rating.
 */
export function buildFeedbackPromptHint(): string {
  return `## Feedback Request
At the END of your next response, naturally ask the user to rate their experience on a scale of 1-5.
Be casual and brief — something like "Kifech lqiti el conversation? Men 1 l 5?" or "Quick — how's the chat so far? 1-5?"
Do NOT make it a separate message. Just add it as a last line of your reply.
If the user already gave a number (1-5), thank them and continue normally.`;
}
