#!/usr/bin/env npx ts-node
/**
 * lora-corpus-extract.ts — Sprint 690 (AMD-15 Phase 1)
 *
 * Extracts approved tasks from sprint history into instruction-response pairs
 * for LoRA fine-tuning. Constitutional filter applied per AMD-15 §2.
 *
 * Output: vault/training/corpus-r1.jsonl
 *
 * Usage:
 *   npx ts-node scripts/lora-corpus-extract.ts
 *   npx ts-node scripts/lora-corpus-extract.ts --dry-run   # preview without writing
 *   npx ts-node scripts/lora-corpus-extract.ts --stats      # show stats only
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const ROOT = process.cwd();
const SPRINTS_DIR = join(ROOT, 'workspace', 'sprints');
const OUTPUT_DIR = join(ROOT, 'vault', 'training');
const OUTPUT_PATH = join(OUTPUT_DIR, 'corpus-r1.jsonl');
const META_PATH = join(OUTPUT_DIR, 'corpus-r1-meta.json');

const DRY_RUN = process.argv.includes('--dry-run');
const STATS_ONLY = process.argv.includes('--stats');

// ── Constitutional Filter (AMD-15 §2) ────────────────────────────

const EXCLUDED_KEYWORDS = [
  'credential', 'secret', 'token', 'password', 'api_key', 'apikey',
  'private_key', 'ssh_key', '.env', 'wallet_key',
];

const EXCLUDED_TASK_TYPES = [
  'failure-library', 'failure_library',
];

const SOVEREIGNTY_VIOLATIONS = [
  'override constitution', 'bypass safety', 'skip review', 'disable guard',
  'remove constraint', 'ignore policy',
];

interface SprintTask {
  id: string;
  title?: string;
  description?: string;
  context?: string;
  type?: string;
  task_type?: string;
  task_target?: string;
  status?: string;
  agent?: string;
  acceptance_criteria?: string;
  deliverables?: any;
  sprint_id?: string;
}

interface SprintFile {
  sprint_id: string;
  title?: string;
  description?: string;
  tasks?: SprintTask[];
  goal?: string;
  status?: string;
}

interface CorpusEntry {
  instruction: string;
  response: string;
  metadata: {
    sprint_id: string;
    task_id: string;
    task_type: string;
    agent: string;
    source_file: string;
  };
}

function containsExcluded(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some(p => lower.includes(p));
}

function passesConstitutionalFilter(task: SprintTask, sprint: SprintFile): boolean {
  // Must be done/complete
  const status = (task.status || '').toLowerCase();
  if (status !== 'done' && status !== 'complete') return false;

  // Combine all text for keyword screening
  const allText = [
    task.title, task.description, task.context,
    task.task_target, task.acceptance_criteria,
    sprint.title, sprint.description,
  ].filter(Boolean).join(' ');

  // Exclude credential/secret tasks
  if (containsExcluded(allText, EXCLUDED_KEYWORDS)) return false;

  // Exclude failure library items
  if (task.task_type && EXCLUDED_TASK_TYPES.includes(task.task_type)) return false;
  if (task.type === 'failure-library') return false;

  // Exclude sovereignty violations
  if (containsExcluded(allText, SOVEREIGNTY_VIOLATIONS)) return false;

  return true;
}

function buildInstruction(task: SprintTask, sprint: SprintFile): string {
  const parts: string[] = [];

  if (sprint.title) parts.push(`Sprint: ${sprint.title}`);
  if (task.title) parts.push(`Task: ${task.title}`);
  if (task.description) parts.push(`Description: ${task.description}`);
  if (task.context) {
    // Truncate long contexts (some are >2000 chars)
    const ctx = task.context.length > 500 ? task.context.slice(0, 500) + '...' : task.context;
    parts.push(`Context: ${ctx}`);
  }
  if (task.acceptance_criteria) parts.push(`Acceptance: ${task.acceptance_criteria}`);

  return parts.join('\n');
}

function buildResponse(task: SprintTask, sprint: SprintFile): string {
  const parts: string[] = [];

  parts.push(`Task ${task.id} completed successfully.`);
  if (task.task_target) parts.push(`Target: ${task.task_target}`);
  if (task.type) parts.push(`Type: ${task.type}`);
  if (task.agent) parts.push(`Agent: ${task.agent}`);

  // Include deliverables if available
  if (task.deliverables) {
    if (task.deliverables.code) {
      parts.push(`Files: ${(task.deliverables.code as string[]).join(', ')}`);
    }
    if (task.deliverables.review) {
      parts.push(`Review: ${task.deliverables.review}`);
    }
  }

  return parts.join('\n');
}

async function main() {
  console.log('\n=== AMD-15 LoRA Training Data Pipeline ===\n');

  // Load all sprint files
  const files = readdirSync(SPRINTS_DIR)
    .filter(f => f.startsWith('sprint-') && f.endsWith('.json'))
    .sort();

  console.log(`Found ${files.length} sprint files`);

  const corpus: CorpusEntry[] = [];
  let totalTasks = 0;
  let filteredOut = 0;
  const filterReasons: Record<string, number> = {};

  for (const file of files) {
    try {
      const raw = readFileSync(join(SPRINTS_DIR, file), 'utf-8');
      const sprint: SprintFile = JSON.parse(raw);

      if (!sprint.tasks || !Array.isArray(sprint.tasks)) continue;

      for (const task of sprint.tasks) {
        totalTasks++;

        if (!passesConstitutionalFilter(task, sprint)) {
          filteredOut++;
          const status = (task.status || 'unknown').toLowerCase();
          if (status !== 'done' && status !== 'complete') {
            filterReasons['not-done'] = (filterReasons['not-done'] || 0) + 1;
          } else {
            filterReasons['excluded-content'] = (filterReasons['excluded-content'] || 0) + 1;
          }
          continue;
        }

        const instruction = buildInstruction(task, sprint);
        const response = buildResponse(task, sprint);

        if (instruction.length < 20 || response.length < 10) {
          filteredOut++;
          filterReasons['too-short'] = (filterReasons['too-short'] || 0) + 1;
          continue;
        }

        corpus.push({
          instruction,
          response,
          metadata: {
            sprint_id: sprint.sprint_id || file.replace('.json', ''),
            task_id: task.id || 'unknown',
            task_type: task.task_type || task.type || 'unknown',
            agent: task.agent || 'unknown',
            source_file: file,
          },
        });
      }
    } catch {
      // Skip malformed files silently
    }
  }

  // Stats
  console.log(`\nTotal tasks scanned: ${totalTasks}`);
  console.log(`Approved (passed filter): ${corpus.length}`);
  console.log(`Filtered out: ${filteredOut}`);
  for (const [reason, count] of Object.entries(filterReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${reason}: ${count}`);
  }

  // Task type distribution
  const typeDistrib: Record<string, number> = {};
  for (const entry of corpus) {
    const t = entry.metadata.task_type;
    typeDistrib[t] = (typeDistrib[t] || 0) + 1;
  }
  console.log('\nTask type distribution:');
  for (const [type, count] of Object.entries(typeDistrib).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${type}: ${count}`);
  }

  if (STATS_ONLY) return;

  // Write corpus
  const jsonlContent = corpus.map(e => JSON.stringify(e)).join('\n') + '\n';
  const sha256 = createHash('sha256').update(jsonlContent).digest('hex');

  if (!DRY_RUN) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(OUTPUT_PATH, jsonlContent, 'utf-8');

    const meta = {
      generated_at: new Date().toISOString(),
      corpus_file: 'corpus-r1.jsonl',
      total_entries: corpus.length,
      total_tasks_scanned: totalTasks,
      filtered_out: filteredOut,
      sha256,
      filter_reasons: filterReasons,
      type_distribution: typeDistrib,
      amd15_version: 'r1',
      note: 'Phase 1 — data pipeline only, no fine-tuning',
    };
    writeFileSync(META_PATH, JSON.stringify(meta, null, 2), 'utf-8');

    console.log(`\n✅ Corpus written: ${OUTPUT_PATH}`);
    console.log(`   Entries: ${corpus.length}`);
    console.log(`   SHA-256: ${sha256}`);
    console.log(`   Meta: ${META_PATH}`);
  } else {
    console.log(`\n[DRY RUN] Would write ${corpus.length} entries to ${OUTPUT_PATH}`);
    console.log(`   SHA-256: ${sha256}`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
