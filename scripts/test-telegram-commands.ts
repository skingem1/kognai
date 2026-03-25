#!/usr/bin/env ts-node

/**
 * Sprint 1039: Telegram bot command smoke tester
 * Imports all synchronous command handlers and validates they return strings without throwing.
 * Usage: npx ts-node scripts/test-telegram-commands.ts
 */

// Sync commands from cmd-system.ts
import { cmdPm2, cmdHealth, cmdTier, cmdSprint, cmdReport, cmdCrons, cmdTikTokAuth, cmdQuickStart, cmdEnvCheck, cmdReadiness, cmdGitStats, cmdSwarmStats, cmdErrors, cmdTokenCheck, cmdLogs, cmdPreflight, cmdChangelog, cmdBrainxStatus, cmdSwarmHealth, cmdBrowserTest, cmdGodman, cmdGodmanThread, cmdPm2Errors, cmdGodmanChangelog, cmdGodmanLaunch, cmdGodmanNpmCheck, cmdGodmanPreflight, cmdGodmanPublish, cmdGodmanStatusPage, cmdGodmanTag, cmdStripeStatus } from './telegram-commands/cmd-system';

// Sync commands from cmd-gate.ts
import { cmdGate, cmdGoLive, cmdAudit, cmdStreak, cmdPace, cmdCalendar, cmdGateAudit, cmdGateRefresh, cmdGateSim } from './telegram-commands/cmd-gate';
import { cmdDemos, cmdAchiriDeploy, cmdAchiriPing } from './telegram-commands/cmd-spielberg';

// Sync commands from cmd-content.ts
import { cmdRecord, cmdQueue, cmdReview, cmdCaption, cmdPosted, cmdOnboard, cmdPipeline, cmdToday, cmdAnalytics, cmdDiversity, cmdThumbnail, cmdCompetitor, cmdStats, cmdQuality, cmdRadar, cmdBacktest, cmdFormatStats, cmdManifesto, cmdValErrors, cmdCaptionNext } from './telegram-commands/cmd-content';

// Sync commands from cmd-posting.ts
import { cmdMetrics, cmdPostPlan, cmdYouTube, cmdAutoPost, cmdLastRun, cmdViral, cmdDashboard, cmdDigest, cmdSchedule, cmdLeaderboard, cmdBestTime, cmdHookTest, cmdHookStats, cmdViralStats, cmdQueueOpt, cmdGateAnalytics, cmdRevenue, cmdBatch, cmdPostLog, cmdXPost, cmdCosts, cmdWeeklyDigest, cmdPostNext, cmdPostingHealth, cmdBulkCaptions } from './telegram-commands/cmd-posting';

// Sync commands from cmd-management.ts
import { cmdHistory, cmdArchive, cmdUnarchive, cmdStale, cmdPurge, cmdNote, cmdUpdateViews, cmdExport, cmdWeeklyReport, cmdSpeakerTest, cmdFilmKit, cmdContentPlan, cmdSuggest, cmdCompare, cmdScorecard, cmdProgress, cmdCleanup, cmdDedup, cmdTop30, cmdAbResults, cmdStatus, cmdReplenish, cmdEnrich, cmdBlockers, cmdSprintNext, cmdLog, cmdLaunches, cmdPostPulse, cmdNextActions, cmdBotTest } from './telegram-commands/cmd-management';

// Sync commands from cmd-delivery.ts
import { cmdInventory } from './telegram-commands/cmd-delivery';

// Sync commands from cmd-stripe.ts
import { cmdPortal, cmdFunnel, cmdAchiri, cmdAlpha, cmdUsage, cmdAchiriData, cmdWaitlist, cmdStripe, cmdDeployStatus, cmdInviteAchiri, cmdAchiriStats, cmdAchiriBotSetup, cmdAchiriLaunch } from './telegram-commands/cmd-stripe';

// Sync commands from cmd-warmup.ts
import { cmdWarmupStart, cmdWarmupStatus } from './telegram-commands/cmd-warmup';

// Sync commands from cmd-help.ts
import { cmdHelp } from './telegram-commands/cmd-help';

// Sync commands from cmd-lora-eval.ts
import { cmdLoraEval } from './telegram-commands/cmd-lora-eval';

// ─── Test runner ────────────────────────────────────────────────────

interface TestCase {
  name: string;
  fn: () => string | Promise<string>;
}

const tests: TestCase[] = [
  // cmd-system.ts
  { name: 'cmdPm2', fn: () => cmdPm2() },
  { name: 'cmdHealth', fn: () => cmdHealth() },
  { name: 'cmdTier', fn: () => cmdTier() },
  { name: 'cmdSprint', fn: () => cmdSprint() },
  { name: 'cmdReport', fn: () => cmdReport() },
  { name: 'cmdCrons', fn: () => cmdCrons() },
  { name: 'cmdTikTokAuth', fn: () => cmdTikTokAuth() },
  { name: 'cmdQuickStart', fn: () => cmdQuickStart() },
  { name: 'cmdEnvCheck', fn: () => cmdEnvCheck() },
  { name: 'cmdReadiness', fn: () => cmdReadiness() },
  { name: 'cmdGitStats', fn: () => cmdGitStats() },
  { name: 'cmdSwarmStats', fn: () => cmdSwarmStats() },
  { name: 'cmdErrors', fn: () => cmdErrors() },
  { name: 'cmdTokenCheck', fn: () => cmdTokenCheck() },
  { name: 'cmdLogs', fn: () => cmdLogs() },
  { name: 'cmdPreflight', fn: () => cmdPreflight() },
  { name: 'cmdChangelog', fn: () => cmdChangelog() },
  { name: 'cmdBrainxStatus', fn: () => cmdBrainxStatus() },
  { name: 'cmdSwarmHealth', fn: () => cmdSwarmHealth() },
  { name: 'cmdBrowserTest', fn: () => cmdBrowserTest() },
  { name: 'cmdGodman', fn: () => cmdGodman() },
  { name: 'cmdGodmanThread', fn: () => cmdGodmanThread() },
  { name: 'cmdPm2Errors', fn: () => cmdPm2Errors() },
  { name: 'cmdGodmanChangelog', fn: () => cmdGodmanChangelog() },
  { name: 'cmdGodmanLaunch', fn: () => cmdGodmanLaunch() },
  { name: 'cmdGodmanNpmCheck', fn: () => cmdGodmanNpmCheck() },
  { name: 'cmdGodmanPreflight', fn: () => cmdGodmanPreflight() },
  { name: 'cmdGodmanPublish', fn: () => cmdGodmanPublish() },
  { name: 'cmdGodmanStatusPage', fn: () => cmdGodmanStatusPage() },
  { name: 'cmdGodmanTag', fn: () => cmdGodmanTag() },
  { name: 'cmdStripeStatus', fn: () => cmdStripeStatus() },

  // cmd-gate.ts
  { name: 'cmdGate', fn: () => cmdGate() },
  { name: 'cmdGoLive', fn: () => cmdGoLive() },
  { name: 'cmdAudit', fn: () => cmdAudit() },
  { name: 'cmdStreak', fn: () => cmdStreak() },
  { name: 'cmdPace', fn: () => cmdPace() },
  { name: 'cmdCalendar', fn: () => cmdCalendar() },
  { name: 'cmdGateAudit', fn: () => cmdGateAudit() },
  { name: 'cmdGateRefresh', fn: () => cmdGateRefresh() },
  { name: 'cmdGateSim', fn: () => cmdGateSim() },

  // cmd-spielberg.ts
  { name: 'cmdDemos', fn: () => cmdDemos() },
  { name: 'cmdAchiriDeploy', fn: () => cmdAchiriDeploy('--dry-run') },
  { name: 'cmdAchiriPing', fn: () => cmdAchiriPing() },

  // cmd-content.ts
  { name: 'cmdRecord', fn: () => cmdRecord('') },
  { name: 'cmdQueue', fn: () => cmdQueue() },
  { name: 'cmdReview', fn: () => cmdReview() },
  { name: 'cmdCaption', fn: () => cmdCaption('') },
  { name: 'cmdPosted', fn: () => cmdPosted() },
  { name: 'cmdOnboard', fn: () => cmdOnboard() },
  { name: 'cmdPipeline', fn: () => cmdPipeline() },
  { name: 'cmdToday', fn: () => cmdToday() },
  { name: 'cmdAnalytics', fn: () => cmdAnalytics() },
  { name: 'cmdDiversity', fn: () => cmdDiversity() },
  { name: 'cmdThumbnail', fn: () => cmdThumbnail('') },
  { name: 'cmdCompetitor', fn: () => cmdCompetitor('') },
  { name: 'cmdStats', fn: () => cmdStats() },
  { name: 'cmdQuality', fn: () => cmdQuality() },
  { name: 'cmdRadar', fn: () => cmdRadar() },
  { name: 'cmdBacktest', fn: () => cmdBacktest() },
  { name: 'cmdFormatStats', fn: () => cmdFormatStats() },
  { name: 'cmdManifesto', fn: () => cmdManifesto() },
  { name: 'cmdValErrors', fn: () => cmdValErrors() },
  { name: 'cmdCaptionNext', fn: () => cmdCaptionNext() },

  // cmd-posting.ts
  { name: 'cmdMetrics', fn: () => cmdMetrics() },
  { name: 'cmdPostPlan', fn: () => cmdPostPlan() },
  { name: 'cmdYouTube', fn: () => cmdYouTube() },
  { name: 'cmdAutoPost', fn: () => cmdAutoPost() },
  { name: 'cmdLastRun', fn: () => cmdLastRun() },
  { name: 'cmdViral', fn: () => cmdViral() },
  { name: 'cmdDashboard', fn: () => cmdDashboard() },
  { name: 'cmdDigest', fn: () => cmdDigest() },
  { name: 'cmdSchedule', fn: () => cmdSchedule() },
  { name: 'cmdLeaderboard', fn: () => cmdLeaderboard() },
  { name: 'cmdBestTime', fn: () => cmdBestTime() },
  { name: 'cmdHookTest', fn: () => cmdHookTest() },
  { name: 'cmdHookStats', fn: () => cmdHookStats() },
  { name: 'cmdViralStats', fn: () => cmdViralStats() },
  { name: 'cmdQueueOpt', fn: () => cmdQueueOpt() },
  { name: 'cmdGateAnalytics', fn: () => cmdGateAnalytics() },
  { name: 'cmdRevenue', fn: () => cmdRevenue() },
  { name: 'cmdBatch', fn: () => cmdBatch('') },
  { name: 'cmdPostLog', fn: () => cmdPostLog() },
  { name: 'cmdXPost', fn: () => cmdXPost('') },
  { name: 'cmdCosts', fn: () => cmdCosts() },
  { name: 'cmdWeeklyDigest', fn: () => cmdWeeklyDigest() },
  { name: 'cmdPostNext', fn: () => cmdPostNext() },
  { name: 'cmdPostingHealth', fn: () => cmdPostingHealth() },
  { name: 'cmdBulkCaptions', fn: () => cmdBulkCaptions() },

  // cmd-management.ts
  { name: 'cmdHistory', fn: () => cmdHistory() },
  { name: 'cmdArchive', fn: () => cmdArchive('') },
  { name: 'cmdUnarchive', fn: () => cmdUnarchive('') },
  { name: 'cmdStale', fn: () => cmdStale('') },
  { name: 'cmdPurge', fn: () => cmdPurge('') },
  { name: 'cmdNote', fn: () => cmdNote('') },
  { name: 'cmdUpdateViews', fn: () => cmdUpdateViews('') },
  { name: 'cmdExport', fn: () => cmdExport('') },
  { name: 'cmdWeeklyReport', fn: () => cmdWeeklyReport() },
  { name: 'cmdSpeakerTest', fn: () => cmdSpeakerTest() },
  { name: 'cmdFilmKit', fn: () => cmdFilmKit() },
  { name: 'cmdContentPlan', fn: () => cmdContentPlan() },
  { name: 'cmdSuggest', fn: () => cmdSuggest() },
  { name: 'cmdCompare', fn: () => cmdCompare('') },
  { name: 'cmdScorecard', fn: () => cmdScorecard() },
  { name: 'cmdProgress', fn: () => cmdProgress() },
  { name: 'cmdCleanup', fn: () => cmdCleanup() },
  { name: 'cmdDedup', fn: () => cmdDedup() },
  { name: 'cmdTop30', fn: () => cmdTop30() },
  { name: 'cmdAbResults', fn: () => cmdAbResults() },
  { name: 'cmdStatus', fn: () => cmdStatus() },
  { name: 'cmdReplenish', fn: () => cmdReplenish() },
  { name: 'cmdEnrich', fn: () => cmdEnrich() },
  { name: 'cmdBlockers', fn: () => cmdBlockers() },
  { name: 'cmdSprintNext', fn: () => cmdSprintNext() },
  { name: 'cmdLog', fn: () => cmdLog() },
  { name: 'cmdLaunches', fn: () => cmdLaunches() },
  { name: 'cmdPostPulse', fn: () => cmdPostPulse() },
  { name: 'cmdNextActions', fn: () => cmdNextActions() },
  { name: 'cmdBotTest', fn: () => cmdBotTest() },

  // cmd-delivery.ts
  { name: 'cmdInventory', fn: () => cmdInventory() },

  // cmd-stripe.ts
  { name: 'cmdPortal', fn: () => cmdPortal('') },
  { name: 'cmdFunnel', fn: () => cmdFunnel() },
  { name: 'cmdAchiri', fn: () => cmdAchiri() },
  { name: 'cmdAlpha', fn: () => cmdAlpha() },
  { name: 'cmdUsage', fn: () => cmdUsage() },
  { name: 'cmdAchiriData', fn: () => cmdAchiriData() },
  { name: 'cmdWaitlist', fn: () => cmdWaitlist('') },
  { name: 'cmdStripe', fn: () => cmdStripe() },
  { name: 'cmdDeployStatus', fn: () => cmdDeployStatus() },
  { name: 'cmdInviteAchiri', fn: () => cmdInviteAchiri('') },
  { name: 'cmdAchiriStats', fn: () => cmdAchiriStats() },
  { name: 'cmdAchiriBotSetup', fn: () => cmdAchiriBotSetup() },
  { name: 'cmdAchiriLaunch', fn: () => cmdAchiriLaunch() },

  // cmd-warmup.ts
  { name: 'cmdWarmupStart', fn: () => cmdWarmupStart() },
  { name: 'cmdWarmupStatus', fn: () => cmdWarmupStatus() },

  // cmd-help.ts
  { name: 'cmdHelp', fn: () => cmdHelp() },

  // cmd-lora-eval.ts
  { name: 'cmdLoraEval', fn: () => cmdLoraEval() },
];

// ─── Execute ────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;
const failures: { name: string; error: string }[] = [];

async function runTests() {
  for (const t of tests) {
    try {
      let result = t.fn();
      // Support async commands (e.g. cmdRevenue queries Stripe API)
      if (result && typeof (result as any).then === 'function') {
        result = await (result as any);
      }
      if (typeof result !== 'string') {
        throw new Error(`Expected string, got ${typeof result}`);
      }
      pass++;
      process.stdout.write(`  PASS  ${t.name}\n`);
    } catch (err: any) {
      fail++;
      const msg = err?.message || String(err);
      failures.push({ name: t.name, error: msg.slice(0, 120) });
      process.stdout.write(`  FAIL  ${t.name}: ${msg.slice(0, 80)}\n`);
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${pass} PASS / ${fail} FAIL / ${tests.length} total`);

  if (failures.length > 0) {
    console.log(`\nFailures:`);
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.error}`);
    }
  }

  process.exit(fail > 0 ? 1 : 0);
}

runTests();
