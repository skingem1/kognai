/**
 * ab-test-assign.ts — A/B test assignment engine for SCS-001 videos
 *
 * Assigns template, hook formula, and music style to each video based on
 * weighted random selection. Weights start equal and are updated by
 * ab-test-analyze.ts after enough data is collected.
 *
 * Usage:
 *   npx tsx scripts/scs001/ab-test-assign.ts <video-id> [--topic "topic name"]
 *   npx tsx scripts/scs001/ab-test-assign.ts --batch 5
 *
 * Output: JSON assignment written to workspace/ab-tests/assignments.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';

const CONFIG_PATH = path.join(__dirname, '../../workspace/ab-tests/config.json');
const ASSIGNMENTS_PATH = path.join(__dirname, '../../workspace/ab-tests/assignments.jsonl');

interface Variant {
  id: string;
  label: string;
  weight: number;
}

interface Config {
  dimensions: Record<string, { variants: Variant[] }>;
  min_posts_for_analysis: number;
}

interface Assignment {
  video_id: string;
  topic: string;
  timestamp: string;
  assignments: Record<string, string>;
  metrics: Record<string, number | null>;
}

function loadConfig(): Config {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function weightedRandom(variants: Variant[]): string {
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  let r = Math.random() * totalWeight;
  for (const v of variants) {
    r -= v.weight;
    if (r <= 0) return v.id;
  }
  return variants[variants.length - 1].id;
}

function assign(videoId: string, topic: string): Assignment {
  const config = loadConfig();
  const assignments: Record<string, string> = {};

  for (const [dim, def] of Object.entries(config.dimensions)) {
    assignments[dim] = weightedRandom(def.variants);
  }

  return {
    video_id: videoId,
    topic,
    timestamp: new Date().toISOString(),
    assignments,
    metrics: { views: null, likes: null, comments: null, shares: null, retention_pct: null },
  };
}

function appendAssignment(assignment: Assignment): void {
  fs.appendFileSync(ASSIGNMENTS_PATH, JSON.stringify(assignment) + '\n');
}

function loadAssignments(): Assignment[] {
  if (!fs.existsSync(ASSIGNMENTS_PATH)) return [];
  return fs.readFileSync(ASSIGNMENTS_PATH, 'utf-8')
    .trim()
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l));
}

function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--batch') {
    const count = parseInt(args[1] || '5', 10);
    console.log(`Generating ${count} A/B test assignments...`);
    for (let i = 0; i < count; i++) {
      const id = `video-${Date.now()}-${i}`;
      const a = assign(id, 'batch-generated');
      appendAssignment(a);
      console.log(`  ${id}: template=${a.assignments.template}, hook=${a.assignments.hook_formula}, music=${a.assignments.music_style}`);
    }
    return;
  }

  if (args[0] === '--stats') {
    const all = loadAssignments();
    console.log(`Total assignments: ${all.length}`);
    const config = loadConfig();
    for (const dim of Object.keys(config.dimensions)) {
      const counts: Record<string, number> = {};
      for (const a of all) {
        const v = a.assignments[dim] || 'unknown';
        counts[v] = (counts[v] || 0) + 1;
      }
      console.log(`\n${dim}:`);
      for (const [v, c] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
        const pct = all.length > 0 ? Math.round((c / all.length) * 100) : 0;
        console.log(`  ${v}: ${c} (${pct}%)`);
      }
    }
    return;
  }

  if (args[0] === '--update-metrics') {
    // Update metrics for a video: --update-metrics <video-id> views=X likes=Y
    const videoId = args[1];
    const all = loadAssignments();
    const idx = all.findIndex(a => a.video_id === videoId);
    if (idx === -1) {
      console.error(`Video ${videoId} not found in assignments`);
      process.exit(1);
    }
    for (const arg of args.slice(2)) {
      const [key, val] = arg.split('=');
      if (key && val) {
        all[idx].metrics[key] = parseFloat(val);
      }
    }
    // Rewrite file
    fs.writeFileSync(ASSIGNMENTS_PATH, all.map(a => JSON.stringify(a)).join('\n') + '\n');
    console.log(`Updated metrics for ${videoId}`);
    return;
  }

  // Single assignment
  const videoId = args[0] || `video-${Date.now()}`;
  const topicIdx = args.indexOf('--topic');
  const topic = topicIdx >= 0 && args[topicIdx + 1] ? args[topicIdx + 1] : 'unspecified';

  const assignment = assign(videoId, topic);
  appendAssignment(assignment);

  console.log(JSON.stringify(assignment, null, 2));
  console.log(`\nAssignment saved to ${ASSIGNMENTS_PATH}`);
}

main();
