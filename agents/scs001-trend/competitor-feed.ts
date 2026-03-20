// SCS-001 — Competitor Analysis Feed (Sprint 479)
// Reads workspace/scs001/competitors.json and extracts insights for TrendAgent.
// Operator inputs via /competitor Telegram command.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const COMPETITORS_PATH = join(ROOT, 'workspace', 'scs001', 'competitors.json');

export interface CompetitorAccount {
  handle: string;
  niche: string;
  followers: number;
  avg_views: number;
  posting_frequency: string;
  hook_formulas: string[];
  top_topics: string[];
  last_updated: string;
}

export interface CompetitorData {
  updated_at: string;
  accounts: CompetitorAccount[];
  niches: string[];
  insights: {
    best_posting_times: string[];
    avg_hooks_per_niche: Record<string, string[]>;
    trending_topics_from_competitors: string[];
  };
}

export function loadCompetitors(): CompetitorData | null {
  if (!existsSync(COMPETITORS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(COMPETITORS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function saveCompetitors(data: CompetitorData): void {
  data.updated_at = new Date().toISOString();
  writeFileSync(COMPETITORS_PATH, JSON.stringify(data, null, 2));
}

export function addCompetitor(account: CompetitorAccount): void {
  const data = loadCompetitors() ?? {
    updated_at: '', accounts: [], niches: [],
    insights: { best_posting_times: [], avg_hooks_per_niche: {}, trending_topics_from_competitors: [] },
  };
  const idx = data.accounts.findIndex(a => a.handle.toLowerCase() === account.handle.toLowerCase());
  if (idx >= 0) {
    data.accounts[idx] = account;
  } else {
    data.accounts.push(account);
  }
  if (!data.niches.includes(account.niche)) data.niches.push(account.niche);
  refreshInsights(data);
  saveCompetitors(data);
}

export function removeCompetitor(handle: string): boolean {
  const data = loadCompetitors();
  if (!data) return false;
  const before = data.accounts.length;
  data.accounts = data.accounts.filter(a => a.handle.toLowerCase() !== handle.toLowerCase());
  if (data.accounts.length === before) return false;
  refreshInsights(data);
  saveCompetitors(data);
  return true;
}

function refreshInsights(data: CompetitorData): void {
  // Aggregate hook formulas per niche
  const hooksByNiche: Record<string, Set<string>> = {};
  const topicSet = new Set<string>();

  for (const acc of data.accounts) {
    if (!hooksByNiche[acc.niche]) hooksByNiche[acc.niche] = new Set();
    for (const h of acc.hook_formulas) hooksByNiche[acc.niche].add(h);
    for (const t of acc.top_topics) topicSet.add(t);
  }

  data.insights.avg_hooks_per_niche = {};
  for (const [niche, hooks] of Object.entries(hooksByNiche)) {
    data.insights.avg_hooks_per_niche[niche] = Array.from(hooks);
  }
  data.insights.trending_topics_from_competitors = Array.from(topicSet);
}

/** Extract competitor-sourced topics for TrendAgent boosting */
export function getCompetitorTopics(): string[] {
  const data = loadCompetitors();
  if (!data) return [];
  return data.insights.trending_topics_from_competitors;
}

/** Get competitor hook formulas for a given niche */
export function getCompetitorHooks(niche: string): string[] {
  const data = loadCompetitors();
  if (!data) return [];
  return data.insights.avg_hooks_per_niche[niche] ?? [];
}

/** Summary for Telegram display */
export function competitorSummary(): string {
  const data = loadCompetitors();
  if (!data || data.accounts.length === 0) return 'No competitors tracked yet. Use /competitor add @handle niche';

  const lines: string[] = ['📊 Competitor Analysis Feed\n'];

  for (const acc of data.accounts) {
    lines.push(`@${acc.handle.replace('@', '')} [${acc.niche}]`);
    lines.push(`  👥 ${acc.followers.toLocaleString()} | 👁 ${acc.avg_views.toLocaleString()} avg | 📝 ${acc.posting_frequency}`);
    lines.push(`  🎣 Hooks: ${acc.hook_formulas.join(', ')}`);
    lines.push(`  📌 Topics: ${acc.top_topics.slice(0, 3).join(', ')}`);
    lines.push('');
  }

  const topics = data.insights.trending_topics_from_competitors;
  if (topics.length > 0) {
    lines.push(`🔥 All competitor topics (${topics.length}): ${topics.slice(0, 8).join(', ')}${topics.length > 8 ? '...' : ''}`);
  }

  return lines.join('\n');
}
