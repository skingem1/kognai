// Sprint 1185: Achiri memory subsystem validator
// Usage: npx ts-node --transpile-only scripts/achiri/memory-test.ts
//
// Validates workspace/achiri/memory/*.jsonl schema and reports:
//  - Total entry count across all files
//  - Per-user file: entry count, last entry date, role balance, structure validity
//  - PASS / FAIL verdict

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const MEMORY_DIR = path.join(ROOT, 'workspace', 'achiri', 'memory');

interface MemoryEntry {
  role: string;
  content: string;
  timestamp?: string;
  [key: string]: unknown;
}

interface FileReport {
  file: string;
  userId: string;
  entryCount: number;
  validEntries: number;
  invalidEntries: number;
  roles: Record<string, number>;
  lastTimestamp: string | null;
  errors: string[];
  pass: boolean;
}

const VALID_ROLES = new Set(['user', 'assistant', 'system']);

function validateEntry(raw: unknown, idx: number): { valid: boolean; error?: string } {
  if (typeof raw !== 'object' || raw === null) return { valid: false, error: `entry ${idx}: not an object` };
  const e = raw as Record<string, unknown>;
  if (typeof e.role !== 'string') return { valid: false, error: `entry ${idx}: missing/invalid 'role'` };
  if (!VALID_ROLES.has(e.role)) return { valid: false, error: `entry ${idx}: unknown role '${e.role}'` };
  if (typeof e.content !== 'string') return { valid: false, error: `entry ${idx}: missing/invalid 'content'` };
  return { valid: true };
}

function analyzeFile(filePath: string): FileReport {
  const fileName = path.basename(filePath);
  const userId = fileName.replace('.jsonl', '');
  const report: FileReport = {
    file: fileName, userId,
    entryCount: 0, validEntries: 0, invalidEntries: 0,
    roles: {}, lastTimestamp: null, errors: [], pass: false,
  };

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (e: any) {
    report.errors.push(`read error: ${e.message}`);
    return report;
  }

  const lines = raw.trim().split('\n').filter(l => l.trim());
  report.entryCount = lines.length;

  for (let i = 0; i < lines.length; i++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[i]);
    } catch {
      report.invalidEntries++;
      report.errors.push(`line ${i + 1}: JSON parse error`);
      continue;
    }
    const result = validateEntry(parsed, i + 1);
    if (!result.valid) {
      report.invalidEntries++;
      if (result.error) report.errors.push(result.error);
    } else {
      report.validEntries++;
      const e = parsed as MemoryEntry;
      report.roles[e.role] = (report.roles[e.role] ?? 0) + 1;
      if (e.timestamp && (!report.lastTimestamp || e.timestamp > report.lastTimestamp)) {
        report.lastTimestamp = e.timestamp;
      }
    }
  }

  report.pass = report.invalidEntries === 0 && report.entryCount > 0;
  return report;
}

function run(): void {
  if (!fs.existsSync(MEMORY_DIR)) {
    console.log('❌ FAIL — memory directory not found:', MEMORY_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.jsonl')).sort();
  if (files.length === 0) {
    console.log('⚠️  No memory files found in', MEMORY_DIR);
    process.exit(0);
  }

  console.log(`\n🧠 Achiri Memory Subsystem Validator`);
  console.log(`   Directory: ${MEMORY_DIR}`);
  console.log(`   Files: ${files.length}\n`);

  const reports: FileReport[] = files.map(f => analyzeFile(path.join(MEMORY_DIR, f)));

  let totalEntries = 0;
  let failCount = 0;

  for (const r of reports) {
    totalEntries += r.entryCount;
    const icon = r.pass ? '✅' : r.entryCount === 0 ? '⚠️ ' : '❌';
    const roleStr = Object.entries(r.roles).map(([k, v]) => `${k}:${v}`).join(' ');
    const tsStr = r.lastTimestamp ? ` · last: ${r.lastTimestamp.slice(0, 10)}` : '';
    const errStr = r.errors.length > 0 ? ` · ⚠️ ${r.errors.slice(0, 2).join(', ')}` : '';
    console.log(`${icon} ${r.userId.slice(0, 30).padEnd(30)} ${String(r.entryCount).padStart(4)} entries  [${roleStr}]${tsStr}${errStr}`);
    if (!r.pass) failCount++;
  }

  const realFiles = reports.filter(r => !r.userId.startsWith('e2e-') && !r.userId.startsWith('validate-') && !r.userId.startsWith('smoke-') && r.userId !== 'tarek-test' && r.userId !== 'tarek_test_114');
  const realUserCount = realFiles.length;
  const realEntries = realFiles.reduce((s, r) => s + r.entryCount, 0);

  console.log(`\n📊 Summary:`);
  console.log(`   Total files:    ${files.length}`);
  console.log(`   Total entries:  ${totalEntries}`);
  console.log(`   Real users:     ${realUserCount} (${realEntries} entries)`);
  console.log(`   Test/e2e files: ${files.length - realUserCount}`);
  console.log(`   Failures:       ${failCount}`);
  console.log('');

  if (failCount === 0) {
    console.log('✅ PASS — all memory files valid');
  } else {
    console.log(`❌ FAIL — ${failCount} file(s) have schema errors`);
    process.exit(1);
  }
}

run();
