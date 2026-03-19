#!/usr/bin/env npx ts-node
/**
 * revenue-tracker.ts — Sprint 269
 * Revenue tracking for Kognai TikTok Content Agent.
 *
 * Reads subscriber data from:
 * - workspace/revenue/subscribers.jsonl (subscriber events from Stripe webhooks)
 * - agents/telegram-bot/db (TelegramDB for active subscribers)
 *
 * Computes: subscriber count, MRR, revenue milestones, financial gates.
 *
 * Usage: npx ts-node scripts/scs001/revenue-tracker.ts
 * Output: reports/revenue-summary.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';

const CWD = process.cwd();
const SUBSCRIBERS_PATH = join(CWD, 'workspace', 'revenue', 'subscribers.jsonl');
const DB_PATH = join(CWD, 'data', 'telegram-db.json');
const OUTPUT_PATH = join(CWD, 'reports', 'revenue-summary.json');

// Plan pricing
const PLAN_PRICES: Record<string, number> = {
  growth: 19,   // $19/mo
  premium: 49,  // $49/mo
  free: 0,
};

interface SubscriberEvent {
  chatId: string;
  plan: string;
  event: 'subscribed' | 'canceled' | 'payment_failed';
  timestamp: string;
  amount?: number;
}

interface TelegramDBEntry {
  tier?: string;
  active?: boolean;
  stripeCustomerId?: string;
}

function loadSubscriberEvents(): SubscriberEvent[] {
  if (!existsSync(SUBSCRIBERS_PATH)) return [];
  return readFileSync(SUBSCRIBERS_PATH, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l) as SubscriberEvent; } catch { return null; } })
    .filter(Boolean) as SubscriberEvent[];
}

function loadTelegramDB(): Map<string, TelegramDBEntry> {
  const map = new Map<string, TelegramDBEntry>();
  if (!existsSync(DB_PATH)) return map;
  try {
    const data = JSON.parse(readFileSync(DB_PATH, 'utf-8'));
    for (const [key, val] of Object.entries(data)) {
      map.set(key, val as TelegramDBEntry);
    }
  } catch { /* skip */ }
  return map;
}

function main(): void {
  console.log('\n══════════════════════════════════════════════');
  console.log('  Revenue Tracker — Kognai');
  console.log('══════════════════════════════════════════════\n');

  // Source 1: Subscriber events ledger
  const events = loadSubscriberEvents();

  // Source 2: TelegramDB for current state
  const db = loadTelegramDB();
  const activeSubscribers = [...db.entries()]
    .filter(([_, v]) => v.tier && v.tier !== 'free' && v.active !== false);

  // Compute MRR from active subscribers
  let mrr = 0;
  const planCounts: Record<string, number> = { growth: 0, premium: 0, free: 0 };
  for (const [_, entry] of activeSubscribers) {
    const tier = entry.tier ?? 'free';
    mrr += PLAN_PRICES[tier] ?? 0;
    planCounts[tier] = (planCounts[tier] ?? 0) + 1;
  }

  // Also count all registered users
  const totalUsers = db.size;
  const paidUsers = activeSubscribers.length;
  const freeUsers = totalUsers - paidUsers;

  // Financial gates (from KOGNAI_FULL_DEVELOPMENT_PLAN.md)
  const gates = [
    { name: 'Phase 1.5 (TikTok live)', target: 0, met: true },
    { name: 'Phase 2A (Achiri alpha)', target: 0, met: true },
    { name: 'Phase 2B (10 subscribers)', target: 190, met: mrr >= 190 },
    { name: 'Phase 3 (Financial autonomy)', target: 500, met: mrr >= 500 },
    { name: 'Phase 4 (x402 revenue)', target: 1000, met: mrr >= 1000 },
  ];

  // Print report
  console.log(`  Total users: ${totalUsers}`);
  console.log(`  Free: ${freeUsers} | Growth: ${planCounts.growth} ($19/mo) | Premium: ${planCounts.premium} ($49/mo)`);
  console.log(`  Active paid: ${paidUsers}`);
  console.log(`  MRR: $${mrr}`);
  console.log('');

  console.log('  *Financial Gates:*');
  for (const g of gates) {
    const icon = g.met ? '✅' : '⏳';
    console.log(`    ${icon} ${g.name}: $${g.target}/mo MRR`);
  }

  // Subscriber event history
  if (events.length > 0) {
    console.log('');
    console.log(`  *Recent events (${events.length} total):*`);
    const recent = events.slice(-5);
    for (const e of recent) {
      console.log(`    ${e.event} — chatId:${e.chatId} plan:${e.plan} @ ${e.timestamp}`);
    }
  }

  // Write summary
  const summary = {
    generated_at: new Date().toISOString(),
    total_users: totalUsers,
    paid_users: paidUsers,
    free_users: freeUsers,
    plan_counts: planCounts,
    mrr,
    arr: mrr * 12,
    financial_gates: gates,
    subscriber_events_count: events.length,
  };

  const dir = dirname(OUTPUT_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`\n  Written to: ${OUTPUT_PATH}`);
  console.log('══════════════════════════════════════════════\n');
}

main();
