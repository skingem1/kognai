// OMEL Wipe Witness — Sprint 178 + Sprint 183 Hardening (AMD-13)
// Detection layer for destructive agent writes and file deletions.
// Would have caught Sprint 171 qwen3:14b 2800-line file rewrites.
//
// Public API:
//   beforeWrite(filePath, agentId) → WitnessToken  (SHA-256 + size before write)
//   afterWrite(token, newSizeBytes) → void           (shrink alert if new < 50% old)
//   beforeDelete(filePath, agentId) → void            (log deletion event)
//   getShrinkAlerts() → ShrinkAlert[]
//   rollback(filePath, stepsBack?) → boolean          (Sprint 183)
//   integrityReport(scanDir) → IntegrityReport        (Sprint 183)
//
// Sprint 183 hardening additions:
//   - Last-3-state rollback: restore file to any of last 3 pre-write states
//   - Auto-rollback on ShrinkAlert unless WIPE_WITNESS_NO_ROLLBACK=true
//   - Nightly integrity report: scan agent files vs last known hashes
//   - run-swarm.sh integration: pre-run snapshot + post-run drift report
//
// Audit log: logs/omel/wipe-witness-YYYY-MM-DD.jsonl
// Telegram:  TELEGRAM_BOT_TOKEN / OWNER_TELEGRAM_CHAT_ID (fire-and-forget)

import * as fs          from 'fs';
import * as path        from 'path';
import * as https       from 'https';
import { createHash }   from 'crypto';
import * as os          from 'os';

const LOGS_DIR     = path.join(__dirname, '..', '..', '..', 'logs', 'omel');
const SNAPSHOTS_DIR = path.join(LOGS_DIR, 'wipe-witness-snapshots');
const HASHES_FILE   = path.join(LOGS_DIR, 'wipe-witness-hashes.json');

fs.mkdirSync(LOGS_DIR,      { recursive: true });
fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

const LOG_FILE = (): string => {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOGS_DIR, `wipe-witness-${date}.jsonl`);
};

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface WitnessToken {
  filePath:     string;
  agentId:      string;
  oldHash:      string;   // SHA-256 of file before write, '' if new file
  oldSizeBytes: number;   // 0 if new file
  createdAt:    string;   // ISO timestamp
  snapshotKey?: string;   // Key into rollback snapshot store
}

export interface ShrinkAlert {
  filePath:     string;
  agentId:      string;
  oldSizeBytes: number;
  newSizeBytes: number;
  ratio:        number;   // newSizeBytes / oldSizeBytes (< 0.5 triggers alert)
  ts:           string;   // ISO timestamp
  rolledBack?:  boolean;  // true if auto-rollback was performed
}

export interface IntegrityReport {
  ts:           string;
  scan_dir:     string;
  total_files:  number;
  drifted:      Array<{ file: string; old_hash: string; new_hash: string }>;
  new_files:    string[];
  deleted_files: string[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function appendLog(entry: object): void {
  try {
    fs.appendFileSync(LOG_FILE(), JSON.stringify(entry) + '\n');
  } catch { /* never crash caller */ }
}

function sha256File(filePath: string): string {
  try {
    const data = fs.readFileSync(filePath);
    return createHash('sha256').update(data).digest('hex');
  } catch {
    return '';
  }
}

function sha256Buf(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function sendTelegramAlert(message: string): void {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const chatId   = process.env.OWNER_TELEGRAM_CHAT_ID || '';
  if (!botToken || !chatId) return; // silently skip if not configured

  const payload = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' });
  try {
    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${botToken}/sendMessage`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    });
    req.on('error', () => {}); // fire-and-forget, never crash server
    req.write(payload);
    req.end();
  } catch { /* silent */ }
}

// ── Rollback snapshot store (last 3 states per file) ─────────────────────────

interface SnapshotEntry {
  snapshotPath: string;  // path to snapshot file in SNAPSHOTS_DIR
  hash:         string;
  sizeBytes:    number;
  savedAt:      string;
}

type SnapshotStore = Record<string, SnapshotEntry[]>; // filePath → last 3 snapshots

function loadSnapshotStore(): SnapshotStore {
  const storePath = path.join(SNAPSHOTS_DIR, 'index.json');
  try {
    if (fs.existsSync(storePath)) {
      return JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

function saveSnapshotStore(store: SnapshotStore): void {
  const storePath = path.join(SNAPSHOTS_DIR, 'index.json');
  try {
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
  } catch { /* non-fatal */ }
}

function snapshotFile(filePath: string): SnapshotEntry | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const data      = fs.readFileSync(filePath);
    const hash      = sha256Buf(data);
    const key       = Buffer.from(filePath).toString('base64').replace(/[/+=]/g, '_');
    const ts        = Date.now();
    const snapName  = `${key}-${ts}.snap`;
    const snapPath  = path.join(SNAPSHOTS_DIR, snapName);
    fs.writeFileSync(snapPath, data);
    return {
      snapshotPath: snapPath,
      hash,
      sizeBytes:    data.length,
      savedAt:      new Date(ts).toISOString(),
    };
  } catch {
    return null;
  }
}

function saveSnapshot(filePath: string): string | null {
  const store = loadSnapshotStore();
  const snap  = snapshotFile(filePath);
  if (!snap) return null;

  if (!store[filePath]) store[filePath] = [];
  store[filePath].unshift(snap); // newest first

  // Keep only last 3
  const evicted = store[filePath].splice(3);
  for (const old of evicted) {
    try { fs.unlinkSync(old.snapshotPath); } catch { /* ok */ }
  }

  saveSnapshotStore(store);
  return snap.snapshotPath;
}

// ── Integrity hash store ──────────────────────────────────────────────────────

type HashStore = Record<string, string>; // relative_path → sha256

function loadHashStore(): HashStore {
  try {
    if (fs.existsSync(HASHES_FILE)) {
      return JSON.parse(fs.readFileSync(HASHES_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

function saveHashStore(store: HashStore): void {
  try {
    fs.writeFileSync(HASHES_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch { /* non-fatal */ }
}

// ── WipeWitness class ─────────────────────────────────────────────────────────

export class WipeWitness {
  private shrinkAlerts: ShrinkAlert[] = [];

  /**
   * Capture SHA-256 hash + size of file before write.
   * Saves a snapshot for rollback (last 3 states).
   * If file does not exist (new file): returns token with oldSizeBytes=0 and oldHash=''.
   */
  beforeWrite(filePath: string, agentId: string): WitnessToken {
    const exists      = fs.existsSync(filePath);
    const snapshotKey = exists ? (saveSnapshot(filePath) ?? undefined) : undefined;
    const token: WitnessToken = {
      filePath,
      agentId,
      oldHash:      exists ? sha256File(filePath) : '',
      oldSizeBytes: exists ? fs.statSync(filePath).size : 0,
      createdAt:    new Date().toISOString(),
      snapshotKey,
    };
    appendLog({ event: 'before_write', ...token });
    return token;
  }

  /**
   * Compare new size against old size.
   * If new_size < 0.5 * old_size → emit ShrinkAlert + Telegram notification.
   * Auto-rollback unless WIPE_WITNESS_NO_ROLLBACK=true.
   * Skips shrink check if oldSizeBytes === 0 (new file creation).
   */
  afterWrite(token: WitnessToken, newSizeBytes: number): void {
    appendLog({
      event:        'after_write',
      filePath:     token.filePath,
      agentId:      token.agentId,
      oldSizeBytes: token.oldSizeBytes,
      newSizeBytes,
      ts:           new Date().toISOString(),
    });

    if (token.oldSizeBytes === 0) return; // new file — no baseline to compare

    const ratio = newSizeBytes / token.oldSizeBytes;
    if (newSizeBytes < 0.5 * token.oldSizeBytes) {
      let rolledBack = false;

      // Auto-rollback unless disabled
      if (process.env.WIPE_WITNESS_NO_ROLLBACK !== 'true' && token.snapshotKey) {
        try {
          fs.copyFileSync(token.snapshotKey, token.filePath);
          rolledBack = true;
          appendLog({
            event:    'auto_rollback',
            filePath: token.filePath,
            agentId:  token.agentId,
            from:     token.snapshotKey,
            ts:       new Date().toISOString(),
          });
        } catch (err) {
          appendLog({
            event:    'auto_rollback_failed',
            filePath: token.filePath,
            error:    (err as Error).message,
            ts:       new Date().toISOString(),
          });
        }
      }

      const alert: ShrinkAlert = {
        filePath:     token.filePath,
        agentId:      token.agentId,
        oldSizeBytes: token.oldSizeBytes,
        newSizeBytes,
        ratio,
        ts:           new Date().toISOString(),
        rolledBack,
      };
      this.shrinkAlerts.push(alert);
      appendLog({ event: 'shrink_alert', ...alert });

      const pct = (ratio * 100).toFixed(1);
      sendTelegramAlert(
        `⚠️ *[OMEL WipeWitness] Shrink Alert*\n` +
        `File: \`${token.filePath}\`\n` +
        `Agent: ${token.agentId}\n` +
        `${token.oldSizeBytes} bytes → ${newSizeBytes} bytes (${pct}% of original)\n` +
        `Threshold: <50% triggers alert\n` +
        (rolledBack
          ? `✅ Auto-rolled back to previous state.`
          : `⚠️ Auto-rollback skipped (WIPE_WITNESS_NO_ROLLBACK=true or no snapshot).`)
      );
    }
  }

  /**
   * Log a deletion event before the file is removed.
   * Captures hash + size for audit trail.
   */
  beforeDelete(filePath: string, agentId: string): void {
    const exists = fs.existsSync(filePath);
    appendLog({
      event:     'before_delete',
      filePath,
      agentId,
      sizeBytes: exists ? fs.statSync(filePath).size : 0,
      hash:      exists ? sha256File(filePath) : '',
      ts:        new Date().toISOString(),
    });
  }

  /**
   * Return all shrink alerts accumulated in this session.
   */
  getShrinkAlerts(): ShrinkAlert[] {
    return [...this.shrinkAlerts];
  }

  /**
   * Restore a file to a previous state (one of last 3 snapshots).
   * @param filePath   Absolute path to the file to restore
   * @param stepsBack  1 = most recent snapshot, 2 = second most recent, 3 = oldest. Default 1.
   * @returns true if rollback succeeded, false otherwise.
   */
  rollback(filePath: string, stepsBack = 1): boolean {
    const store = loadSnapshotStore();
    const snaps = store[filePath];
    if (!snaps || snaps.length === 0) {
      appendLog({ event: 'rollback_no_snapshot', filePath, stepsBack, ts: new Date().toISOString() });
      return false;
    }
    const idx  = Math.min(stepsBack - 1, snaps.length - 1);
    const snap = snaps[idx];
    try {
      fs.copyFileSync(snap.snapshotPath, filePath);
      appendLog({
        event:        'rollback',
        filePath,
        stepsBack,
        snapshotPath: snap.snapshotPath,
        savedAt:      snap.savedAt,
        ts:           new Date().toISOString(),
      });
      return true;
    } catch (err) {
      appendLog({
        event:     'rollback_failed',
        filePath,
        stepsBack,
        error:     (err as Error).message,
        ts:        new Date().toISOString(),
      });
      return false;
    }
  }

  /**
   * Take a hash snapshot of all .ts files in a directory.
   * Returns a HashStore map for later comparison.
   * Used by run-swarm.sh pre-run.
   */
  snapshotDir(scanDir: string): HashStore {
    const store: HashStore = {};
    function walk(dir: string): void {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
            walk(full);
          } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            const rel = path.relative(scanDir, full);
            store[rel] = sha256File(full);
          }
        }
      } catch { /* skip unreadable dirs */ }
    }
    walk(scanDir);
    saveHashStore(store);
    appendLog({ event: 'snapshot_taken', scan_dir: scanDir, file_count: Object.keys(store).length, ts: new Date().toISOString() });
    return store;
  }

  /**
   * Nightly integrity report: compare current file hashes vs last snapshot.
   * Returns drifted, new, and deleted files.
   */
  integrityReport(scanDir: string): IntegrityReport {
    const oldStore   = loadHashStore();
    const newStore   = this.snapshotDir(scanDir);
    const ts         = new Date().toISOString();

    const drifted:   Array<{ file: string; old_hash: string; new_hash: string }> = [];
    const newFiles:  string[] = [];
    const delFiles:  string[] = [];

    for (const [file, newHash] of Object.entries(newStore)) {
      if (!oldStore[file]) {
        newFiles.push(file);
      } else if (oldStore[file] !== newHash) {
        drifted.push({ file, old_hash: oldStore[file], new_hash: newHash });
      }
    }
    for (const file of Object.keys(oldStore)) {
      if (!newStore[file]) delFiles.push(file);
    }

    const report: IntegrityReport = {
      ts,
      scan_dir:      scanDir,
      total_files:   Object.keys(newStore).length,
      drifted,
      new_files:     newFiles,
      deleted_files: delFiles,
    };

    appendLog({ event: 'integrity_report', ...report });

    if (drifted.length > 0 || delFiles.length > 0) {
      sendTelegramAlert(
        `🔍 *[OMEL WipeWitness] Integrity Drift*\n` +
        `Drifted: ${drifted.length} files\n` +
        `Deleted: ${delFiles.length} files\n` +
        `New: ${newFiles.length} files\n` +
        `Run: \`npx ts-node scripts/lib/omel/wipe-witness.ts report\` for details.`
      );
    }

    return report;
  }
}

// Exported singleton
export const wipeWitness = new WipeWitness();
