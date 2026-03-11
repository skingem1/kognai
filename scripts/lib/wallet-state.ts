/**
 * wallet-state.ts — CFO budget tracking for ClawRouter spend
 *
 * Accumulates spend from ClawRouter X-Payment-Amount headers.
 * Enforces degraded (≥80%) and frozen (≥95%) modes to protect the wallet.
 * Persists to logs/wallet/state.json across sprint runs.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const KOGNAI_ROOT = resolve(__dirname, '../..');
const STATE_FILE = resolve(KOGNAI_ROOT, 'logs/wallet/state.json');
const DEFAULT_BUDGET = parseFloat(process.env.CEO_WALLET_BUDGET_USDC || '25'); // $25/month default

interface WalletStateData {
  monthlyBudget: number;
  spentThisMonth: number;
  callCount: number;
  lastReset: string; // ISO date string
}

function loadState(): WalletStateData {
  if (existsSync(STATE_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
      // Auto-reset on new month
      const lastReset = new Date(raw.lastReset);
      const now = new Date();
      if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
        return freshState();
      }
      return raw;
    } catch { /* fall through */ }
  }
  return freshState();
}

function freshState(): WalletStateData {
  return {
    monthlyBudget: DEFAULT_BUDGET,
    spentThisMonth: 0,
    callCount: 0,
    lastReset: new Date().toISOString(),
  };
}

function saveState(data: WalletStateData): void {
  try {
    mkdirSync(resolve(KOGNAI_ROOT, 'logs/wallet'), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch { /* non-fatal */ }
}

// Singleton
let _state = loadState();

export interface WalletState {
  monthlyBudget: number;
  spentThisMonth: number;
  callCount: number;
  remaining: number;
  burnPct: number;
  isDegraded: boolean; // ≥80%
  isFrozen: boolean;   // ≥95%
}

export function getWalletState(): WalletState {
  const remaining = Math.max(0, _state.monthlyBudget - _state.spentThisMonth);
  const burnPct = (_state.spentThisMonth / _state.monthlyBudget) * 100;
  return {
    monthlyBudget: _state.monthlyBudget,
    spentThisMonth: _state.spentThisMonth,
    callCount: _state.callCount,
    remaining,
    burnPct,
    isDegraded: burnPct >= 80,
    isFrozen: burnPct >= 95,
  };
}

export function recordSpend(costUsdc: number): void {
  _state.spentThisMonth += costUsdc;
  _state.callCount += 1;
  saveState(_state);
}

export function resetWallet(): void {
  _state = freshState();
  saveState(_state);
}

export function logWalletStatus(): void {
  const s = getWalletState();
  const status = s.isFrozen ? '🔴 FROZEN' : s.isDegraded ? '🟡 DEGRADED' : '🟢 OK';
  console.log(`  💳 Wallet ${status}: $${s.spentThisMonth.toFixed(4)}/$${s.monthlyBudget} (${s.burnPct.toFixed(1)}%)`);
}
