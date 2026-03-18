// OMEL Wipe Witness — Sprint 178 (AMD-13)
// Detection layer for destructive agent writes and file deletions.
// Would have caught Sprint 171 qwen3:14b 2800-line file rewrites.
//
// Public API:
//   beforeWrite(filePath, agentId) → WitnessToken  (SHA-256 + size before write)
//   afterWrite(token, newSizeBytes) → void           (shrink alert if new < 50% old)
//   beforeDelete(filePath, agentId) → void            (log deletion event)
//   getShrinkAlerts() → ShrinkAlert[]
//
// Audit log: logs/omel/wipe-witness-YYYY-MM-DD.jsonl
// Telegram:  TELEGRAM_BOT_TOKEN / OWNER_TELEGRAM_CHAT_ID (fire-and-forget)

import * as fs          from 'fs';
import * as path        from 'path';
import * as https       from 'https';
import { createHash }   from 'crypto';

const LOGS_DIR = path.join(__dirname, '..', '..', '..', 'logs', 'omel');
fs.mkdirSync(LOGS_DIR, { recursive: true });

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
}

export interface ShrinkAlert {
  filePath:     string;
  agentId:      string;
  oldSizeBytes: number;
  newSizeBytes: number;
  ratio:        number;   // newSizeBytes / oldSizeBytes (< 0.5 triggers alert)
  ts:           string;   // ISO timestamp
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

// ── WipeWitness class ─────────────────────────────────────────────────────────

export class WipeWitness {
  private shrinkAlerts: ShrinkAlert[] = [];

  /**
   * Capture SHA-256 hash + size of file before write.
   * If file does not exist (new file): returns token with oldSizeBytes=0 and oldHash=''.
   */
  beforeWrite(filePath: string, agentId: string): WitnessToken {
    const exists = fs.existsSync(filePath);
    const token: WitnessToken = {
      filePath,
      agentId,
      oldHash:      exists ? sha256File(filePath) : '',
      oldSizeBytes: exists ? fs.statSync(filePath).size : 0,
      createdAt:    new Date().toISOString(),
    };
    appendLog({ event: 'before_write', ...token });
    return token;
  }

  /**
   * Compare new size against old size.
   * If new_size < 0.5 * old_size → emit ShrinkAlert + Telegram notification.
   * Skips shrink check entirely if oldSizeBytes === 0 (new file creation).
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
      const alert: ShrinkAlert = {
        filePath:     token.filePath,
        agentId:      token.agentId,
        oldSizeBytes: token.oldSizeBytes,
        newSizeBytes,
        ratio,
        ts:           new Date().toISOString(),
      };
      this.shrinkAlerts.push(alert);
      appendLog({ event: 'shrink_alert', ...alert });

      const pct = (ratio * 100).toFixed(1);
      sendTelegramAlert(
        `⚠️ *[OMEL WipeWitness] Shrink Alert*\n` +
        `File: \`${token.filePath}\`\n` +
        `Agent: ${token.agentId}\n` +
        `${token.oldSizeBytes} bytes → ${newSizeBytes} bytes (${pct}% of original)\n` +
        `Threshold: <50% triggers alert`
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
}

// Exported singleton
export const wipeWitness = new WipeWitness();
