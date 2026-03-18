// CEO Wallet — Sprint 174
// Tracks per-call spend. Persists to logs/ceo-wallet/YYYY-MM.jsonl.
// deductCost() called by ClawRouter HTTP server on each successful route.
//
// Env vars:
//   CEO_WALLET_BALANCE_USD   — starting balance (default: $50)
//   COST_ALERT_USD_DAILY     — Telegram alert threshold (default: $1.00)
//   CEO_TELEGRAM_BOT_TOKEN | TELEGRAM_BOT_TOKEN
//   OWNER_TELEGRAM_CHAT_ID  | CEO_TELEGRAM_CHAT_ID

import * as fs    from 'fs';
import * as path  from 'path';
import * as https from 'https';

const LOGS_DIR             = path.join(__dirname, '..', '..', 'logs', 'ceo-wallet');
const WALLET_BALANCE_USD   = parseFloat(process.env.CEO_WALLET_BALANCE_USD   ?? '50');
const COST_ALERT_USD_DAILY = parseFloat(process.env.COST_ALERT_USD_DAILY     ?? '1.00');

fs.mkdirSync(LOGS_DIR, { recursive: true });

export interface LedgerEntry {
  ts:         string;
  agent_id:   string;
  task_type:  string;
  amount_usd: number;
}

// ── In-memory counters (reset on new day) ─────────────────────────────────────
let _spentToday      = 0;
let _spentMonth      = 0;
let _alertFiredToday = false;
let _lastResetDate   = new Date().toISOString().slice(0, 10);

function resetIfNewDay(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== _lastResetDate) {
    _spentToday      = 0;
    _alertFiredToday = false;
    _lastResetDate   = today;
  }
}

function ledgerPath(): string {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  return path.join(LOGS_DIR, `${month}.jsonl`);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function deductCost(amount_usd: number, agent_id: string, task_type: string): void {
  resetIfNewDay();
  _spentToday += amount_usd;
  _spentMonth += amount_usd;

  const entry: LedgerEntry = { ts: new Date().toISOString(), agent_id, task_type, amount_usd };
  fs.appendFileSync(ledgerPath(), JSON.stringify(entry) + '\n');

  // Fire Telegram alert when daily threshold is first crossed
  if (!_alertFiredToday && _spentToday >= COST_ALERT_USD_DAILY) {
    _alertFiredToday = true;
    sendAlert(
      `⚠️ *ClawRouter daily spend alert*\n` +
      `Spent: $${_spentToday.toFixed(4)}\n` +
      `Threshold: $${COST_ALERT_USD_DAILY.toFixed(2)}\n` +
      `Balance remaining: $${(WALLET_BALANCE_USD - _spentMonth).toFixed(4)}`
    );
  }
}

export function getBalance(): { balance_usd: number; spent_today_usd: number; spent_month_usd: number } {
  resetIfNewDay();
  return {
    balance_usd:     WALLET_BALANCE_USD - _spentMonth,
    spent_today_usd: _spentToday,
    spent_month_usd: _spentMonth,
  };
}

export function getDailyLedger(date: string): LedgerEntry[] {
  const month = date.slice(0, 7); // YYYY-MM
  const fp    = path.join(LOGS_DIR, `${month}.jsonl`);
  if (!fs.existsSync(fp)) return [];
  return fs.readFileSync(fp, 'utf-8')
    .split('\n').filter(Boolean)
    .map(l => JSON.parse(l) as LedgerEntry)
    .filter(e => e.ts.startsWith(date));
}

// ── Internal Telegram helper ───────────────────────────────────────────────────

function sendAlert(message: string): void {
  const botToken = process.env.CEO_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
  const chatId   = process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID || '';
  if (!botToken || !chatId) return; // silently skip if not configured

  const payload = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' });
  const req = https.request({
    hostname: 'api.telegram.org',
    path:     `/bot${botToken}/sendMessage`,
    method:   'POST',
    headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  });
  req.on('error', () => {}); // fire-and-forget, don't crash server
  req.write(payload);
  req.end();
}
