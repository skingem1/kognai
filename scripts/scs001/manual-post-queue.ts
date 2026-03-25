/**
 * manual-post-queue.ts — Sprint 1223
 * CLI tool to manage a manual post queue for TikTok videos.
 * Queue file: workspace/scs001/post-queue.jsonl
 * Commands: list, add <video_id> <title>, remove <video_id>, next
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../');
const QUEUE_FILE = path.join(ROOT, 'workspace', 'scs001', 'post-queue.jsonl');

interface QueueEntry {
  video_id: string;
  title: string;
  added_at: string;
  status: 'pending' | 'posted' | 'skipped';
}

function readQueue(): QueueEntry[] {
  if (!fs.existsSync(QUEUE_FILE)) return [];
  return fs.readFileSync(QUEUE_FILE, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function writeQueue(entries: QueueEntry[]) {
  fs.writeFileSync(QUEUE_FILE, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
}

function cmdList() {
  const entries = readQueue();
  const pending = entries.filter(e => e.status === 'pending');
  if (pending.length === 0) {
    console.log('Queue is empty.');
    return;
  }
  console.log(`\n=== Post Queue (${pending.length} pending) ===`);
  pending.forEach((e, i) => {
    console.log(`  ${i + 1}. [${e.video_id}] ${e.title} (added ${e.added_at.split('T')[0]})`);
  });
}

function cmdAdd(videoId: string, title: string) {
  const entries = readQueue();
  if (entries.some(e => e.video_id === videoId && e.status === 'pending')) {
    console.log(`Video ${videoId} is already in the queue.`);
    return;
  }
  entries.push({ video_id: videoId, title, added_at: new Date().toISOString(), status: 'pending' });
  writeQueue(entries);
  console.log(`Added ${videoId} "${title}" to queue.`);
}

function cmdRemove(videoId: string) {
  const entries = readQueue();
  const idx = entries.findIndex(e => e.video_id === videoId && e.status === 'pending');
  if (idx === -1) {
    console.log(`Video ${videoId} not found in pending queue.`);
    return;
  }
  entries[idx].status = 'skipped';
  writeQueue(entries);
  console.log(`Removed ${videoId} from queue.`);
}

function cmdNext() {
  const entries = readQueue();
  const next = entries.find(e => e.status === 'pending');
  if (!next) {
    console.log('No pending posts in queue.');
    return;
  }
  console.log(`\nNext to post:`);
  console.log(`  Video ID: ${next.video_id}`);
  console.log(`  Title:    ${next.title}`);
  console.log(`  Added:    ${next.added_at}`);
}

function main() {
  const [,, cmd, ...args] = process.argv;

  switch (cmd) {
    case 'list':
      cmdList();
      break;
    case 'add':
      if (args.length < 2) { console.log('Usage: add <video_id> <title>'); return; }
      cmdAdd(args[0], args.slice(1).join(' '));
      break;
    case 'remove':
      if (args.length < 1) { console.log('Usage: remove <video_id>'); return; }
      cmdRemove(args[0]);
      break;
    case 'next':
      cmdNext();
      break;
    default:
      console.log('Usage: manual-post-queue.ts <list|add|remove|next>');
      console.log('  list              — Show pending posts');
      console.log('  add <id> <title>  — Add a video to the queue');
      console.log('  remove <id>       — Remove a video from the queue');
      console.log('  next              — Show the next post to publish');
  }
}

main();
