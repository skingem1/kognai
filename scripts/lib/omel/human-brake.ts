// OMEL Human Brake — Sprint 179 + Sprint 184 Hardening (AMD-13)
// Human-in-the-loop safety gate for high-risk operations.
// Telegram approval flow: send notification → poll getUpdates up to 5 min.
// ABORT on timeout or non-approval reply. JSONL audit trail.
//
// API:
//   requireApproval(operation: HighRiskOp): Promise<ApprovalResult>
//   isHighRisk(operation: string, context: any): boolean
//   getRiskScore(operation: string, context: any): number  (Sprint 184)
//
// Sprint 184 hardening additions:
//   - Risk scoring: getRiskScore() → 1-10 scale
//   - Operation risk table: file_delete=9, git_reset_hard=10, new_file=2, etc.
//   - Approval response time logged per operation
//   - HUMAN_BRAKE_DISABLED=true triggers daily Telegram reminder
//   - AARMiddleware integration: approved/rejected ops get AAR entry
//
// Audit log: logs/omel/human-brake-YYYY-MM-DD.jsonl
// Env: TELEGRAM_BOT_TOKEN, OWNER_TELEGRAM_CHAT_ID, HUMAN_BRAKE_DISABLED

import * as fs    from 'fs';
import * as path  from 'path';
import * as https from 'https';

// ── Interfaces ────────────────────────────────────────────────────────────────

export type HighRiskOp =
  | 'file_delete'
  | 'git_reset_hard'
  | 'env_change'
  | 'schema_migration'
  | 'bulk_overwrite'
  | 'new_file';

export interface ApprovalResult {
  approved:      boolean;
  approvedBy?:   string;
  reason?:       string;
  ts:            string;
  risk_score?:   number;
  response_ms?:  number;  // Sprint 184: time from request to decision
}

// ── Risk score table (Sprint 184) ─────────────────────────────────────────────

const RISK_SCORES: Record<string, number> = {
  git_reset_hard:   10,
  file_delete:       9,
  env_change:        8,
  schema_migration:  8,
  bulk_overwrite:    7,
  new_file:          2,
};

// ── Logging ───────────────────────────────────────────────────────────────────

const LOGS_DIR = path.join(__dirname, '..', '..', '..', 'logs', 'omel');
fs.mkdirSync(LOGS_DIR, { recursive: true });

function logFile(): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOGS_DIR, `human-brake-${date}.jsonl`);
}

function appendLog(entry: object): void {
  try {
    fs.appendFileSync(logFile(), JSON.stringify(entry) + '\n');
  } catch { /* never crash caller */ }
}

// ── AARMiddleware integration (Sprint 184) ────────────────────────────────────
// Lazy import to avoid circular dependency — AARMiddleware may import OMEL

function writeAAREntry(operation: string, approved: boolean, risk_score: number, response_ms: number): void {
  try {
    const aarDir  = path.join(__dirname, '..', '..', '..', 'logs', 'aar');
    fs.mkdirSync(aarDir, { recursive: true });
    const date    = new Date().toISOString().slice(0, 10);
    const aarFile = path.join(aarDir, `${date}.jsonl`);
    const entry = {
      ts:          new Date().toISOString(),
      source:      'omel_human_brake',
      operation,
      approved,
      risk_score,
      response_ms,
      receipt_hash: Buffer.from(`${operation}${Date.now()}`).toString('base64').slice(0, 32),
    };
    fs.appendFileSync(aarFile, JSON.stringify(entry) + '\n');
  } catch { /* non-fatal */ }
}

// ── Telegram helpers ──────────────────────────────────────────────────────────

const HIGH_RISK_OP_SET = new Set<string>([
  'file_delete', 'git_reset_hard', 'env_change', 'schema_migration', 'bulk_overwrite',
]);

const HIGH_RISK_PATH_FRAGMENTS = ['orchestrate-agents', 'clawrouter', '.env'];

function sendTelegram(message: string): void {
  const botToken = process.env.TELEGRAM_BOT_TOKEN    || '';
  const chatId   = process.env.OWNER_TELEGRAM_CHAT_ID || '';
  if (!botToken || !chatId) return;

  const payload = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' });
  try {
    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${botToken}/sendMessage`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    });
    req.on('error', () => {}); // fire-and-forget, never crash
    req.write(payload);
    req.end();
  } catch { /* silent */ }
}

function getUpdates(offset: number, longPollSeconds: number): Promise<any[]> {
  return new Promise((resolve) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!botToken) { resolve([]); return; }

    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${botToken}/getUpdates?offset=${offset}&timeout=${longPollSeconds}`,
      method:   'GET',
    }, (res) => {
      let raw = '';
      res.on('data', (chunk: Buffer) => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed.ok ? (parsed.result as any[]) : []);
        } catch {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout((longPollSeconds + 10) * 1000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

// ── HUMAN_BRAKE_DISABLED daily reminder (Sprint 184) ─────────────────────────

const DISABLED_REMINDER_FILE = path.join(LOGS_DIR, 'brake-disabled-reminder.json');

function sendDisabledReminderIfNeeded(): void {
  const today = new Date().toISOString().slice(0, 10);
  try {
    let lastSent = '';
    if (fs.existsSync(DISABLED_REMINDER_FILE)) {
      lastSent = JSON.parse(fs.readFileSync(DISABLED_REMINDER_FILE, 'utf-8')).last_sent ?? '';
    }
    if (lastSent === today) return; // already sent today
    sendTelegram(
      `⚠️ *[OMEL HumanBrake] Brake DISABLED*\n` +
      `\`HUMAN_BRAKE_DISABLED=true\` is set in your environment.\n` +
      `High-risk operations will NOT require approval.\n` +
      `This reminder fires daily until the flag is removed.`
    );
    fs.writeFileSync(DISABLED_REMINDER_FILE, JSON.stringify({ last_sent: today }), 'utf-8');
  } catch { /* non-fatal */ }
}

// ── HumanBrake class ──────────────────────────────────────────────────────────

export class HumanBrake {

  /**
   * Returns true if operation is a known HighRiskOp type,
   * OR if context.filePath touches protected files.
   */
  isHighRisk(operation: string, context: any = {}): boolean {
    if (HIGH_RISK_OP_SET.has(operation)) return true;
    const filePath = String((context as any).filePath || '');
    return HIGH_RISK_PATH_FRAGMENTS.some(fragment => filePath.includes(fragment));
  }

  /**
   * Returns a risk score 1-10 for the given operation + context.
   * High (8-10): requires approval. Medium (5-7): log only. Low (1-4): silent pass.
   *
   * Context fields considered:
   *   - filePath: if it's an orchestrator core file, score bumped to max
   *   - size: bulk ops on large files get higher score
   */
  getRiskScore(operation: string, context: any = {}): number {
    let score = RISK_SCORES[operation] ?? 5; // default 5 (medium) for unknown ops

    // Bump to 10 if touching core orchestrator or config files
    const filePath = String((context as any).filePath || '');
    if (HIGH_RISK_PATH_FRAGMENTS.some(f => filePath.includes(f))) {
      score = Math.max(score, 9);
    }

    // Bump for large file bulk ops
    const sizeBytes = Number((context as any).sizeBytes || 0);
    if (operation === 'bulk_overwrite' && sizeBytes > 50_000) {
      score = Math.max(score, 9);
    }

    return Math.min(10, Math.max(1, score));
  }

  /**
   * Send Telegram approval request and poll for up to 5 minutes.
   * Returns ApprovalResult: approved on 'yes'/'approve', rejected on other reply or timeout.
   * Logs response time and emits AAR entry (Sprint 184).
   */
  async requireApproval(operation: HighRiskOp, context: any = {}): Promise<ApprovalResult> {
    const ts         = new Date().toISOString();
    const risk_score = this.getRiskScore(operation, context);
    const requestedAt = Date.now();

    // ── HUMAN_BRAKE_DISABLED bypass ──────────────────────────────────────────
    if (process.env.HUMAN_BRAKE_DISABLED === 'true') {
      sendDisabledReminderIfNeeded();
      const response_ms = Date.now() - requestedAt;
      appendLog({ event: 'brake_disabled', operation, risk_score, response_ms, ts });
      writeAAREntry(operation, true, risk_score, response_ms);
      return { approved: true, approvedBy: 'HUMAN_BRAKE_DISABLED', risk_score, response_ms, ts };
    }

    // ── Notify operator via Telegram ─────────────────────────────────────────
    sendTelegram(
      `🛑 *[OMEL HumanBrake] Approval Required*\n` +
      `Operation: \`${operation}\`\n` +
      `Risk Score: *${risk_score}/10*\n` +
      `Requested: ${ts}\n\n` +
      `Reply *yes* or *approve* to allow.\n` +
      `Any other reply or 5-minute timeout = ABORT.`,
    );
    appendLog({ event: 'approval_requested', operation, risk_score, ts });

    // ── Poll Telegram for up to 5 minutes ────────────────────────────────────
    const chatId   = process.env.OWNER_TELEGRAM_CHAT_ID || '';
    const deadline = Date.now() + 5 * 60 * 1000;
    let   offset   = 0;

    while (Date.now() < deadline) {
      const remainingMs  = deadline - Date.now();
      if (remainingMs <= 0) break;

      const pollSecs = Math.min(30, Math.floor(remainingMs / 1000));
      if (pollSecs <= 0) break;

      const updates = await getUpdates(offset, pollSecs);

      for (const update of updates) {
        if (typeof update.update_id === 'number') {
          offset = update.update_id + 1;
        }

        const msg = update.message || update.edited_message;
        if (!msg) continue;

        if (chatId && String(msg.chat?.id) !== chatId) continue;

        const text = String(msg.text || '').trim().toLowerCase();

        if (text === 'yes' || text === 'approve') {
          const approvedTs  = new Date().toISOString();
          const response_ms = Date.now() - requestedAt;
          appendLog({ event: 'approved', operation, risk_score, approvedBy: 'telegram', response_ms, ts: approvedTs });
          writeAAREntry(operation, true, risk_score, response_ms);
          return { approved: true, approvedBy: 'telegram', risk_score, response_ms, ts: approvedTs };
        }

        // Any non-approval reply → reject immediately
        const rejectedTs  = new Date().toISOString();
        const response_ms = Date.now() - requestedAt;
        appendLog({ event: 'rejected', operation, risk_score, reason: 'rejected', replyText: text, response_ms, ts: rejectedTs });
        writeAAREntry(operation, false, risk_score, response_ms);
        sendTelegram(`❌ *[OMEL HumanBrake] ABORTED*\nOperation \`${operation}\` rejected by operator.`);
        return { approved: false, reason: 'rejected', risk_score, response_ms, ts: rejectedTs };
      }
    }

    // ── Timeout ──────────────────────────────────────────────────────────────
    const timeoutTs   = new Date().toISOString();
    const response_ms = Date.now() - requestedAt;
    appendLog({ event: 'timeout_abort', operation, risk_score, reason: 'timeout', response_ms, ts: timeoutTs });
    writeAAREntry(operation, false, risk_score, response_ms);
    sendTelegram(
      `⏰ *[OMEL HumanBrake] TIMEOUT — ABORTED*\n` +
      `Operation \`${operation}\` aborted — no response within 5 minutes.\n` +
      `Risk Score: *${risk_score}/10*`,
    );
    return { approved: false, reason: 'timeout', risk_score, response_ms, ts: timeoutTs };
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
export const humanBrake = new HumanBrake();
