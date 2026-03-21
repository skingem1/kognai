#!/usr/bin/env npx ts-node
/**
 * run-constitution-agent.ts — Weekly Constitution Agent runner
 * Sprint 709: GOV Phase 3. Collects signals from sprints + AAR logs,
 * routes through qwen3:14b ($0 local), writes weekly signal report.
 *
 * Run manually: npx ts-node scripts/run-constitution-agent.ts
 * PM2 cron: Sundays 18:00 (ecosystem.config.js)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { callOllama, ollamaIsAvailable } from './lib/ollama-client';

const ROOT = path.resolve(__dirname, '..');
const SIGNALS_PATH = path.join(ROOT, 'workspace', 'shared-context', 'SIGNALS.md');
const REPORTS_DIR = path.join(ROOT, 'reports', 'constitution');
const AAR_DIR = path.join(ROOT, 'logs', 'aar');
const SPRINTS_DIR = path.join(ROOT, 'workspace', 'sprints');

function getWeekId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const week = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function getDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function readRecentAAR(days: number = 7): string[] {
  const entries: string[] = [];
  const cutoff = getDateNDaysAgo(days);
  if (!fs.existsSync(AAR_DIR)) return entries;

  for (const file of fs.readdirSync(AAR_DIR).filter(f => f.endsWith('.jsonl')).sort()) {
    const date = file.replace('.jsonl', '');
    if (date < cutoff) continue;
    const lines = fs.readFileSync(path.join(AAR_DIR, file), 'utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        entries.push(`[${entry.sprintId}/${entry.taskId}] ${entry.status} (${entry.outcomeScore}/100): ${entry.actionSummary}`);
      } catch { /* skip */ }
    }
  }
  return entries;
}

function readRecentSprints(days: number = 7): string[] {
  const summaries: string[] = [];
  const cutoff = getDateNDaysAgo(days);
  if (!fs.existsSync(SPRINTS_DIR)) return summaries;

  // Use git log for recent sprint commits
  try {
    const since = cutoff;
    const log = execSync(`git log --oneline --since="${since}" --grep="Sprint" -- workspace/sprints/`, {
      cwd: ROOT, timeout: 10000, encoding: 'utf-8'
    }).trim();
    if (log) summaries.push(...log.split('\n'));
  } catch { /* ok */ }

  return summaries;
}

function readSignals(): string {
  try { return fs.readFileSync(SIGNALS_PATH, 'utf-8'); }
  catch { return ''; }
}

function buildPrompt(aarEntries: string[], sprintSummaries: string[], existingSignals: string): string {
  return `You are the Kognai Constitution Agent. Your job is to analyze the past week's swarm activity and identify constitutional signals.

## AAR Receipts (last 7 days)
${aarEntries.length > 0 ? aarEntries.join('\n') : 'No AAR entries this week.'}

## Sprint Activity (last 7 days)
${sprintSummaries.length > 0 ? sprintSummaries.join('\n') : 'No sprint commits this week.'}

## Existing Signals
${existingSignals || 'No existing signals.'}

## Your Task
1. Identify constitutional signals: violations, tensions, risks, solidarity gaps
2. Cluster by theme: Economic, Solidarity, Renewal, Safety, Governance
3. Rank by frequency × severity (CRITICAL, HIGH, MEDIUM, LOW)
4. For each signal: describe the pattern, cite evidence, suggest remediation

Output a markdown report with:
- Date range and summary stats
- Signals table (theme, severity, description, evidence)
- Top 3 recommendations
- Any proposed amendments to the Living Constitution

Keep it concise (under 500 words).`;
}

async function run(): Promise<void> {
  console.log('\n=== Constitution Agent — Weekly Signal Collection ===\n');

  const weekId = getWeekId();
  const reportPath = path.join(REPORTS_DIR, `${weekId}.md`);

  // Check if report already exists
  if (fs.existsSync(reportPath)) {
    console.log(`Report already exists for ${weekId}: ${reportPath}`);
    console.log('Skipping (run with --force to regenerate).');
    if (!process.argv.includes('--force')) return;
  }

  // Collect data
  const aarEntries = readRecentAAR(7);
  const sprintSummaries = readRecentSprints(7);
  const existingSignals = readSignals();

  console.log(`AAR entries: ${aarEntries.length}`);
  console.log(`Sprint summaries: ${sprintSummaries.length}`);
  console.log(`Existing signals: ${existingSignals.length} chars`);

  // Check Ollama
  const available = await ollamaIsAvailable();
  if (!available) {
    console.log('\n❌ Ollama not available. Cannot run Constitution Agent.');
    console.log('Start Ollama: ollama serve');
    process.exit(1);
  }

  // Build prompt and call model
  const prompt = buildPrompt(aarEntries, sprintSummaries, existingSignals);
  console.log(`\nRouting to qwen3:14b (local, $0)...`);

  const result = await callOllama({
    model: 'qwen3:14b',
    prompt,
    systemPrompt: 'You are the Kognai Constitution Agent. Output a concise markdown signal report.',
    maxTokens: 2000,
    temperature: 0.3,
  });

  console.log(`Model response: ${result.content.length} chars, ${result.evalCount} tokens`);

  // Write report
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const header = `# Constitutional Signal Report — ${weekId}\n*Generated: ${new Date().toISOString()} by Constitution Agent (qwen3:14b, $0)*\n\n`;
  fs.writeFileSync(reportPath, header + result.content);
  console.log(`\n📄 Report written to ${reportPath}`);

  // Append summary to SIGNALS.md
  const signalEntry = `\n## ${weekId}\n- Generated: ${new Date().toISOString()}\n- AAR entries: ${aarEntries.length}\n- Sprint activity: ${sprintSummaries.length}\n- Report: reports/constitution/${weekId}.md\n`;
  fs.appendFileSync(SIGNALS_PATH, signalEntry);
  console.log(`📝 Signal entry appended to SIGNALS.md`);

  console.log('\n✅ Constitution Agent run complete.');
}

run().catch(e => {
  console.error('Constitution Agent failed:', e.message);
  process.exit(1);
});
