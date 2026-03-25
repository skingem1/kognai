/**
 * queue-fill.ts — Sprint 1225
 * Reads export-manifest.txt and populates post-queue.jsonl with unqueued videos.
 * Skips videos already in the queue or already posted (manual-posts.jsonl).
 * Usage: npx ts-node scripts/scs001/queue-fill.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../');
const MANIFEST = path.join(ROOT, 'workspace', 'scs001', 'export-manifest.txt');
const QUEUE_FILE = path.join(ROOT, 'workspace', 'scs001', 'post-queue.jsonl');
const MANUAL_POSTS = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');

interface ManifestEntry {
  id: string;
  file: string;
  score: string;
  caption: string;
}

function parseManifest(): ManifestEntry[] {
  if (!fs.existsSync(MANIFEST)) return [];
  const text = fs.readFileSync(MANIFEST, 'utf-8');
  const entries: ManifestEntry[] = [];
  let current: Partial<ManifestEntry> = {};

  for (const line of text.split('\n')) {
    if (line.startsWith('ID: ')) current.id = line.slice(4).trim();
    else if (line.startsWith('File: ')) current.file = line.slice(6).trim();
    else if (line.startsWith('Score: ')) current.score = line.slice(7).trim();
    else if (line.startsWith('Caption:')) current.caption = '';
    else if (line.startsWith('After posting:') && current.id) {
      entries.push(current as ManifestEntry);
      current = {};
    } else if ('caption' in current && current.caption !== undefined && !line.startsWith('---') && !line.startsWith('#')) {
      current.caption = (current.caption + '\n' + line).trim();
    }
  }
  return entries;
}

function readJsonLines(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

export function queueFill(): { added: number; skipped: number; total: number; details: string[] } {
  const manifest = parseManifest();
  const existingQueue = readJsonLines(QUEUE_FILE);
  const existingPosts = readJsonLines(MANUAL_POSTS);

  const queuedIds = new Set(existingQueue.map(e => e.video_id));
  const postedIds = new Set(existingPosts.map(e => e.video_id));

  let added = 0;
  let skipped = 0;
  const details: string[] = [];

  for (const entry of manifest) {
    if (queuedIds.has(entry.id) || postedIds.has(entry.id)) {
      skipped++;
      details.push(`⏭️ ${entry.id} (already ${queuedIds.has(entry.id) ? 'queued' : 'posted'})`);
      continue;
    }

    const caption = entry.caption?.split('\n')[0] || `Video ${entry.id}`;
    const queueEntry = {
      video_id: entry.id,
      title: caption,
      file: entry.file,
      score: entry.score,
      added_at: new Date().toISOString(),
      status: 'pending',
    };

    fs.appendFileSync(QUEUE_FILE, JSON.stringify(queueEntry) + '\n');
    added++;
    details.push(`✅ ${entry.id} — ${caption.slice(0, 50)}`);
  }

  return { added, skipped, total: manifest.length, details };
}

// CLI mode
if (require.main === module) {
  const result = queueFill();
  console.log(`\n=== Queue Fill ===`);
  console.log(`Manifest entries: ${result.total}`);
  console.log(`Added to queue: ${result.added}`);
  console.log(`Skipped: ${result.skipped}`);
  if (result.details.length > 0) {
    console.log('\nDetails:');
    result.details.forEach(d => console.log(`  ${d}`));
  }
}
