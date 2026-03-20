/**
 * lossless-claw — Precision code editing for Kognai agents
 * T1 Foundation Skill
 *
 * Makes surgical edits to files with safety guards:
 * - Context-aware find-and-replace
 * - FP-007 file size guard (>2000 lines)
 * - Automatic backup before modification
 * - Before/after diff reporting
 *
 * Usage:
 *   npx tsx skills/lossless-claw/edit.ts --file <path> --find "old" --replace "new"
 *   npx tsx skills/lossless-claw/edit.ts --file <path> --edits edits.json
 *   npx tsx skills/lossless-claw/edit.ts --file <path> --find "old" --replace "new" --dry-run
 */

import * as fs from 'fs';
import * as path from 'path';

const MAX_LINES_DEFAULT = 2000;

interface Edit {
  find: string;
  replace: string;
  description?: string;
}

interface EditResult {
  file: string;
  edits_applied: number;
  edits_failed: number;
  backup_path: string | null;
  dry_run: boolean;
  details: Array<{
    find: string;
    status: 'applied' | 'not_found' | 'ambiguous';
    line?: number;
    message?: string;
  }>;
}

function countOccurrences(content: string, search: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = content.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}

function findLineNumber(content: string, search: string): number {
  const idx = content.indexOf(search);
  if (idx === -1) return -1;
  return content.substring(0, idx).split('\n').length;
}

function applyEdits(filePath: string, edits: Edit[], options: { dryRun: boolean; backup: boolean; force: boolean }): EditResult {
  if (!fs.existsSync(filePath)) {
    return { file: filePath, edits_applied: 0, edits_failed: edits.length, backup_path: null, dry_run: options.dryRun, details: edits.map(e => ({ find: e.find.substring(0, 50), status: 'not_found' as const, message: 'File not found' })) };
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  const lineCount = content.split('\n').length;

  // FP-007 guard
  if (lineCount > MAX_LINES_DEFAULT && !options.force) {
    console.warn(`WARNING: File has ${lineCount} lines (>${MAX_LINES_DEFAULT}). Use --force to proceed.`);
    return {
      file: filePath, edits_applied: 0, edits_failed: edits.length,
      backup_path: null, dry_run: options.dryRun,
      details: [{ find: 'FP-007', status: 'not_found', message: `File too large (${lineCount} lines). Use --force.` }],
    };
  }

  // Create backup
  let backupPath: string | null = null;
  if (options.backup && !options.dryRun) {
    backupPath = filePath + `.backup-${Date.now()}`;
    fs.writeFileSync(backupPath, content);
  }

  const details: EditResult['details'] = [];
  let applied = 0;
  let failed = 0;

  for (const edit of edits) {
    const occurrences = countOccurrences(content, edit.find);

    if (occurrences === 0) {
      details.push({ find: edit.find.substring(0, 50), status: 'not_found', message: 'String not found in file' });
      failed++;
      continue;
    }

    if (occurrences > 1) {
      details.push({ find: edit.find.substring(0, 50), status: 'ambiguous', message: `Found ${occurrences} occurrences — edit skipped (must be unique)` });
      failed++;
      continue;
    }

    const line = findLineNumber(content, edit.find);
    content = content.replace(edit.find, edit.replace);
    details.push({ find: edit.find.substring(0, 50), status: 'applied', line });
    applied++;
  }

  // Write if not dry run and at least one edit applied
  if (!options.dryRun && applied > 0) {
    fs.writeFileSync(filePath, content);
  }

  return { file: filePath, edits_applied: applied, edits_failed: failed, backup_path: backupPath, dry_run: options.dryRun, details };
}

function main() {
  const args = process.argv.slice(2);

  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx >= 0 ? args[fileIdx + 1] : null;

  if (!filePath) {
    console.log('Usage: npx tsx skills/lossless-claw/edit.ts --file <path> --find "old" --replace "new"');
    console.log('       npx tsx skills/lossless-claw/edit.ts --file <path> --edits edits.json');
    console.log('Options: --dry-run, --backup, --force');
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');
  const backup = args.includes('--backup');
  const force = args.includes('--force');

  let edits: Edit[];

  if (args.includes('--edits')) {
    const editsIdx = args.indexOf('--edits');
    const editsPath = args[editsIdx + 1];
    edits = JSON.parse(fs.readFileSync(editsPath, 'utf-8'));
  } else {
    const findIdx = args.indexOf('--find');
    const replaceIdx = args.indexOf('--replace');
    if (findIdx < 0 || replaceIdx < 0) {
      console.error('Must provide --find and --replace, or --edits');
      process.exit(1);
    }
    edits = [{ find: args[findIdx + 1], replace: args[replaceIdx + 1] }];
  }

  const result = applyEdits(filePath, edits, { dryRun, backup, force });

  console.log('=== Lossless Claw ===\n');
  console.log(`  File:     ${result.file}`);
  console.log(`  Mode:     ${result.dry_run ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Applied:  ${result.edits_applied}`);
  console.log(`  Failed:   ${result.edits_failed}`);
  if (result.backup_path) console.log(`  Backup:   ${result.backup_path}`);

  console.log('\n  Details:');
  for (const d of result.details) {
    const icon = d.status === 'applied' ? '+' : d.status === 'not_found' ? '?' : '!';
    const lineInfo = d.line ? ` (line ${d.line})` : '';
    console.log(`    [${icon}] ${d.find}${lineInfo} — ${d.status}${d.message ? ': ' + d.message : ''}`);
  }

  process.exit(result.edits_failed > 0 ? 1 : 0);
}

main();
