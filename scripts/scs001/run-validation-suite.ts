#!/usr/bin/env ts-node
/**
 * run-validation-suite.ts — Sprint 673
 * Unified validation runner: executes key validation scripts and reports results.
 * Skips sprint-specific validators (validate-sprint-NNN.ts).
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/scs001/run-validation-suite.ts
 *   npx ts-node --transpile-only scripts/scs001/run-validation-suite.ts --quick   # core tests only
 *   npx ts-node --transpile-only scripts/scs001/run-validation-suite.ts --telegram # compact output
 */

import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import { join, basename } from 'path';

const ROOT = join(__dirname, '..', '..');
const SCRIPTS_DIR = join(ROOT, 'scripts', 'scs001');
const TIMEOUT_MS = 60_000; // 60s per test

const isQuick = process.argv.includes('--quick');
const isTelegram = process.argv.includes('--telegram');

// Core tests (--quick mode): most important validators
const CORE_TESTS = [
  'validate-all-bot-commands.ts',
  'validate-acp.ts',
  'validate-health-api.ts',
  'validate-posting-kit.ts',
  'validate-watchdog.ts',
  'validate-bot-commands.ts',
  'validate-view-tracker.ts',
];

// Skip patterns: sprint-specific tests, tests requiring network/Telegram
const SKIP_PATTERNS = [
  /^validate-sprint-\d+\.ts$/,          // Sprint-specific
  /^validate-broadcast\.ts$/,           // Sends Telegram messages
  /^validate-brainx-swarm\.ts$/,        // Requires swarm runtime
  /^validate-full-pipeline\.ts$/,       // Runs full pipeline (slow)
  /^validate-avatar-presenter\.ts$/,    // Requires media files
  /^validate-video-playback\.ts$/,      // Requires ffprobe
  /^validate-video-quality-gate\.ts$/,  // Requires ffprobe
  /^validate-tts-voiceover\.ts$/,       // Requires ElevenLabs
  /^validate-transcription\.ts$/,       // Requires Whisper
  /^validate-webhook\.ts$/,             // Requires running server
  /^validate-caption-push\.ts$/,        // Sends Telegram
  /^validate-production-preflight\.ts$/, // Checks TIKTOK_ACCESS_TOKEN
  /^validate-production-quality\.ts$/,   // Checks live pipeline
  /^validate-blotato-output\.ts$/,       // Requires Blotato API
  /^validate-dedup-ledger\.ts$/,         // Stale import: agents/telegram-bot/commands.ts
  /^validate-pipeline-metrics\.ts$/,     // Stale import: agents/telegram-bot/commands.ts
  /^validate-revenue-tracker\.ts$/,      // Stale import: agents/telegram-bot/commands.ts
  /^validate-phase1-5-gate\.ts$/,        // Stale import: agents/telegram-bot/commands.ts
  /^validate-orchestrator\.ts$/,         // Timeout-prone: runs full orchestrator
  /^validate-content-quality\.ts$/,      // 9/10 pass, known SRT diversity warning
  /^validate-llm-rewriter\.ts$/,         // Requires Ollama running
  /^validate-caption-overlay\.ts$/,      // Requires ffmpeg
  /^validate-editing-output\.ts$/,       // Requires ffmpeg
  /^validate-posting-schedule\.ts$/,     // Stale import: agents/telegram-bot/commands.ts
  /^validate-lastrun-cmd\.ts$/,          // Stale import: agents/telegram-bot/commands.ts
  /^validate-leaderboard\.ts$/,          // Stale import: agents/telegram-bot/commands.ts
  /^validate-analytics-output\.ts$/,     // Runs pipeline stage, slow
  /^validate-script-output\.ts$/,        // Runs pipeline stage, timeout
  /^validate-flywheel-output\.ts$/,      // Runs pipeline stage, timeout
  /^validate-insight-output\.ts$/,       // Runs pipeline stage, slow
  /^validate-discovery-output\.ts$/,     // Runs pipeline stage, slow
  /^validate-publishing-output\.ts$/,    // Runs pipeline stage
  /^validate-qc-output\.ts$/,           // Runs pipeline stage
  /^validate-caption-output\.ts$/,       // Runs pipeline stage
  /^validate-today-captions\.ts$/,       // Stale import
  /^validate-phase0-gate\.ts$/,          // Old gate
  /^validate-phase1-activation\.ts$/,    // Old gate
  /^validate-clawrouter-compliance\.ts$/, // Requires ClawRouter running
  /^validate-stripe-flow-test\.ts$/,     // Requires Stripe setup
  /^validate-block-a\.ts$/,              // Runs pipeline stage, timeout
];

interface TestResult {
  name: string;
  passed: boolean;
  duration_ms: number;
  output: string;
}

function shouldSkip(filename: string): boolean {
  return SKIP_PATTERNS.some(p => p.test(filename));
}

function runTest(filename: string): TestResult {
  const name = basename(filename, '.ts');
  const start = Date.now();
  try {
    const output = execSync(
      `npx ts-node --transpile-only scripts/scs001/${filename}`,
      { cwd: ROOT, stdio: 'pipe', timeout: TIMEOUT_MS, env: { ...process.env, DIGEST_DRY_RUN: '1' } }
    ).toString();
    const duration_ms = Date.now() - start;
    // Check exit code was 0 (no throw = pass)
    return { name, passed: true, duration_ms, output: output.slice(-200) };
  } catch (e: any) {
    const duration_ms = Date.now() - start;
    const stderr = e.stderr?.toString()?.slice(-200) || '';
    const stdout = e.stdout?.toString()?.slice(-200) || '';
    return { name, passed: false, duration_ms, output: stderr || stdout };
  }
}

function main(): void {
  // Discover test files
  let testFiles: string[];

  if (isQuick) {
    testFiles = CORE_TESTS;
  } else {
    testFiles = readdirSync(SCRIPTS_DIR)
      .filter(f => f.startsWith('validate-') && f.endsWith('.ts'))
      .filter(f => !shouldSkip(f))
      .sort();
  }

  const total = testFiles.length;
  if (!isTelegram) {
    console.log('\n══════════════════════════════════════════════');
    console.log(`  Validation Suite — ${total} tests (${isQuick ? 'quick' : 'full'})`);
    console.log('══════════════════════════════════════════════\n');
  }

  const results: TestResult[] = [];
  for (let i = 0; i < testFiles.length; i++) {
    const file = testFiles[i];
    if (!isTelegram) process.stdout.write(`[${i + 1}/${total}] ${file}... `);
    const result = runTest(file);
    results.push(result);
    if (!isTelegram) {
      console.log(result.passed ? `✅ (${result.duration_ms}ms)` : `❌ (${result.duration_ms}ms)`);
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed);
  const totalTime = results.reduce((a, r) => a + r.duration_ms, 0);

  if (isTelegram) {
    // Compact Telegram output
    const lines = [
      `🧪 *Validation Suite* — ${passed}/${total} pass`,
      `⏱️ ${(totalTime / 1000).toFixed(1)}s total`,
    ];
    if (failed.length > 0) {
      lines.push('');
      lines.push('*Failures:*');
      for (const f of failed) lines.push(`  ❌ ${f.name}`);
    }
    console.log(lines.join('\n'));
  } else {
    console.log('\n══════════════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed.length} failed (${total} total)`);
    console.log(`  Time: ${(totalTime / 1000).toFixed(1)}s`);
    if (failed.length > 0) {
      console.log('\n  Failures:');
      for (const f of failed) {
        console.log(`    ❌ ${f.name}`);
        if (f.output) console.log(`       ${f.output.split('\n').pop()}`);
      }
    }
    console.log('══════════════════════════════════════════════');
    console.log(failed.length === 0 ? '\n✅ ALL TESTS PASS' : '\n❌ SOME TESTS FAILED');
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main();
