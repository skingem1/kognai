/**
 * SCS-001 — Topic Radar
 *
 * Continuous real-world data collector for video topic sourcing.
 * Monitors AI/tech/DeFi/agents ecosystem across multiple sources:
 *   - Hacker News (top + new stories)
 *   - GitHub Trending (repositories)
 *   - Google Trends RSS
 *   - CoinGecko (top movers — DeFi/crypto)
 *   - ArXiv (latest AI papers)
 *
 * Classifies each topic into one of 3 video formats:
 *   Type 1 (EXPLAINER) — Mono avatar, <15s, single concept overview
 *   Type 2 (DEBATE)    — 2 avatars, <30s, competing tech/protocol face-off
 *   Type 3 (VISION)    — 3 avatars, discussion on AI future + video complement
 *
 * Output: TopicBrief[] ready for Multi-Format Script Generator
 */

import { randomUUID, createHash } from 'crypto';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ── Types ──────────────────────────────────────────────

export type VideoFormat = 'explainer' | 'debate' | 'vision' | 'listicle';

export interface TopicBrief {
  topic_id:       string;
  title:          string;
  summary:        string;
  format:         VideoFormat;
  source:         string;
  source_url:     string;
  confidence:     number;       // 0-100
  keywords:       string[];
  debate_sides?:  { side_a: string; side_b: string };  // For debate format
  vision_angles?: string[];     // For vision format — 3 discussion angles
  listicle_items?: string[];    // For listicle format — 3 ranked items
  collected_at:   string;
}

export interface TopicRadarResult {
  radar_id:     string;
  collected_at: string;
  topics:       TopicBrief[];
  sources_hit:  string[];
  errors:       string[];
}

// ── Config ─────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'workspace', 'scs001', 'topic-radar');
const DEDUP_PATH = join(OUT_DIR, 'seen-topics.json');

// AI/Tech/DeFi relevance keywords
const RELEVANCE_KEYWORDS = [
  'ai', 'llm', 'gpt', 'claude', 'openai', 'anthropic', 'gemini', 'deepseek',
  'agent', 'agentic', 'mcp', 'tool use', 'function calling', 'rag',
  'blockchain', 'defi', 'crypto', 'ethereum', 'solana', 'bitcoin', 'web3',
  'x402', 'erc', 'protocol', 'smart contract', 'token', 'dao',
  'neural', 'transformer', 'diffusion', 'fine-tuning', 'inference',
  'robotics', 'autonomous', 'self-driving', 'drone',
  'open source', 'rust', 'python', 'typescript', 'wasm',
  'startup', 'vc', 'funding', 'yc', 'a16z',
  'gpu', 'tpu', 'nvidia', 'apple', 'meta', 'google', 'microsoft',
  'model', 'benchmark', 'reasoning', 'coding', 'vision', 'multimodal',
];

// Keywords that suggest debate potential (competing approaches)
// Sprint 609: Broadened to catch more debate-worthy topics
const DEBATE_SIGNALS = [
  'vs', 'versus', 'compared', 'comparison', 'alternative', 'competitor',
  'better than', 'replaces', 'kills', 'outperforms', 'benchmark',
  'open source vs', 'centralized vs', 'on-chain vs', 'cloud vs local',
  'fork', 'war', 'battle', 'rivalry', 'challenge', 'threat',
  'controversy', 'debate', 'disagree', 'split', 'divide',
  'bullish', 'bearish', 'overrated', 'underrated',
];

// Keywords suggesting big-picture vision topics
// Sprint 609: Broadened + lowered threshold for more format diversity
const VISION_SIGNALS = [
  'future', 'agi', 'singularity', 'next era', 'paradigm', 'revolution',
  'transform', 'reshape', 'redefine', 'world', 'society', 'humanity',
  'superintelligence', 'alignment', 'existential', 'consciousness',
  'economy', 'labor', 'jobs', 'automation', 'governance',
  'prediction', 'forecast', 'roadmap', '2030', '2040', 'next decade',
  'impact', 'disruption', 'breakthrough', 'milestone', 'inflection',
  'regulation', 'policy', 'ethics', 'safety', 'risk',
];

// Keywords suggesting listicle/ranking topics (Sprint 613)
const LISTICLE_SIGNALS = [
  'top', 'best', 'worst', 'ranking', 'ranked', 'list',
  'tools', 'apps', 'projects', 'frameworks', 'libraries',
  'most popular', 'trending', 'hottest', 'fastest growing',
  'must-know', 'essential', 'underrated', 'overlooked',
  'biggest', 'newest', 'latest', 'alternatives',
  'picks', 'favorites', 'recommendations', 'winners',
];

// ── Dedup ──────────────────────────────────────────────

function loadSeenTopics(): Set<string> {
  if (!existsSync(DEDUP_PATH)) return new Set();
  try {
    const data = JSON.parse(readFileSync(DEDUP_PATH, 'utf8'));
    return new Set(data);
  } catch { return new Set(); }
}

function saveSeenTopics(seen: Set<string>): void {
  // Keep only last 500 to avoid unbounded growth
  const arr = [...seen].slice(-500);
  writeFileSync(DEDUP_PATH, JSON.stringify(arr, null, 2));
}

function topicHash(title: string): string {
  return createHash('sha256').update(title.toLowerCase().trim()).digest('hex').slice(0, 12);
}

// ── Relevance Scoring ──────────────────────────────────

function scoreRelevance(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of RELEVANCE_KEYWORDS) {
    if (lower.includes(kw)) score += 5;
  }
  return Math.min(100, score);
}

function classifyFormat(title: string, summary: string): VideoFormat {
  const text = (title + ' ' + summary).toLowerCase();

  // Check for debate signals first (most specific)
  const debateScore = DEBATE_SIGNALS.filter(s => text.includes(s)).length;
  if (debateScore >= 1) return 'debate';  // Sprint 609: lowered from 2 to 1

  // Check for vision signals
  const visionScore = VISION_SIGNALS.filter(s => text.includes(s)).length;
  if (visionScore >= 1) return 'vision';  // Sprint 609: lowered from 2 to 1

  // Sprint 613+616: Check for listicle signals (word boundary to avoid false positives like "holistic")
  const listicleScore = LISTICLE_SIGNALS.filter(s => new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)).length;
  if (listicleScore >= 1) return 'listicle';

  // Default: quick explainer
  return 'explainer';
}

function extractDebateSides(title: string, summary: string): { side_a: string; side_b: string } | undefined {
  const text = title + ' ' + summary;
  const vsMatch = text.match(/(\w[\w\s.-]+?)\s+(?:vs\.?|versus|compared to|or)\s+(\w[\w\s.-]+)/i);
  if (vsMatch) return { side_a: vsMatch[1].trim(), side_b: vsMatch[2].trim() };
  return undefined;
}

function extractVisionAngles(summary: string): string[] {
  // Extract 3 potential discussion angles from the summary
  const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 10);
  return sentences.slice(0, 3).map(s => s.trim());
}

// Sprint 613: Extract 3 list items from title/summary for listicle format
function extractListicleItems(title: string, summary: string): string[] {
  const text = title + ' ' + summary;
  // Try to extract named items (e.g. "GPT-4, Claude, Gemini")
  const commaList = text.match(/(?:top|best|biggest)\s+\d*\s*[:—–-]?\s*(.+)/i);
  if (commaList) {
    const items = commaList[1].split(/[,;]/).map(s => s.trim()).filter(s => s.length > 2 && s.length < 50);
    if (items.length >= 3) return items.slice(0, 3);
  }
  // Fallback: use keywords from title
  const words = title.split(/[\s,\-\/]+/).filter(w => w.length > 3);
  return words.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1));
}

// ── Source Fetchers ────────────────────────────────────

async function fetchHackerNews(): Promise<TopicBrief[]> {
  const topics: TopicBrief[] = [];
  try {
    // Top stories
    const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
      signal: AbortSignal.timeout(8000),
    });
    const topIds = (await topRes.json() as number[]).slice(0, 30);

    // Fetch stories in parallel (max 10 concurrent)
    const batchSize = 10;
    for (let i = 0; i < topIds.length; i += batchSize) {
      const batch = topIds.slice(i, i + batchSize);
      const stories = await Promise.all(
        batch.map(async (id) => {
          const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
            signal: AbortSignal.timeout(5000),
          });
          return res.json() as Promise<{ id: number; title: string; url?: string; score: number; descendants?: number }>;
        })
      );

      for (const story of stories) {
        if (!story?.title) continue;
        const relevance = scoreRelevance(story.title);
        if (relevance < 15) continue; // At least 3 keyword hits

        const format = classifyFormat(story.title, '');
        topics.push({
          topic_id: 'hn-' + topicHash(story.title),
          title: story.title,
          summary: `Hacker News (${story.score} pts, ${story.descendants ?? 0} comments)`,
          format,
          source: 'hacker_news',
          source_url: story.url ?? `https://news.ycombinator.com/item?id=${story.id}`,
          confidence: Math.min(95, 50 + Math.floor(story.score / 10)),
          keywords: story.title.toLowerCase().split(/[\s,\-\/]+/).filter(w => w.length > 3).slice(0, 6),
          debate_sides: format === 'debate' ? extractDebateSides(story.title, '') : undefined,
          listicle_items: format === 'listicle' ? extractListicleItems(story.title, '') : undefined,
          collected_at: new Date().toISOString(),
        });
      }
    }
    console.log(`[TopicRadar] Hacker News: ${topics.length} relevant topics`);
  } catch (err) {
    console.warn(`[TopicRadar] HN failed: ${(err as Error).message}`);
  }
  return topics;
}

async function fetchGitHubTrending(): Promise<TopicBrief[]> {
  const topics: TopicBrief[] = [];
  try {
    // GitHub doesn't have an official trending API, use the unofficial one
    const res = await fetch('https://api.gitterapp.com/repositories?since=daily&spoken_language_code=en', {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      // Fallback: use GitHub search API for recently created repos with many stars
      const searchRes = await fetch(
        'https://api.github.com/search/repositories?q=created:>' +
        new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10) +
        '+stars:>50&sort=stars&order=desc&per_page=20',
        { signal: AbortSignal.timeout(8000) }
      );
      if (!searchRes.ok) throw new Error(`GitHub search ${searchRes.status}`);
      const searchData = await searchRes.json() as {
        items: Array<{ full_name: string; description: string; html_url: string; stargazers_count: number; language: string }>;
      };

      for (const repo of (searchData.items ?? []).slice(0, 15)) {
        const desc = repo.description ?? '';
        const relevance = scoreRelevance(repo.full_name + ' ' + desc);
        if (relevance < 10) continue;

        topics.push({
          topic_id: 'gh-' + topicHash(repo.full_name),
          title: `${repo.full_name} — ${desc.slice(0, 80)}`,
          summary: `GitHub trending (${repo.stargazers_count} ⭐, ${repo.language ?? 'N/A'})`,
          format: 'explainer',
          source: 'github',
          source_url: repo.html_url,
          confidence: Math.min(90, 40 + Math.floor(repo.stargazers_count / 50)),
          keywords: (repo.full_name + ' ' + desc).toLowerCase().split(/[\s,\-\/]+/).filter(w => w.length > 3).slice(0, 6),
          collected_at: new Date().toISOString(),
        });
      }
    } else {
      const repos = (await res.json()) as Array<{
        author: string; name: string; description: string; url: string; stars: number; language: string;
      }>;

      for (const repo of repos.slice(0, 15)) {
        const desc = repo.description ?? '';
        const relevance = scoreRelevance(repo.name + ' ' + desc);
        if (relevance < 10) continue;

        topics.push({
          topic_id: 'gh-' + topicHash(repo.author + '/' + repo.name),
          title: `${repo.author}/${repo.name} — ${desc.slice(0, 80)}`,
          summary: `GitHub trending (${repo.stars} ⭐, ${repo.language ?? 'N/A'})`,
          format: 'explainer',
          source: 'github',
          source_url: repo.url,
          confidence: Math.min(90, 40 + Math.floor(repo.stars / 50)),
          keywords: (repo.name + ' ' + desc).toLowerCase().split(/[\s,\-\/]+/).filter(w => w.length > 3).slice(0, 6),
          collected_at: new Date().toISOString(),
        });
      }
    }
    console.log(`[TopicRadar] GitHub: ${topics.length} relevant repos`);
  } catch (err) {
    console.warn(`[TopicRadar] GitHub failed: ${(err as Error).message}`);
  }
  return topics;
}

async function fetchArxivAI(): Promise<TopicBrief[]> {
  const topics: TopicBrief[] = [];
  try {
    const url = 'http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=15';
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`ArXiv ${res.status}`);

    const xml = await res.text();
    const entries = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g);

    for (const match of Array.from(entries)) {
      const entry = match[1];
      const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
      const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
      const linkMatch = entry.match(/<id>([\s\S]*?)<\/id>/);
      if (!titleMatch) continue;

      const title = titleMatch[1].replace(/\s+/g, ' ').trim();
      const summary = (summaryMatch?.[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const url = linkMatch?.[1]?.trim() ?? '';

      const relevance = scoreRelevance(title + ' ' + summary);
      if (relevance < 10) continue;

      const format = classifyFormat(title, summary);
      topics.push({
        topic_id: 'arxiv-' + topicHash(title),
        title: title.slice(0, 120),
        summary: summary.slice(0, 150),
        format,
        source: 'arxiv',
        source_url: url,
        confidence: Math.min(85, 50 + relevance / 2),
        keywords: title.toLowerCase().split(/[\s,\-\/]+/).filter(w => w.length > 3).slice(0, 6),
        vision_angles: format === 'vision' ? extractVisionAngles(summary) : undefined,
        collected_at: new Date().toISOString(),
      });
    }
    console.log(`[TopicRadar] ArXiv: ${topics.length} relevant papers`);
  } catch (err) {
    console.warn(`[TopicRadar] ArXiv failed: ${(err as Error).message}`);
  }
  return topics;
}

async function fetchCryptoMovers(): Promise<TopicBrief[]> {
  const topics: TopicBrief[] = [];
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/search/trending',
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json() as {
      coins: Array<{ item: { id: string; name: string; symbol: string; score: number; data?: { price_change_percentage_24h?: Record<string, number> } } }>;
    };

    for (const coin of (data.coins ?? []).slice(0, 10)) {
      const c = coin.item;
      const priceChange = c.data?.price_change_percentage_24h?.usd ?? 0;
      const isRelevant = scoreRelevance(c.name + ' ' + c.id) >= 5 ||
                          c.id.includes('ai') || c.id.includes('agent') || c.id.includes('defi');

      if (!isRelevant && Math.abs(priceChange) < 10) continue;

      topics.push({
        topic_id: 'cg-' + topicHash(c.name),
        title: `${c.name} (${c.symbol.toUpperCase()}) ${priceChange > 0 ? '📈' : '📉'} ${priceChange.toFixed(1)}%`,
        summary: `Trending on CoinGecko — rank #${c.score + 1}`,
        format: Math.abs(priceChange) > 20 ? 'debate' : 'explainer',
        source: 'coingecko',
        source_url: `https://www.coingecko.com/en/coins/${c.id}`,
        confidence: Math.min(80, 50 + Math.abs(priceChange)),
        keywords: [c.name.toLowerCase(), c.symbol.toLowerCase(), 'crypto', 'defi'],
        debate_sides: Math.abs(priceChange) > 20 ? {
          side_a: `${c.name} is ${priceChange > 0 ? 'overvalued' : 'undervalued'}`,
          side_b: `${c.name} ${priceChange > 0 ? 'rally is justified' : 'will recover'}`,
        } : undefined,
        collected_at: new Date().toISOString(),
      });
    }
    console.log(`[TopicRadar] CoinGecko: ${topics.length} trending coins`);
  } catch (err) {
    console.warn(`[TopicRadar] CoinGecko failed: ${(err as Error).message}`);
  }
  return topics;
}

async function fetchGoogleTrends(): Promise<TopicBrief[]> {
  const topics: TopicBrief[] = [];
  try {
    const res = await fetch('https://trends.google.com/trending/rss?geo=US', {
      headers: { 'User-Agent': 'Kognai-TopicRadar/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Google Trends ${res.status}`);

    const xml = await res.text();
    const items = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    let rank = 0;

    for (const match of Array.from(items)) {
      const item = match[1];
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                         item.match(/<title>(.*?)<\/title>/);
      if (!titleMatch) continue;

      const title = titleMatch[1].trim();
      rank++;
      const relevance = scoreRelevance(title);
      if (relevance < 10) continue;

      topics.push({
        topic_id: 'gtrend-' + topicHash(title),
        title,
        summary: `Google Trends #${rank} (US)`,
        format: classifyFormat(title, ''),
        source: 'google_trends',
        source_url: `https://trends.google.com/trending?geo=US`,
        confidence: rank <= 5 ? 90 : rank <= 10 ? 80 : 70,
        keywords: title.toLowerCase().split(/[\s,\-\/]+/).filter(w => w.length > 3).slice(0, 6),
        collected_at: new Date().toISOString(),
      });

      if (rank >= 20) break;
    }
    console.log(`[TopicRadar] Google Trends: ${topics.length} relevant trends`);
  } catch (err) {
    console.warn(`[TopicRadar] Google Trends failed: ${(err as Error).message}`);
  }
  return topics;
}

// ── Reddit Fetcher (Sprint 748) ──────────────────────────

async function fetchReddit(): Promise<TopicBrief[]> {
  const topics: TopicBrief[] = [];
  const subreddits = ['technology', 'artificial', 'MachineLearning', 'cryptocurrency'];
  try {
    for (const sub of subreddits) {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=10`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Kognai-TopicRadar/1.0' },
      });
      if (!res.ok) continue;
      const data = await res.json() as {
        data: { children: Array<{ data: { title: string; selftext: string; url: string; score: number; num_comments: number; permalink: string } }> };
      };
      for (const post of data.data.children) {
        const p = post.data;
        const relevance = scoreRelevance(p.title + ' ' + (p.selftext ?? '').slice(0, 200));
        if (relevance < 10) continue;
        const format = classifyFormat(p.title, p.selftext ?? '');
        topics.push({
          topic_id: 'reddit-' + topicHash(p.title),
          title: p.title.slice(0, 120),
          summary: `Reddit r/${sub} (${p.score} pts, ${p.num_comments} comments)`,
          format,
          source: 'reddit',
          source_url: `https://www.reddit.com${p.permalink}`,
          confidence: Math.min(85, 40 + Math.floor(p.score / 100)),
          keywords: p.title.toLowerCase().split(/[\s,\-\/]+/).filter(w => w.length > 3).slice(0, 6),
          debate_sides: format === 'debate' ? extractDebateSides(p.title, p.selftext ?? '') : undefined,
          vision_angles: format === 'vision' ? extractVisionAngles(p.selftext ?? p.title) : undefined,
          listicle_items: format === 'listicle' ? extractListicleItems(p.title, p.selftext ?? '') : undefined,
          collected_at: new Date().toISOString(),
        });
      }
    }
    console.log(`[TopicRadar] Reddit: ${topics.length} relevant posts`);
  } catch (err) {
    console.warn(`[TopicRadar] Reddit failed: ${(err as Error).message}`);
  }
  return topics;
}

// ── Product Hunt Fetcher (Sprint 748) ────────────────────

async function fetchProductHunt(): Promise<TopicBrief[]> {
  const topics: TopicBrief[] = [];
  try {
    // Use Product Hunt's public RSS feed
    const res = await fetch('https://www.producthunt.com/feed', {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Kognai-TopicRadar/1.0' },
    });
    if (!res.ok) throw new Error(`Product Hunt ${res.status}`);
    const xml = await res.text();
    const items = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

    for (const match of Array.from(items).slice(0, 15)) {
      const item = match[1];
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                         item.match(/<title>(.*?)<\/title>/);
      const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                        item.match(/<description>(.*?)<\/description>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      if (!titleMatch) continue;

      const title = titleMatch[1].trim();
      const desc = (descMatch?.[1] ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 200);
      const url = linkMatch?.[1]?.trim() ?? 'https://www.producthunt.com';

      const relevance = scoreRelevance(title + ' ' + desc);
      if (relevance < 10) continue;

      const format = classifyFormat(title, desc);
      topics.push({
        topic_id: 'ph-' + topicHash(title),
        title: title.slice(0, 120),
        summary: `Product Hunt — ${desc.slice(0, 100)}`,
        format,
        source: 'product_hunt',
        source_url: url,
        confidence: 70,
        keywords: title.toLowerCase().split(/[\s,\-\/]+/).filter(w => w.length > 3).slice(0, 6),
        debate_sides: format === 'debate' ? extractDebateSides(title, desc) : undefined,
        vision_angles: format === 'vision' ? extractVisionAngles(desc) : undefined,
        listicle_items: format === 'listicle' ? extractListicleItems(title, desc) : undefined,
        collected_at: new Date().toISOString(),
      });
    }
    console.log(`[TopicRadar] Product Hunt: ${topics.length} relevant products`);
  } catch (err) {
    console.warn(`[TopicRadar] Product Hunt failed: ${(err as Error).message}`);
  }
  return topics;
}

// ── Main Radar ─────────────────────────────────────────

export class TopicRadar {
  private seen: Set<string>;
  private forceRefresh: boolean;

  constructor(opts?: { forceRefresh?: boolean }) {
    mkdirSync(OUT_DIR, { recursive: true });
    this.forceRefresh = opts?.forceRefresh ?? false;
    if (this.forceRefresh) {
      // Sprint 605: Clear dedup cache to allow topic re-discovery
      console.log('[TopicRadar] Force refresh — clearing seen topics cache');
      this.seen = new Set();
      saveSeenTopics(this.seen);
    } else {
      this.seen = loadSeenTopics();
    }
  }

  async scan(): Promise<TopicRadarResult> {
    const errors: string[] = [];
    const sourcesHit: string[] = [];

    console.log('[TopicRadar] Starting scan across all sources...');

    // Fetch all sources in parallel
    const [hn, gh, arxiv, crypto, gtrends, reddit, ph] = await Promise.allSettled([
      fetchHackerNews(),
      fetchGitHubTrending(),
      fetchArxivAI(),
      fetchCryptoMovers(),
      fetchGoogleTrends(),
      fetchReddit(),
      fetchProductHunt(),
    ]);

    const allTopics: TopicBrief[] = [];
    const results = [
      { name: 'hacker_news', result: hn },
      { name: 'github', result: gh },
      { name: 'arxiv', result: arxiv },
      { name: 'coingecko', result: crypto },
      { name: 'google_trends', result: gtrends },
      { name: 'reddit', result: reddit },
      { name: 'product_hunt', result: ph },
    ];

    for (const { name, result } of results) {
      if (result.status === 'fulfilled') {
        allTopics.push(...result.value);
        if (result.value.length > 0) sourcesHit.push(name);
      } else {
        errors.push(`${name}: ${result.reason}`);
      }
    }

    // Dedup against previously seen topics
    const fresh = allTopics.filter(t => !this.seen.has(t.topic_id));

    // Sort by confidence (highest first)
    fresh.sort((a, b) => b.confidence - a.confidence);

    // Mark as seen
    for (const t of fresh) this.seen.add(t.topic_id);
    saveSeenTopics(this.seen);

    // Sprint 609 + 616: Ensure format mix — force at least 1 of each type
    const byFormat = {
      explainer: fresh.filter(t => t.format === 'explainer'),
      debate: fresh.filter(t => t.format === 'debate'),
      vision: fresh.filter(t => t.format === 'vision'),
      listicle: fresh.filter(t => t.format === 'listicle'),
    };

    // If a format has 0 topics, reclassify the highest-confidence explainer
    if (byFormat.debate.length === 0 && byFormat.explainer.length >= 2) {
      const reclassified = byFormat.explainer.pop()!;
      reclassified.format = 'debate';
      // Auto-generate debate sides from keywords
      if (!reclassified.debate_sides && reclassified.keywords.length >= 2) {
        reclassified.debate_sides = { side_a: reclassified.keywords[0], side_b: reclassified.keywords[1] };
      }
      byFormat.debate.push(reclassified);
    }
    if (byFormat.vision.length === 0 && byFormat.explainer.length >= 2) {
      const reclassified = byFormat.explainer.pop()!;
      reclassified.format = 'vision';
      byFormat.vision.push(reclassified);
    }
    // Sprint 616: Derive a listicle topic from explainer keywords if none found naturally
    if (byFormat.listicle.length === 0 && byFormat.explainer.length >= 2) {
      const source = byFormat.explainer.pop()!;
      const derived: TopicBrief = {
        ...source,
        topic_id: source.topic_id + '-lst',
        title: `Top 3 ${source.keywords.slice(0, 2).join(' ')} tools you need to know`,
        format: 'listicle',
        listicle_items: source.keywords.slice(0, 3).map(k => k.charAt(0).toUpperCase() + k.slice(1)),
      };
      byFormat.listicle.push(derived);
    }

    // Select top topics: 2 explainers, 1 debate, 1 vision, 1 listicle (balanced 4-format mix)
    const selected: TopicBrief[] = [
      ...byFormat.explainer.slice(0, 2),
      ...byFormat.debate.slice(0, 1),
      ...byFormat.vision.slice(0, 1),
      ...byFormat.listicle.slice(0, 1),
    ];

    // If we didn't get enough, fill from remaining
    if (selected.length < 5) {
      const selectedIds = new Set(selected.map(s => s.topic_id));
      const remaining = fresh.filter(t => !selectedIds.has(t.topic_id));
      selected.push(...remaining.slice(0, 5 - selected.length));
    }

    const result: TopicRadarResult = {
      radar_id: 'radar-' + new Date().toISOString().slice(0, 13).replace(/[:-]/g, '') + '-' + randomUUID().slice(0, 6),
      collected_at: new Date().toISOString(),
      topics: selected,
      sources_hit: sourcesHit,
      errors,
    };

    // Save to disk
    const outPath = join(OUT_DIR, `${result.radar_id}.json`);
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`[TopicRadar] Scan complete: ${selected.length} topics selected (${fresh.length} fresh / ${allTopics.length} total)`);
    console.log(`[TopicRadar] Formats: ${byFormat.explainer.length} explainer, ${byFormat.debate.length} debate, ${byFormat.vision.length} vision, ${byFormat.listicle.length} listicle`);
    console.log(`[TopicRadar] Saved: ${outPath}`);

    return result;
  }
}

// ── CLI Runner ─────────────────────────────────────────

if (require.main === module) {
  const forceRefresh = process.argv.includes('--force-refresh');
  const radar = new TopicRadar({ forceRefresh });
  radar.scan().then(result => {
    console.log('\n=== Topic Radar Results ===');
    for (const t of result.topics) {
      console.log(`  [${t.format.toUpperCase().padEnd(9)}] ${t.title.slice(0, 80)} (${t.source}, conf:${t.confidence})`);
    }
    if (result.errors.length > 0) {
      console.log('\nErrors:', result.errors.join('; '));
    }
  }).catch(err => {
    console.error('Topic Radar failed:', err);
    process.exit(1);
  });
}
