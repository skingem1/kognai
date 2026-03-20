// SCS-001 Pipeline Deduplication Ledger
// Append-only JSONL tracking published clip_ids across runs
// Prevents the same clip from being published multiple times

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

export interface LedgerEntry {
  clip_id:       string;
  video_id:      string;
  published_at:  string;
  run_id:        string;
  hook_formula?: string;
  speaker?:      string;
  topic?:        string;
}

const DEFAULT_PATH = join(process.cwd(), 'workspace', 'scs001', 'publish-ledger.jsonl');

export class DedupLedger {
  private ledgerPath: string;

  constructor(ledgerPath?: string) {
    this.ledgerPath = ledgerPath ?? DEFAULT_PATH;
  }

  loadPublished(): Set<string> {
    if (!existsSync(this.ledgerPath)) return new Set();

    const ids = new Set<string>();
    try {
      const data = readFileSync(this.ledgerPath, 'utf-8');
      for (const line of data.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const entry = JSON.parse(trimmed) as LedgerEntry;
          // Sprint 299: Track both clip_id and video_id to catch all duplicates
          if (entry.clip_id) ids.add(entry.clip_id);
          if (entry.video_id && entry.video_id !== entry.clip_id) ids.add(entry.video_id);
        } catch {
          console.warn('[DedupLedger] Skipping corrupt ledger line');
        }
      }
    } catch (err) {
      console.warn('[DedupLedger] Failed to read ledger: ' + (err as Error).message);
    }
    return ids;
  }

  recordPublished(entries: LedgerEntry[]): void {
    if (entries.length === 0) return;
    const dir = dirname(this.ledgerPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    appendFileSync(this.ledgerPath, lines, 'utf-8');
    console.log('[DedupLedger] Recorded ' + entries.length + ' published clips');
  }

  filterNewClips<T extends { clip_id: string }>(clips: T[]): T[] {
    const published = this.loadPublished();
    const newClips = clips.filter(c => !published.has(c.clip_id));
    const skipped = clips.length - newClips.length;
    console.log('[DedupLedger] ' + clips.length + ' clips in, ' + newClips.length + ' new, ' + skipped + ' already published (skipped)');
    return newClips;
  }
}
