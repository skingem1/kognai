/**
 * onboarding-funnel.ts — Funnel analytics for TikTok→Telegram→Stripe flow
 *
 * Reads funnel-events.jsonl and generates conversion report.
 * Shows drop-off at each stage and conversion rates.
 *
 * Usage: npx tsx scripts/scs001/onboarding-funnel.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const EVENTS_PATH = path.join(__dirname, '../../workspace/billing/funnel-events.jsonl');
const REPORT_PATH = path.join(__dirname, '../../workspace/billing/funnel-report.json');

interface FunnelEvent {
  timestamp: string;
  event: string;
  chat_id: string;
  source: string;
  data?: Record<string, unknown>;
}

const STAGE_ORDER = [
  'start',
  'plans_view',
  'trial_click',
  'trial_interest_no_stripe',
  'checkout_created',
  'checkout_completed',
  'trial_active',
  'trial_converted',
  'churned',
];

function loadEvents(): FunnelEvent[] {
  if (!fs.existsSync(EVENTS_PATH)) return [];
  return fs.readFileSync(EVENTS_PATH, 'utf-8')
    .trim()
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l));
}

function main() {
  console.log('=== Kognai Onboarding Funnel Report ===\n');

  const events = loadEvents();
  console.log(`Total events: ${events.length}`);

  if (events.length === 0) {
    console.log('No funnel events recorded yet.\n');
    console.log('Events will appear after users interact with:');
    console.log('  /start — Telegram bot onboarding');
    console.log('  /trial — Free trial activation');
    console.log('  /plans — View pricing plans');
    return;
  }

  // Count unique users per stage
  const stageUsers: Record<string, Set<string>> = {};
  const stageCounts: Record<string, number> = {};
  const sourceBreakdown: Record<string, number> = {};

  for (const e of events) {
    if (!stageUsers[e.event]) stageUsers[e.event] = new Set();
    stageUsers[e.event].add(e.chat_id);
    stageCounts[e.event] = (stageCounts[e.event] || 0) + 1;
    sourceBreakdown[e.source] = (sourceBreakdown[e.source] || 0) + 1;
  }

  // Funnel display
  console.log('\n--- Funnel Stages ---');
  let prevCount = 0;
  for (const stage of STAGE_ORDER) {
    const uniqueUsers = stageUsers[stage]?.size || 0;
    const totalEvents = stageCounts[stage] || 0;
    const dropOff = prevCount > 0 ? Math.round((1 - uniqueUsers / prevCount) * 100) : 0;
    const dropStr = prevCount > 0 ? ` (${dropOff}% drop-off)` : '';

    if (totalEvents > 0) {
      console.log(`  ${stage}: ${uniqueUsers} unique users, ${totalEvents} events${dropStr}`);
      prevCount = uniqueUsers;
    }
  }

  // Source breakdown
  console.log('\n--- Traffic Sources ---');
  for (const [source, count] of Object.entries(sourceBreakdown).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${source}: ${count} events`);
  }

  // Conversion rates
  const startUsers = stageUsers['start']?.size || 0;
  const trialClicks = stageUsers['trial_click']?.size || 0;
  const checkouts = stageUsers['checkout_created']?.size || 0;

  console.log('\n--- Conversion Rates ---');
  if (startUsers > 0) {
    console.log(`  Start → Trial Click: ${Math.round((trialClicks / startUsers) * 100)}%`);
    console.log(`  Start → Checkout: ${Math.round((checkouts / startUsers) * 100)}%`);
  }
  if (trialClicks > 0) {
    console.log(`  Trial Click → Checkout: ${Math.round((checkouts / trialClicks) * 100)}%`);
  }

  // Save report
  const report = {
    generated_at: new Date().toISOString(),
    total_events: events.length,
    unique_users: new Set(events.map(e => e.chat_id)).size,
    stages: Object.fromEntries(STAGE_ORDER.map(s => [s, { unique_users: stageUsers[s]?.size || 0, total_events: stageCounts[s] || 0 }])),
    sources: sourceBreakdown,
    conversion: {
      start_to_trial: startUsers > 0 ? Math.round((trialClicks / startUsers) * 100) : 0,
      start_to_checkout: startUsers > 0 ? Math.round((checkouts / startUsers) * 100) : 0,
      trial_to_checkout: trialClicks > 0 ? Math.round((checkouts / trialClicks) * 100) : 0,
    },
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(`\nReport saved: ${REPORT_PATH}`);
}

main();
