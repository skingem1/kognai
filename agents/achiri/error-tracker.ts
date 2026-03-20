/**
 * error-tracker.ts — Sprint 314
 * Achiri server error tracking + Telegram alerting.
 *
 * Tracks errors in workspace/achiri/error-log.jsonl.
 * Sends Telegram alert when error rate exceeds threshold.
 * Rate-limited to max 1 alert per 30 minutes.
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const ERROR_LOG_PATH = join(ROOT, 'workspace', 'achiri', 'error-log.jsonl');
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

let lastAlertTime = 0;

export interface ErrorEntry {
  timestamp: string;
  type: 'llm_error' | 'timeout' | 'safety_block' | 'limit_exceeded' | 'api_error' | 'voice_error';
  userId: string;
  message: string;
  details?: string;
}

export interface ErrorSummary {
  total: number;
  last24h: number;
  lastHour: number;
  byType: Record<string, number>;
  recentErrors: ErrorEntry[];
}

/**
 * Log an error event.
 */
export function trackError(entry: Omit<ErrorEntry, 'timestamp'>): void {
  const dir = join(ROOT, 'workspace', 'achiri');
  mkdirSync(dir, { recursive: true });
  const full: ErrorEntry = { ...entry, timestamp: new Date().toISOString() };
  appendFileSync(ERROR_LOG_PATH, JSON.stringify(full) + '\n', 'utf-8');
  console.log(`[Achiri] error_tracked type=${entry.type} user=${entry.userId}`);

  // Check if we should alert
  maybeAlert(full);
}

/**
 * Send Telegram alert if error rate is high and cooldown has elapsed.
 */
async function maybeAlert(entry: ErrorEntry): Promise<void> {
  const now = Date.now();
  if (now - lastAlertTime < ALERT_COOLDOWN_MS) return;

  // Count errors in last hour
  const summary = getErrorSummary();
  if (summary.lastHour < 3) return; // Alert threshold: 3+ errors/hour

  lastAlertTime = now;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  const text = [
    '🔴 *Achiri Error Alert*',
    '',
    `⚠️ ${summary.lastHour} errors in last hour`,
    `📊 ${summary.last24h} errors in last 24h`,
    '',
    '*Recent:*',
    ...summary.recentErrors.slice(0, 3).map(e =>
      `• ${e.type}: ${e.message.slice(0, 80)}`
    ),
    '',
    'Run `/achirierrors` for details.',
  ].join('\n');

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  } catch { /* non-fatal */ }
}

/**
 * Load all error entries.
 */
export function loadErrors(): ErrorEntry[] {
  if (!existsSync(ERROR_LOG_PATH)) return [];
  return readFileSync(ERROR_LOG_PATH, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l) as ErrorEntry; } catch { return null; } })
    .filter(Boolean) as ErrorEntry[];
}

/**
 * Get error summary statistics.
 */
export function getErrorSummary(): ErrorSummary {
  const errors = loadErrors();
  const now = Date.now();
  const h24 = now - 24 * 60 * 60 * 1000;
  const h1 = now - 60 * 60 * 1000;

  const byType: Record<string, number> = {};
  let last24h = 0;
  let lastHour = 0;

  for (const e of errors) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    const ts = new Date(e.timestamp).getTime();
    if (ts >= h24) last24h++;
    if (ts >= h1) lastHour++;
  }

  return {
    total: errors.length,
    last24h,
    lastHour,
    byType,
    recentErrors: errors.slice(-10).reverse(),
  };
}
