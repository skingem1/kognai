/**
 * register-v2-to-ledger.ts — Sprint 893
 *
 * Scans workspace/scs001/v2-output/ for completed v2 videos and
 * registers them in publish-ledger.jsonl so /pickup can find them.
 *
 * Usage:
 *   npx ts-node scripts/scs001/register-v2-to-ledger.ts
 */

import { readdirSync, readFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const V2_DIR = join(ROOT, 'workspace', 'scs001', 'v2-output');
const LEDGER = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');

// Load existing ledger IDs to avoid duplicates
function loadExistingIds(): Set<string> {
  const ids = new Set<string>();
  if (!existsSync(LEDGER)) return ids;
  for (const line of readFileSync(LEDGER, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.video_id) ids.add(e.video_id);
    } catch {}
  }
  return ids;
}

function run(): void {
  const existing = loadExistingIds();
  const dirs = readdirSync(V2_DIR).filter(d => d.startsWith('v2-'));
  let registered = 0;

  for (const vid of dirs) {
    if (existing.has(vid)) {
      console.log(`  skip: ${vid} (already in ledger)`);
      continue;
    }

    const dir = join(V2_DIR, vid);
    const mp4 = join(dir, `${vid}.mp4`);
    const metaPath = join(dir, 'metadata.json');

    if (!existsSync(mp4)) {
      console.log(`  skip: ${vid} (no MP4 file)`);
      continue;
    }

    // Read metadata if available
    let meta: any = {};
    if (existsSync(metaPath)) {
      try { meta = JSON.parse(readFileSync(metaPath, 'utf-8')); } catch {}
    }

    // Read scenario from v2-runs if metadata doesn't have title
    let title = meta.title || '';
    if (!title) {
      // Try to find matching run
      const runsDir = join(ROOT, 'workspace', 'scs001', 'v2-runs');
      if (existsSync(runsDir)) {
        for (const run of readdirSync(runsDir)) {
          const resultPath = join(runsDir, run, 'result.json');
          if (existsSync(resultPath)) {
            try {
              const result = JSON.parse(readFileSync(resultPath, 'utf-8'));
              if (result.scenario?.title && result.video?.video_id === vid) {
                title = result.scenario.title;
                break;
              }
            } catch {}
          }
        }
      }
    }

    const entry = {
      clip_id: vid,
      video_id: vid,
      published_at: meta.created_at || new Date().toISOString(),
      run_id: vid,
      hook_formula: 'v2-scorsese',
      speaker: meta.speaker_name || 'Kognai',
      topic: title || vid,
      source: 'v2-pipeline',
      format: 'v2-cinematic',
      video_path: mp4,
      srt_path: '',
      duration_s: meta.duration_seconds || 30,
      llm_used: true,
    };

    appendFileSync(LEDGER, JSON.stringify(entry) + '\n');
    registered++;
    console.log(`  registered: ${vid} — "${title || 'untitled'}" (${entry.duration_s}s)`);
  }

  console.log(`\nDone: ${registered} new videos registered, ${dirs.length - registered} skipped`);
}

run();
