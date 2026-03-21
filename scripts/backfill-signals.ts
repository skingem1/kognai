#!/usr/bin/env npx ts-node
/**
 * backfill-signals.ts — Generate historical constitutional signals from AAR + failure data
 * Sprint 711: GOV Phase 3. Reads AAR logs + validation errors, identifies patterns,
 * generates backfill report to reports/constitution/backfill-YYYY-WNN.md,
 * extracts key signals to SIGNALS.md.
 *
 * Run: npx ts-node scripts/backfill-signals.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const AAR_DIR = path.join(ROOT, 'logs', 'aar');
const SIGNALS_PATH = path.join(ROOT, 'workspace', 'shared-context', 'SIGNALS.md');
const REPORTS_DIR = path.join(ROOT, 'reports', 'constitution');
const VAL_ERRORS_PATH = path.join(ROOT, 'workspace', 'scs001', 'validation-errors.jsonl');

interface AAREntry {
  agentId: string;
  taskId: string;
  sprintId: string;
  outcomeScore: number;
  actionSummary: string;
  status: string;
  timestamp: string;
}

interface Signal {
  theme: string;
  severity: string;
  description: string;
  evidence: string;
  count: number;
}

function loadAAR(): AAREntry[] {
  const entries: AAREntry[] = [];
  if (!fs.existsSync(AAR_DIR)) return entries;
  for (const file of fs.readdirSync(AAR_DIR).filter(f => f.endsWith('.jsonl')).sort()) {
    const lines = fs.readFileSync(path.join(AAR_DIR, file), 'utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try { entries.push(JSON.parse(line)); } catch { /* skip */ }
    }
  }
  return entries;
}

function loadValidationErrors(): any[] {
  if (!fs.existsSync(VAL_ERRORS_PATH)) return [];
  return fs.readFileSync(VAL_ERRORS_PATH, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function analyzePatterns(aar: AAREntry[], valErrors: any[]): Signal[] {
  const signals: Signal[] = [];

  // Pattern 1: Single-agent concentration
  const agentCounts = new Map<string, number>();
  for (const e of aar) {
    agentCounts.set(e.agentId, (agentCounts.get(e.agentId) || 0) + 1);
  }
  const dominant = Array.from(agentCounts.entries()).sort((a, b) => b[1] - a[1]);
  if (dominant.length > 0 && dominant[0][1] / aar.length > 0.8) {
    signals.push({
      theme: 'Governance',
      severity: 'MEDIUM',
      description: `Agent concentration: ${dominant[0][0]} handles ${Math.round(dominant[0][1] / aar.length * 100)}% of all tasks`,
      evidence: `${dominant[0][1]}/${aar.length} AAR entries from ${dominant[0][0]}`,
      count: dominant[0][1],
    });
  }

  // Pattern 2: Rejection rate
  const rejected = aar.filter(e => e.status === 'rejected');
  if (rejected.length > 0) {
    signals.push({
      theme: 'Safety',
      severity: rejected.length > 5 ? 'HIGH' : 'MEDIUM',
      description: `Task rejection rate: ${rejected.length}/${aar.length} (${Math.round(rejected.length / aar.length * 100)}%)`,
      evidence: rejected.map(r => `${r.sprintId}/${r.taskId}: ${r.actionSummary.substring(0, 60)}`).join('; '),
      count: rejected.length,
    });
  }

  // Pattern 3: Low scores
  const lowScores = aar.filter(e => e.outcomeScore < 60 && e.status === 'success');
  if (lowScores.length > 0) {
    signals.push({
      theme: 'Renewal',
      severity: 'MEDIUM',
      description: `Low-quality approvals: ${lowScores.length} tasks approved with score < 60`,
      evidence: lowScores.map(e => `${e.sprintId}/${e.taskId} (${e.outcomeScore}/100)`).join('; '),
      count: lowScores.length,
    });
  }

  // Pattern 4: Validation errors
  if (valErrors.length > 0) {
    signals.push({
      theme: 'Safety',
      severity: valErrors.length > 10 ? 'HIGH' : 'MEDIUM',
      description: `${valErrors.length} validation errors in pipeline`,
      evidence: `workspace/scs001/validation-errors.jsonl — ${valErrors.length} entries`,
      count: valErrors.length,
    });
  }

  // Pattern 5: Missing agent diversity
  if (agentCounts.size < 3 && aar.length > 10) {
    signals.push({
      theme: 'Solidarity',
      severity: 'LOW',
      description: `Low agent diversity: only ${agentCounts.size} unique agents in ${aar.length} tasks`,
      evidence: `Agents: ${Array.from(agentCounts.keys()).join(', ')}`,
      count: agentCounts.size,
    });
  }

  return signals;
}

function generateReport(signals: Signal[], aarCount: number, valErrorCount: number): string {
  const now = new Date();
  const weekId = `${now.getFullYear()}-W${String(Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7)).padStart(2, '0')}`;

  let report = `# Constitutional Signal Backfill Report — ${weekId}\n`;
  report += `*Generated: ${now.toISOString()} by backfill-signals.ts*\n\n`;
  report += `## Data Sources\n`;
  report += `- AAR log entries: ${aarCount}\n`;
  report += `- Validation errors: ${valErrorCount}\n`;
  report += `- Date range: All available historical data\n\n`;

  report += `## Signals Identified\n\n`;
  report += `| Theme | Severity | Description | Count |\n`;
  report += `|-------|----------|-------------|-------|\n`;
  for (const s of signals) {
    report += `| ${s.theme} | ${s.severity} | ${s.description} | ${s.count} |\n`;
  }

  report += `\n## Top 3 Recommendations\n\n`;
  const sorted = signals.sort((a, b) => {
    const severityOrder: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
  });
  for (let i = 0; i < Math.min(3, sorted.length); i++) {
    report += `${i + 1}. **${sorted[i].theme}** (${sorted[i].severity}): ${sorted[i].description}\n`;
    report += `   Evidence: ${sorted[i].evidence.substring(0, 200)}\n\n`;
  }

  if (signals.length === 0) {
    report += `*No significant signals detected from available data.*\n`;
  }

  return report;
}

function appendToSignals(signals: Signal[]): void {
  if (signals.length === 0) return;

  const now = new Date().toISOString();
  let entry = `\n## Backfill — ${now.slice(0, 10)}\n`;
  entry += `*Backfilled from historical AAR logs + validation errors*\n\n`;
  for (const s of signals.slice(0, 5)) {
    entry += `- **${s.severity}** [${s.theme}]: ${s.description}\n`;
  }

  fs.appendFileSync(SIGNALS_PATH, entry);
}

// ── Main ──

console.log('\n=== Constitutional Signal Backfill ===\n');

const aar = loadAAR();
const valErrors = loadValidationErrors();
console.log(`AAR entries: ${aar.length}`);
console.log(`Validation errors: ${valErrors.length}`);

const signals = analyzePatterns(aar, valErrors);
console.log(`Signals identified: ${signals.length}`);

for (const s of signals) {
  const icon = s.severity === 'CRITICAL' ? '🔴' : s.severity === 'HIGH' ? '🟠' : s.severity === 'MEDIUM' ? '🟡' : '🟢';
  console.log(`  ${icon} [${s.theme}] ${s.description}`);
}

// Write report
fs.mkdirSync(REPORTS_DIR, { recursive: true });
const now = new Date();
const weekId = `${now.getFullYear()}-W${String(Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7)).padStart(2, '0')}`;
const reportPath = path.join(REPORTS_DIR, `backfill-${weekId}.md`);
const report = generateReport(signals, aar.length, valErrors.length);
fs.writeFileSync(reportPath, report);
console.log(`\n📄 Report: ${reportPath}`);

// Append to SIGNALS.md
appendToSignals(signals);
console.log(`📝 Signals appended to SIGNALS.md`);

console.log('\n✅ Backfill complete.');
