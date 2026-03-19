// OMEL Human Brake — Sprint 179 (AMD-13)
// Human-in-the-loop safety gate for high-risk operations.
// Telegram approval flow: send notification → poll getUpdates up to 5 min.
// ABORT on timeout or non-approval reply. JSONL audit trail.
//
// API:
//   requireApproval(operation: HighRiskOp): Promise<ApprovalResult>
//   isHighRisk(operation: string, context: any): boolean
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
  | 'bulk_overwrite';

export interface ApprovalResult {
  approved:    boolean;
  approvedBy?: string;
  reason?:     string;
  ts:          string;
}

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
    // Socket timeout: longPoll seconds + 10s buffer
    req.setTimeout((longPollSeconds + 10) * 1000, () => { req.destroy(); resolve([]); });
    req.end();
  });
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
   * Send Telegram approval request and poll for up to 5 minutes.
   * Returns ApprovalResult: approved on 'yes'/'approve', rejected on other reply or timeout.
   */
  async requireApproval(operation: HighRiskOp): Promise<ApprovalResult> {
    const ts = new Date().toISOString();

    // ── HUMAN_BRAKE_DISABLED bypass ──────────────────────────────────────────
    if (process.env.HUMAN_BRAKE_DISABLED === 'true') {
      appendLog({ event: 'brake_disabled', operation, ts });
      return { approved: true, approvedBy: 'HUMAN_BRAKE_DISABLED', ts };
    }

    // ── Notify operator via Telegram ─────────────────────────────────────────
    sendTelegram(
      `🛑 *[OMEL HumanBrake] Approval Required*\n` +
      `Operation: \`${operation}\`\n` +
      `Requested: ${ts}\n\n` +
      `Reply *yes* or *approve* to allow.\n` +
      `Any other reply or 5-minute timeout = ABORT.`,
    );
    appendLog({ event: 'approval_requested', operation, ts });

    // ── Poll Telegram for up to 5 minutes ────────────────────────────────────
    const chatId   = process.env.OWNER_TELEGRAM_CHAT_ID || '';
    const deadline = Date.now() + 5 * 60 * 1000;
    let   offset   = 0;

    while (Date.now() < deadline) {
      const remainingMs  = deadline - Date.now();
      if (remainingMs <= 0) break;

      // Long-poll up to 30s, but cap to remaining window
      const pollSecs = Math.min(30, Math.floor(remainingMs / 1000));
      if (pollSecs <= 0) break;

      const updates = await getUpdates(offset, pollSecs);

      for (const update of updates) {
        // Advance offset so we never re-process this update
        if (typeof update.update_id === 'number') {
          offset = update.update_id + 1;
        }

        const msg = update.message || update.edited_message;
        if (!msg) continue;

        // Only accept from the configured owner chat
        if (chatId && String(msg.chat?.id) !== chatId) continue;

        const text = String(msg.text || '').trim().toLowerCase();

        if (text === 'yes' || text === 'approve') {
          const approvedTs = new Date().toISOString();
          appendLog({ event: 'approved', operation, approvedBy: 'telegram', ts: approvedTs });
          return { approved: true, approvedBy: 'telegram', ts: approvedTs };
        }

        // Any non-approval reply → reject immediately
        const rejectedTs = new Date().toISOString();
        appendLog({ event: 'rejected', operation, reason: 'rejected', replyText: text, ts: rejectedTs });
        sendTelegram(`❌ *[OMEL HumanBrake] ABORTED*\nOperation \`${operation}\` rejected by operator.`);
        return { approved: false, reason: 'rejected', ts: rejectedTs };
      }
    }

    // ── Timeout ──────────────────────────────────────────────────────────────
    const timeoutTs = new Date().toISOString();
    appendLog({ event: 'timeout_abort', operation, reason: 'timeout', ts: timeoutTs });
    sendTelegram(
      `⏰ *[OMEL HumanBrake] TIMEOUT — ABORTED*\n` +
      `Operation \`${operation}\` aborted — no response within 5 minutes.`,
    );
    return { approved: false, reason: 'timeout', ts: timeoutTs };
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
export const humanBrake = new HumanBrake();
