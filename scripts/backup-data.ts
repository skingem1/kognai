#!/usr/bin/env npx ts-node
/**
 * backup-data.ts — Sprint 1288
 * Creates a timestamped tarball of key workspace data files and writes
 * workspace/backup-status.json so /health can show last backup time.
 * Run manually or via PM2 cron (kognai-daily-backup).
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const BACKUP_DIR = path.join(process.env.HOME || '/tmp', '.kognai-backups');
const STATUS_PATH = path.join(ROOT, 'workspace', 'backup-status.json');

const FILES_TO_BACKUP = [
  'workspace/scs001/publish-ledger.jsonl',
  'workspace/scs001/archived-videos.json',
  'workspace/scs001/auto-delivered.jsonl',
  'reports/stats-latest.json',
  'reports/posting-health.json',
  'reports/token-health.json',
  'data/telegram-bot-offset.txt',
];

function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const tarName = `kognai-backup-${ts}.tar.gz`;
  const tarPath = path.join(BACKUP_DIR, tarName);

  // Ensure backup dir exists
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // Build file list (only existing files)
  const existing = FILES_TO_BACKUP.filter(f => fs.existsSync(path.join(ROOT, f)));
  if (existing.length === 0) {
    console.log('No data files found to back up.');
    return;
  }

  // Create tarball
  const fileArgs = existing.map(f => `"${f}"`).join(' ');
  execSync(`tar -czf "${tarPath}" -C "${ROOT}" ${fileArgs}`, { encoding: 'utf-8' });
  const sizeMb = (fs.statSync(tarPath).size / 1024 / 1024).toFixed(2);

  // Prune old backups (keep last 7)
  const allBackups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('kognai-backup-') && f.endsWith('.tar.gz'))
    .sort();
  if (allBackups.length > 7) {
    for (const old of allBackups.slice(0, allBackups.length - 7)) {
      fs.unlinkSync(path.join(BACKUP_DIR, old));
    }
  }

  // Write status
  const status = {
    last_backup: new Date().toISOString(),
    files_backed_up: existing.length,
    archive: tarPath,
    size_mb: parseFloat(sizeMb),
    backup_dir: BACKUP_DIR,
    kept_backups: Math.min(allBackups.length, 7),
  };
  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2));

  console.log(`✅ Backup complete: ${tarPath} (${sizeMb} MB, ${existing.length} files)`);
  console.log(`   Status written: ${STATUS_PATH}`);
}

try {
  main();
} catch (err: any) {
  console.error(`❌ Backup failed: ${err.message}`);
  // Still write status so /health shows the failure
  try {
    fs.writeFileSync(STATUS_PATH, JSON.stringify({
      last_backup: null,
      error: err.message,
      attempted_at: new Date().toISOString(),
    }, null, 2));
  } catch { /* ignore */ }
  process.exit(1);
}
