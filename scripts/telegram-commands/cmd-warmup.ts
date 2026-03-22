/**
 * cmd-warmup.ts — Sprint 783 (WARMUP-01)
 *
 * Telegram commands for TikTok algorithm warmup workflow:
 *   /warmup-start   — Mark warmup period started (operator begins scrolling)
 *   /warmup-complete — Operator confirms warmup done, runs verification
 *   /warmup-status  — Check current warmup state
 */

import * as fs from 'fs';
import * as path from 'path';
import { ROOT } from './shared';
import { sendMessage } from './telegram-api';
import {
  WarmupStatus, loadWarmupStatus, saveWarmupStatus,
  verifyWarmupSignal, isWarmupComplete,
} from '../scs001/verify-warmup-signal';

/**
 * /warmup-start — Initialize warmup tracking
 */
export function cmdWarmupStart(): string {
  const existing = loadWarmupStatus();
  if (existing?.warmup_complete) {
    return '⚠️ Warmup already completed. Use /warmup-status to check.';
  }

  const status: WarmupStatus = {
    warmup_complete: false,
    warmup_started_at: existing?.warmup_started_at || new Date().toISOString(),
    warmup_completed_at: null,
    niche_alignment: 0,
    days_active: existing?.days_active || 0,
    verified: false,
    verified_at: null,
    notes: '',
  };

  saveWarmupStatus(status);

  return [
    '🔥 *TikTok Warmup Started*',
    '',
    'Your 3-day warmup checklist:',
    '1. Scroll the For You Page 15-20 min/day',
    '2. Like & save AI/tech content',
    '3. Follow 10-20 AI creators',
    '4. Comment on 5+ AI videos daily',
    '5. Watch AI videos to completion',
    '',
    `Started: ${status.warmup_started_at.slice(0, 10)}`,
    '',
    'After 3 days, run `/warmup-complete <days> <score>`',
    'Example: `/warmup-complete 3 8`',
    '(3 = days active, 8 = niche alignment 0-10)',
  ].join('\n');
}

/**
 * /warmup-complete <days> <alignment_score> — Mark warmup as done
 * Example: /warmup-complete 3 8
 */
export async function cmdWarmupComplete(chatId: string, args: string): Promise<void> {
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    await sendMessage(chatId, '❌ Usage: `/warmup-complete <days_active> <niche_score>`\nExample: `/warmup-complete 3 8`');
    return;
  }

  const daysActive = parseInt(parts[0], 10);
  const nicheScore = parseInt(parts[1], 10);

  if (isNaN(daysActive) || isNaN(nicheScore) || nicheScore < 0 || nicheScore > 10) {
    await sendMessage(chatId, '❌ Invalid input. Days must be a number, score must be 0-10.');
    return;
  }

  const existing = loadWarmupStatus();
  const status: WarmupStatus = {
    warmup_complete: true,
    warmup_started_at: existing?.warmup_started_at || new Date(Date.now() - daysActive * 86_400_000).toISOString(),
    warmup_completed_at: new Date().toISOString(),
    niche_alignment: nicheScore,
    days_active: daysActive,
    verified: false,
    verified_at: null,
    notes: parts.slice(2).join(' ') || '',
  };

  saveWarmupStatus(status);

  // Run verification
  const result = verifyWarmupSignal();

  const lines = [
    result.pass ? '✅ *Warmup Verified — Posting Unlocked!*' : '⚠️ *Warmup Recorded — Verification Failed*',
    '',
  ];

  for (const c of result.checks) {
    lines.push(`${c.pass ? '✅' : '❌'} ${c.name}: ${c.detail}`);
  }

  if (!result.pass) {
    lines.push('');
    lines.push('Fix the failing checks and run `/warmup-complete` again.');
  } else {
    lines.push('');
    lines.push('🚀 You can now use `/postnow`, `/autopost`, and `/publish`.');
  }

  await sendMessage(chatId, lines.join('\n'));
}

/**
 * /warmup-status — Show current warmup state (sync)
 */
export function cmdWarmupStatus(): string {
  const status = loadWarmupStatus();

  if (!status) {
    return [
      '❄️ *Warmup Not Started*',
      '',
      'Run `/warmup-start` to begin the 3-day TikTok warmup.',
      '',
      'Why? Fresh accounts posting AI content immediately get throttled.',
      'Scroll, like, and comment on AI/tech content for 3 days first.',
    ].join('\n');
  }

  const verified = status.verified;
  const lines = [
    verified ? '✅ *Warmup: VERIFIED*' : '🔥 *Warmup: IN PROGRESS*',
    '',
    `Started: ${status.warmup_started_at.slice(0, 10)}`,
    `Days active: ${status.days_active}`,
    `Niche alignment: ${status.niche_alignment}/10`,
    `Complete: ${status.warmup_complete ? 'Yes' : 'No'}`,
    `Verified: ${verified ? `Yes (${status.verified_at?.slice(0, 10)})` : 'No'}`,
  ];

  if (!verified) {
    lines.push('');
    lines.push('When ready: `/warmup-complete <days> <score>`');
  }

  return lines.join('\n');
}
