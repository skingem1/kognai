/**
 * ia-client.ts
 * Typed client for the Internet Archive search API.
 * Supports per-topic search driven by viral-topics.ts.
 */

import type { TopicConfig } from './viral-topics.js';

export interface IAItem {
  identifier: string;
  title: string;
  description?: string;
  mediatype: string;
  subject?: string[];
  creator?: string;
  date?: string;
  downloads?: number;
  views?: number;
  addeddate?: string;
  publicdate?: string;
  source_url: string;
  topic_id?: string;
}

export interface IASearchParams {
  query: string;
  mediatype?: 'movies' | 'audio' | 'texts' | 'image';
  collection?: string;
  sort?: 'downloads desc' | 'publicdate desc' | 'views desc';
  rows?: number;
  page?: number;
  date_from?: string;
  date_to?: string;
}

export interface IASearchResult {
  items: IAItem[];
  total: number;
  page: number;
  rows: number;
}

const BASE_URL = 'https://archive.org/advancedsearch.php';
const FIELDS = ['identifier', 'title', 'description', 'mediatype', 'subject', 'creator', 'date', 'downloads', 'views', 'addeddate', 'publicdate'];

/** 1 req/sec rate limiter */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let lastRequestAt = 0;
async function throttle() {
  const now = Date.now();
  const wait = 1000 - (now - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

/** Search the Internet Archive */
export async function searchInternetArchive(params: IASearchParams): Promise<IASearchResult> {
  await throttle();

  const url = new URL(BASE_URL);
  let q = params.query;
  if (params.mediatype) q += ` AND mediatype:${params.mediatype}`;
  if (params.collection) q += ` AND collection:${params.collection}`;
  if (params.date_from || params.date_to) {
    const from = params.date_from ?? '*';
    const to = params.date_to ?? '*';
    q += ` AND date:[${from} TO ${to}]`;
  }
  url.searchParams.set('q', q);
  FIELDS.forEach(f => url.searchParams.append('fl[]', f));
  url.searchParams.set('sort[]', params.sort ?? 'downloads desc');
  url.searchParams.set('rows', String(params.rows ?? 50));
  url.searchParams.set('page', String(params.page ?? 1));
  url.searchParams.set('output', 'json');

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn(`[ia-client] HTTP ${res.status} for query: ${params.query}`);
      return { items: [], total: 0, page: params.page ?? 1, rows: 0 };
    }
    const json = await res.json() as { response: { docs: Record<string, unknown>[]; numFound: number } };
    const docs = json.response?.docs ?? [];
    const items: IAItem[] = docs.map(doc => ({
      identifier: String(doc.identifier ?? ''),
      title: String(doc.title ?? ''),
      description: doc.description ? String(doc.description) : undefined,
      mediatype: String(doc.mediatype ?? ''),
      subject: Array.isArray(doc.subject) ? doc.subject.map(String) : (doc.subject ? [String(doc.subject)] : undefined),
      creator: doc.creator ? String(doc.creator) : undefined,
      date: doc.date ? String(doc.date) : undefined,
      downloads: doc.downloads ? Number(doc.downloads) : undefined,
      views: doc.views ? Number(doc.views) : undefined,
      addeddate: doc.addeddate ? String(doc.addeddate) : undefined,
      publicdate: doc.publicdate ? String(doc.publicdate) : undefined,
      source_url: `https://archive.org/details/${doc.identifier}`,
    }));
    return { items, total: json.response.numFound ?? 0, page: params.page ?? 1, rows: items.length };
  } catch (err) {
    console.warn(`[ia-client] Error fetching "${params.query}":`, err);
    return { items: [], total: 0, page: params.page ?? 1, rows: 0 };
  }
}

/**
 * Search IA using all queries for a given TopicConfig.
 * Deduplicates by identifier. Tags all results with topic_id.
 */
export async function searchByTopic(topic: TopicConfig, rows = 50): Promise<IAItem[]> {
  const seen = new Set<string>();
  const results: IAItem[] = [];

  for (const query of topic.ia_queries) {
    const result = await searchInternetArchive({
      query,
      mediatype: topic.mediatype,
      collection: topic.ia_collection,
      rows,
      sort: 'downloads desc',
    });
    for (const item of result.items) {
      if (item.identifier && !seen.has(item.identifier)) {
        seen.add(item.identifier);
        results.push({ ...item, topic_id: topic.id });
      }
    }
    console.log(`  [${topic.id}] "${query}" → ${result.items.length} items`);
  }

  return results;
}

/** Fetch full metadata for a single IA item */
export async function getItemMetadata(identifier: string): Promise<IAItem | null> {
  await throttle();
  try {
    const res = await fetch(`https://archive.org/metadata/${identifier}`);
    if (!res.ok) return null;
    const json = await res.json() as { metadata: Record<string, unknown> };
    const m = json.metadata ?? {};
    return {
      identifier,
      title: String(m.title ?? ''),
      description: m.description ? String(m.description) : undefined,
      mediatype: String(m.mediatype ?? ''),
      subject: Array.isArray(m.subject) ? m.subject.map(String) : (m.subject ? [String(m.subject)] : undefined),
      creator: m.creator ? String(m.creator) : undefined,
      date: m.date ? String(m.date) : undefined,
      source_url: `https://archive.org/details/${identifier}`,
    };
  } catch {
    return null;
  }
}
