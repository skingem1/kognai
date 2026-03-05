/**
 * content-scorer.ts
 * Scores IAItems by TikTok viral potential.
 * Scoring model derived from viral_agent_report_EN.md (Section A + B).
 */

import type { IAItem } from './ia-client.js';

export interface ScoredItem extends IAItem {
  score: number;
  score_breakdown: {
    virality: number;   // 0-40: based on downloads/views
    recency: number;    // 0-25: how recent the content is
    richness: number;   // 0-20: metadata completeness
    media_bonus: number; // 0-15: video > audio > other
  };
  disqualified: boolean;
  disqualify_reason?: string;
}

const NOW = Date.now();
const DAY_MS = 86_400_000;

function parseDate(dateStr?: string): number | null {
  if (!dateStr) return null;
  const ts = Date.parse(dateStr);
  return isNaN(ts) ? null : ts;
}

/** Score a single IAItem (0-100) */
export function scoreItem(item: IAItem): ScoredItem {
  // — Disqualification checks —
  if (item.mediatype === 'texts' && (!item.description || item.description.length < 50)) {
    return { ...item, score: 0, score_breakdown: { virality: 0, recency: 0, richness: 0, media_bonus: 0 }, disqualified: true, disqualify_reason: 'text item with no visual description' };
  }
  const titleLower = (item.title ?? '').toLowerCase();
  if (/\b(test|sample|placeholder)\b/.test(titleLower)) {
    return { ...item, score: 0, score_breakdown: { virality: 0, recency: 0, richness: 0, media_bonus: 0 }, disqualified: true, disqualify_reason: 'title contains test/sample/placeholder' };
  }
  const pubTs = parseDate(item.publicdate);
  const hasNoEngagement = !item.downloads && !item.views;
  if (hasNoEngagement && pubTs && (NOW - pubTs) > 365 * DAY_MS) {
    return { ...item, score: 0, score_breakdown: { virality: 0, recency: 0, richness: 0, media_bonus: 0 }, disqualified: true, disqualify_reason: 'zero engagement and older than 1 year' };
  }

  // — Virality score (0-40) —
  const engagement = Math.max(item.downloads ?? 0, item.views ?? 0, 1);
  const virality = Math.min(Math.log10(engagement) / Math.log10(1_000_000) * 40, 40);

  // — Recency score (0-25) —
  let recency = 0;
  if (pubTs) {
    const ageDays = (NOW - pubTs) / DAY_MS;
    if (ageDays <= 30) recency = 25;
    else if (ageDays <= 90) recency = 15;
    else if (ageDays <= 365) recency = 5;
  }

  // — Richness score (0-20) —
  let richness = 0;
  if (item.description && item.description.length > 50) richness += 10;
  if (item.subject && item.subject.length >= 3) richness += 10;

  // — Media bonus (0-15) —
  const media_bonus = item.mediatype === 'movies' ? 15 : item.mediatype === 'audio' ? 10 : 0;

  const score = Math.round(virality + recency + richness + media_bonus);
  return {
    ...item,
    score,
    score_breakdown: {
      virality: Math.round(virality),
      recency,
      richness,
      media_bonus,
    },
    disqualified: false,
  };
}

/** Score and rank a list of items. Returns top 50 non-disqualified, sorted by score desc. */
export function rankItems(items: IAItem[]): ScoredItem[] {
  return items
    .map(scoreItem)
    .filter(i => !i.disqualified)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
}
