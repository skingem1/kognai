#!/usr/bin/env ts-node
/**
 * dedup-delivered.ts — One-time cleanup of auto-delivered.jsonl
 *
 * Removes duplicate entries (same video_id), keeping the earliest delivery.
 * Also backs up the original file before overwriting.
 *
 * Sprint 666
 * Usage: npx ts-node scripts/scs001/dedup-delivered.ts
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const DELIVERED_PATH = join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');
const BACKUP_PATH = DELIVERED_PATH + '.bak-dedup';

function main(): void {
  if (!existsSync(DELIVERED_PATH)) {
    console.log('[dedup-delivered] No auto-delivered.jsonl found');
    return;
  }

  const lines = readFileSync(DELIVERED_PATH, 'utf-8')
    .split('\n')
    .filter(l => l.trim());

  const entries: any[] = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch { /* skip corrupt */ }
  }

  const before = entries.length;
  const seen = new Set<string>();
  const deduped: any[] = [];

  // Sort by delivered_at ascending to keep earliest delivery
  entries.sort((a, b) => (a.delivered_at ?? '').localeCompare(b.delivered_at ?? ''));

  for (const e of entries) {
    if (!e.video_id || seen.has(e.video_id)) continue;
    seen.add(e.video_id);
    deduped.push(e);
  }

  const after = deduped.length;
  const removed = before - after;

  if (removed === 0) {
    console.log(`[dedup-delivered] No duplicates found (${before} entries)`);
    return;
  }

  // Backup original
  copyFileSync(DELIVERED_PATH, BACKUP_PATH);
  console.log(`[dedup-delivered] Backed up to ${BACKUP_PATH}`);

  // Write deduped
  const output = deduped.map(e => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(DELIVERED_PATH, output);

  console.log(`[dedup-delivered] Removed ${removed} duplicates: ${before} → ${after} entries`);
}

main();
