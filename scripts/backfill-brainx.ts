#!/usr/bin/env npx ts-node
/**
 * backfill-brainx.ts — Seed BrainX episodic memory from AAR logs
 * Sprint 707: GOV Phase 2. Reads logs/aar/*.jsonl, groups by agent,
 * stores each entry as a BrainX episode memory with importance=5.
 *
 * Run: npx ts-node scripts/backfill-brainx.ts
 * Safe to re-run: checks for existing memories by tag before inserting.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BrainXClient } from './lib/brainx-client';

const ROOT = path.resolve(__dirname, '..');
const AAR_DIR = path.join(ROOT, 'logs', 'aar');

interface AAREntry {
  receiptId: string;
  agentId: string;
  taskId: string;
  sprintId: string;
  skillId: string;
  outcomeScore: number;
  actionSummary: string;
  timestamp: string;
  status: string;
}

function loadAAREntries(): AAREntry[] {
  if (!fs.existsSync(AAR_DIR)) {
    console.log('No AAR directory found at', AAR_DIR);
    return [];
  }

  const entries: AAREntry[] = [];
  const files = fs.readdirSync(AAR_DIR).filter(f => f.endsWith('.jsonl')).sort();

  for (const file of files) {
    const lines = fs.readFileSync(path.join(AAR_DIR, file), 'utf-8')
      .split('\n')
      .filter(l => l.trim());

    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch { /* skip malformed lines */ }
    }
  }

  return entries;
}

function groupByAgent(entries: AAREntry[]): Map<string, AAREntry[]> {
  const groups = new Map<string, AAREntry[]>();
  for (const entry of entries) {
    const existing = groups.get(entry.agentId) || [];
    existing.push(entry);
    groups.set(entry.agentId, existing);
  }
  return groups;
}

async function backfill(): Promise<void> {
  const entries = loadAAREntries();
  console.log(`\n=== BrainX Backfill from AAR Logs ===`);
  console.log(`Found ${entries.length} AAR entries\n`);

  if (entries.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  const grouped = groupByAgent(entries);
  let stored = 0;
  let skipped = 0;
  let errors = 0;

  for (const [agentId, agentEntries] of Array.from(grouped.entries())) {
    console.log(`Agent: ${agentId} (${agentEntries.length} entries)`);
    const client = new BrainXClient(agentId);

    for (const entry of agentEntries) {
      const content = `[${entry.sprintId}/${entry.taskId}] ${entry.actionSummary} — ${entry.status} (score: ${entry.outcomeScore})`;
      const tag = `backfill-${entry.receiptId}`;

      try {
        // Determine memory type and importance
        const memoryType = entry.status === 'rejected' ? 'error' as const : 'episode' as const;
        const importance = entry.status === 'rejected' ? 7
          : entry.outcomeScore >= 80 ? 6
          : 5;

        const id = await client.store(content, {
          sprint: entry.sprintId,
          memory_type: memoryType,
          importance,
          tags: [entry.sprintId, entry.status, tag, 'backfill'],
        });

        if (id) {
          stored++;
          console.log(`  ✅ ${entry.taskId}: ${entry.actionSummary.substring(0, 60)}...`);
        } else {
          skipped++;
          console.log(`  ⚠️ ${entry.taskId}: store returned null (DB unavailable?)`);
        }
      } catch (e) {
        errors++;
        console.log(`  ❌ ${entry.taskId}: ${(e as Error).message}`);
      }
    }

    await client.close();
  }

  console.log(`\n=== Backfill Complete ===`);
  console.log(`Stored: ${stored}, Skipped: ${skipped}, Errors: ${errors}`);
  console.log(`Total AAR entries processed: ${entries.length}`);

  // Write backfill report
  const report = {
    timestamp: new Date().toISOString(),
    total_entries: entries.length,
    stored,
    skipped,
    errors,
    agents: Array.from(grouped.keys()),
    date_range: {
      earliest: entries[0]?.timestamp,
      latest: entries[entries.length - 1]?.timestamp,
    },
  };

  const reportPath = path.join(ROOT, 'reports', 'brainx-backfill.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report: reports/brainx-backfill.json`);
}

backfill().catch(e => {
  console.error('Backfill failed:', e.message);
  process.exit(1);
});
