#!/usr/bin/env ts-node
/**
 * validate-all-bot-commands.ts — Sprint 671
 * Comprehensive smoke test: calls every sync Telegram command function
 * and verifies it returns a non-empty string without throwing.
 *
 * Skips async commands (deliver, post-now, etc.) as they call Telegram API.
 *
 * Usage: npx ts-node --transpile-only scripts/scs001/validate-all-bot-commands.ts
 */

import * as path from 'path';

// Ensure dotenv is loaded so commands that read env vars don't crash
try { require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') }); } catch {}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => string | undefined): void {
  try {
    const result = fn();
    if (typeof result === 'string' && result.length > 0) {
      console.log(`  ✅ /${name} — ${result.length} chars`);
      passed++;
    } else {
      console.log(`  ❌ /${name} — empty or non-string result`);
      failed++;
      failures.push(`/${name}: empty result`);
    }
  } catch (e: any) {
    const msg = e.message?.slice(0, 120) || 'unknown error';
    console.log(`  ❌ /${name} — THREW: ${msg}`);
    failed++;
    failures.push(`/${name}: ${msg}`);
  }
}

console.log('\n══════════════════════════════════════════════');
console.log('  Sprint 671 — All Bot Commands Smoke Test');
console.log('══════════════════════════════════════════════\n');

// ── Import sync command modules ──────────────────────────────────────────────

import {
  cmdPm2, cmdHealth, cmdTier, cmdSprint, cmdReport, cmdCrons,
  cmdTikTokAuth, cmdQuickStart, cmdEnvCheck, cmdStripeStatus,
  cmdReadiness, cmdGitStats, cmdBoot, cmdShutdown, cmdReload,
  cmdSwarmStats, cmdErrors, cmdTokenCheck, cmdLogs, cmdChangelog,
  cmdPreflight,
} from '../telegram-commands/cmd-system';

import {
  cmdGate, cmdGoLive, cmdAudit, cmdStreak, cmdPace, cmdCalendar,
} from '../telegram-commands/cmd-gate';

import {
  cmdRecord, cmdQueue, cmdReview, cmdCaption, cmdPosted, cmdOnboard,
  cmdPipeline, cmdToday, cmdAnalytics, cmdDiversity, cmdThumbnail,
  cmdCompetitor, cmdStats, cmdQuality, cmdRadar, cmdBacktest,
  cmdFormatStats, cmdManifesto,
} from '../telegram-commands/cmd-content';

import {
  cmdMetrics, cmdPostPlan, cmdYouTube, cmdAutoPost, cmdLastRun,
  cmdViral, cmdDashboard, cmdDigest, cmdSchedule, cmdLeaderboard,
  cmdBestTime, cmdHookTest, cmdHookStats, cmdViralStats, cmdQueueOpt,
  cmdGateAnalytics, cmdRevenue, cmdBatch, cmdPostLog, cmdXPost,
  cmdCosts, cmdWeeklyDigest,
} from '../telegram-commands/cmd-posting';

import {
  cmdHistory, cmdArchive, cmdUnarchive, cmdStale, cmdPurge, cmdNote,
  cmdUpdateViews, cmdExport, cmdWeeklyReport, cmdSpeakerTest,
  cmdFilmKit, cmdContentPlan, cmdSuggest, cmdCompare, cmdScorecard,
  cmdProgress, cmdCleanup, cmdDedup, cmdTop30, cmdAbResults,
  cmdStatus, cmdReplenish,
} from '../telegram-commands/cmd-management';

import { cmdHelp } from '../telegram-commands/cmd-help';

// ── System commands ──────────────────────────────────────────────────────────

console.log('▸ System commands');
test('pm2',        () => cmdPm2());
test('health',     () => cmdHealth());
test('tier',       () => cmdTier());
test('sprint',     () => cmdSprint());
test('report',     () => cmdReport());
test('crons',      () => cmdCrons());
test('tiktokauth', () => cmdTikTokAuth());
test('quickstart', () => cmdQuickStart());
test('envcheck',   () => cmdEnvCheck());
test('readiness',  () => cmdReadiness());
test('gitstats',   () => cmdGitStats());
test('swarmstats', () => cmdSwarmStats());
test('errors',     () => cmdErrors());
test('tokencheck', () => cmdTokenCheck());
test('logs',       () => cmdLogs());
test('changelog',  () => cmdChangelog(5));
test('preflight',  () => cmdPreflight());
// cmdSmoke is async (sends Telegram messages) — skipped

// ── Gate commands ────────────────────────────────────────────────────────────

console.log('\n▸ Gate commands');
test('gate',     () => cmdGate());
test('golive',   () => cmdGoLive());
test('audit',    () => cmdAudit());
test('streak',   () => cmdStreak());
test('pace',     () => cmdPace());
test('calendar', () => cmdCalendar());

// ── Content commands ─────────────────────────────────────────────────────────

console.log('\n▸ Content commands');
test('record',     () => cmdRecord(''));         // usage hint expected
test('queue',      () => cmdQueue());
test('review',     () => cmdReview());
test('caption',    () => cmdCaption(''));         // usage hint expected
test('posted',     () => cmdPosted());
test('onboard',    () => cmdOnboard());
test('pipeline',   () => cmdPipeline());
test('today',      () => cmdToday());
test('analytics',  () => cmdAnalytics());
test('diversity',  () => cmdDiversity());
test('stats',      () => cmdStats());
test('quality',    () => cmdQuality());
test('radar',      () => cmdRadar());
test('backtest',   () => cmdBacktest());
test('formatstats',() => cmdFormatStats());
test('manifesto',  () => cmdManifesto());

// ── Posting commands ─────────────────────────────────────────────────────────

console.log('\n▸ Posting commands');
test('metrics',       () => cmdMetrics());
test('postplan',      () => cmdPostPlan());
test('youtube',       () => cmdYouTube());
test('autopost',      () => cmdAutoPost());
test('lastrun',       () => cmdLastRun());
test('viral',         () => cmdViral());
test('dashboard',     () => cmdDashboard());
test('digest',        () => cmdDigest());
test('schedule',      () => cmdSchedule());
test('leaderboard',   () => cmdLeaderboard());
test('besttime',      () => cmdBestTime());
test('hooktest',      () => cmdHookTest());
test('hookstats',     () => cmdHookStats());
test('viralstats',    () => cmdViralStats());
test('queueopt',      () => cmdQueueOpt());
test('gateanalytics', () => cmdGateAnalytics());
test('revenue',       () => cmdRevenue());
test('batch',         () => cmdBatch(''));
test('postlog',       () => cmdPostLog());
test('xpost',         () => cmdXPost(''));
test('costs',         () => cmdCosts());
test('weeklydigest',  () => cmdWeeklyDigest());

// ── Management commands ──────────────────────────────────────────────────────

console.log('\n▸ Management commands');
test('history',     () => cmdHistory());
test('stale',       () => cmdStale(''));
test('note',        () => cmdNote(''));           // usage hint expected
test('status',      () => cmdStatus());
test('dedup',       () => cmdDedup());
test('top30',       () => cmdTop30());
test('abresults',   () => cmdAbResults());
test('cleanup',     () => cmdCleanup());
test('progress',    () => cmdProgress());
test('scorecard',   () => cmdScorecard());
test('suggest',     () => cmdSuggest());
test('contentplan', () => cmdContentPlan());
test('filmkit',     () => cmdFilmKit());
test('speakertest', () => cmdSpeakerTest());
test('export',      () => cmdExport(''));
test('weeklyreport',() => cmdWeeklyReport());
test('compare',     () => cmdCompare(''));
test('replenish',   () => cmdReplenish());
test('updateviews', () => cmdUpdateViews(''));

// ── Help ─────────────────────────────────────────────────────────────────────

console.log('\n▸ Help');
test('help', () => cmdHelp());

// ── Summary ──────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failures.length > 0) {
  console.log('\n  Failures:');
  for (const f of failures) console.log(`    • ${f}`);
}
console.log('══════════════════════════════════════════════');
console.log(failed === 0 ? '\n✅ ALL COMMANDS PASS' : '\n❌ SOME COMMANDS FAILED');
process.exit(failed > 0 ? 1 : 0);
