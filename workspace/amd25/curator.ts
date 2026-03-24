#!/usr/bin/env npx tsx
/**
 * AMD-25 — Curator Agent
 * Sprint 999
 *
 * Manages the DKA store lifecycle: ingest, report, prune.
 * Persists entries to disk (JSONL) so the store survives restarts.
 *
 * Usage (CLI):
 *   npx tsx curator.ts ingest --domain research --text "..." --ref "doc.md" --tags "tag1,tag2"
 *   npx tsx curator.ts report
 *   npx tsx curator.ts prune
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { KnowledgeStore, type AddEntryParams } from './dka-store.js';
import type { DomainId, Classification, DKAVector } from './dka-schema.js';
import { DOMAIN_STORES } from './dka-schema.js';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const DATA_DIR = join(__dirname, '.data');
const STORE_FILE = join(DATA_DIR, 'dka-entries.jsonl');

function loadStore(): KnowledgeStore {
  const store = new KnowledgeStore();
  if (!existsSync(STORE_FILE)) return store;
  const lines = readFileSync(STORE_FILE, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as DKAVector;
      // Re-add using raw insert (bypass capacity check for reload)
      store['entries'].set(entry.id, entry);
    } catch {/* skip malformed */}
  }
  return store;
}

function persistEntry(entry: DKAVector): void {
  mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(STORE_FILE, JSON.stringify(entry) + '\n');
}

function rewriteStore(store: KnowledgeStore): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const lines = Array.from(store['entries'].values())
    .map(e => JSON.stringify(e)).join('\n');
  writeFileSync(STORE_FILE, lines ? lines + '\n' : '');
}

// ---------------------------------------------------------------------------
// Curator operations
// ---------------------------------------------------------------------------

interface CuratorReport {
  domain: DomainId;
  vectorCount: number;
  expiredCount: number;
  averageConfidence: number;
  averageAgeDays: number;
  timestamp: string;
}

function opIngest(store: KnowledgeStore, params: AddEntryParams): string {
  const id = store.add(params);
  persistEntry(store.getById(id)!);
  return id;
}

function opReport(store: KnowledgeStore): CuratorReport[] {
  const now = Date.now();
  return (Object.keys(DOMAIN_STORES) as DomainId[]).map(domain => {
    const entries = store.getByDomain(domain);
    const expired = entries.filter(e => e.expiresAt && new Date(e.expiresAt).getTime() < now);
    const avgConf = entries.length
      ? entries.reduce((s, e) => s + e.confidence, 0) / entries.length
      : 0;
    const avgAge = entries.length
      ? entries.reduce((s, e) => s + (now - new Date(e.createdAt).getTime()), 0)
        / entries.length / 86_400_000
      : 0;
    return {
      domain,
      vectorCount: entries.length,
      expiredCount: expired.length,
      averageConfidence: Math.round(avgConf * 100) / 100,
      averageAgeDays: Math.round(avgAge * 10) / 10,
      timestamp: new Date().toISOString(),
    };
  });
}

function opPrune(store: KnowledgeStore): { removed: number } {
  const now = Date.now();
  const entries = Array.from(store['entries'].values());
  let removed = 0;
  for (const e of entries) {
    // Prune: expired entries or confidence < 0.3
    if ((e.expiresAt && new Date(e.expiresAt).getTime() < now) || e.confidence < 0.3) {
      store.remove(e.id);
      removed++;
    }
  }
  if (removed > 0) rewriteStore(store);
  return { removed };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i]?.startsWith('--') && argv[i + 1] && !argv[i + 1]?.startsWith('--')) {
      out[argv[i]!.slice(2)] = argv[i + 1]!;
      i++;
    }
  }
  return out;
}

const cmd = process.argv[2];
const args = parseArgs(process.argv.slice(3));
const store = loadStore();

if (cmd === 'ingest') {
  const params: AddEntryParams = {
    domain: (args['domain'] ?? 'research') as DomainId,
    sourceText: args['text'] ?? '',
    sourceRef: args['ref'] ?? 'cli',
    createdBy: args['agent'] ?? 'curator',
    classification: (args['classification'] ?? 'public') as Classification,
    tags: (args['tags'] ?? '').split(',').filter(Boolean),
    confidence: Number(args['confidence'] ?? '0.8'),
    expiresAt: args['expires'],
  };
  const id = opIngest(store, params);
  console.log(JSON.stringify({ status: 'ok', id, domain: params.domain, storeSize: store.size() }));

} else if (cmd === 'report') {
  const reports = opReport(store);
  console.log(JSON.stringify(reports, null, 2));

} else if (cmd === 'prune') {
  const result = opPrune(store);
  console.log(JSON.stringify({ status: 'ok', ...result, storeSize: store.size() }));

} else {
  console.error('Usage: curator.ts [ingest|report|prune] [--option value ...]');
  process.exit(1);
}
