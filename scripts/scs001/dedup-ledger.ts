#!/usr/bin/env npx ts-node
/**
 * SCS-001 Ledger Dedup — Sprint 271
 *
 * Deduplicates publish-ledger.jsonl by video_id, keeping the LATEST entry
 * for each unique video. Writes a backup before modifying.
 *
 * Usage:
 *   npx ts-node scripts/scs001/dedup-ledger.ts
 *   DEDUP_DRY_RUN=1 npx ts-node scripts/scs001/dedup-ledger.ts
 *
 * Output:
 *   - Backup: workspace/scs001/publish-ledger.jsonl.bak
 *   - Deduped: workspace/scs001/publish-ledger.jsonl
 *   - Report: { before, after, removed, backup_path }
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const LEDGER_PATH = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const BACKUP_PATH = LEDGER_PATH + '.bak';
const DRY_RUN = process.env.DEDUP_DRY_RUN === '1';

interface LedgerEntry {
  video_id?: string;
  clip_id?: string;
  published_at?: string;
  run_id?: string;
  hook_formula?: string;
  speaker?: string;
  topic?: string;
  [key: string]: unknown;
}

function main(): void {
  console.log('=== SCS-001 Ledger Dedup — Sprint 271 ===\n');

  if (!fs.existsSync(LEDGER_PATH)) {
    console.log('No ledger file found at', LEDGER_PATH);
    process.exit(0);
  }

  const rawLines = fs.readFileSync(LEDGER_PATH, 'utf-8').split('\n').filter(l => l.trim());
  const entries: LedgerEntry[] = [];
  let parseErrors = 0;

  for (const line of rawLines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      parseErrors++;
    }
  }

  console.log(`Loaded: ${entries.length} entries (${parseErrors} parse errors)`);

  // Deduplicate by video_id, keeping the LATEST entry (by published_at or array order)
  const seen = new Map<string, LedgerEntry>();
  for (const entry of entries) {
    const id = entry.video_id || entry.clip_id || '';
    if (!id) continue;

    const existing = seen.get(id);
    if (!existing) {
      seen.set(id, entry);
    } else {
      // Keep the one with later published_at, or the later array entry
      const existingDate = existing.published_at || '';
      const newDate = entry.published_at || '';
      if (newDate >= existingDate) {
        seen.set(id, entry);
      }
    }
  }

  const deduped = Array.from(seen.values());
  const removed = entries.length - deduped.length;

  console.log(`Unique: ${deduped.length}`);
  console.log(`Duplicates removed: ${removed}`);

  if (removed === 0) {
    console.log('\n✅ No duplicates found.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n[DRY_RUN] Would write deduped ledger. Skipping.');
    return;
  }

  // Backup
  fs.copyFileSync(LEDGER_PATH, BACKUP_PATH);
  console.log(`Backup: ${BACKUP_PATH}`);

  // Write deduped
  const output = deduped.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(LEDGER_PATH, output);
  console.log(`Written: ${deduped.length} entries to ${LEDGER_PATH}`);

  console.log(`\n✅ Dedup complete: ${entries.length} → ${deduped.length} (removed ${removed})`);
}

main();
